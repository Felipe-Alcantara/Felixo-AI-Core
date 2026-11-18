'use strict'

/**
 * Plugins e extensões das CLIs, por conta.
 *
 * Instalar um plugin é executar código de terceiros, então o serviço só age
 * sobre o que a CLI da conta informa e só muda algo com `confirmed === true`
 * (a pessoa escolheu e confirmou na interface). Medido nesta máquina, com
 * pasta temporária no lugar do perfil:
 *
 * | CLI    | Lista                                   | Muda                                  |
 * |--------|-----------------------------------------|---------------------------------------|
 * | claude | `plugin list --json [--available]`      | install / uninstall / enable / disable / update |
 * | codex  | `plugin list --json [--available]`      | add / remove (sem ligar/desligar/atualizar)     |
 * | gemini | `extensions list -o json` (sem catálogo)| install <url https> / uninstall / enable / disable / update |
 *
 * Decisões de segurança: nunca passa `-y`/`--accept-command` ao Claude (um
 * plugin que instala rodando comando do marketplace é recusado, não aceito às
 * cegas); só age no escopo `user` da conta (o projeto aberto não é tocado); o
 * Gemini só instala por URL https; a chave de API da conta não vai no ambiente.
 */

const PROVIDERS = new Set(['claude', 'codex', 'gemini'])
const LIST_TIMEOUT_MS = 60 * 1000
const MUTATE_TIMEOUT_MS = 3 * 60 * 1000
const LIST_OUTPUT_LIMIT = 16 * 1024 * 1024
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/
const SECRET_ENV_NAMES = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY']
const MAX_TEXT = { name: 120, description: 400, origin: 300, message: 500 }

/** Ações por CLI: o que a interface pode oferecer é o que a CLI sabe fazer. */
const CAPABILITIES = {
  claude: { available: true, marketplaces: true, toggle: true, update: true, installBySource: false },
  codex: { available: true, marketplaces: true, toggle: false, update: false, installBySource: false },
  gemini: { available: false, marketplaces: false, toggle: true, update: true, installBySource: true },
}

function cleanText(value, max) {
  if (typeof value !== 'string') return ''
  return value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max)
}

function parseJson(text) {
  try {
    return JSON.parse(String(text ?? '').trim())
  } catch {
    return undefined
  }
}

/** O JSON da CLI pode vir com linhas de aviso antes; pega a partir do primeiro `{`/`[`. */
function parseJsonLoose(text) {
  const whole = parseJson(text)
  if (whole !== undefined) return whole
  const raw = String(text ?? '')
  const start = raw.search(/[[{]/)
  return start >= 0 ? parseJson(raw.slice(start)) : undefined
}

function describeSource(source) {
  if (typeof source === 'string') return cleanText(source, MAX_TEXT.origin)
  if (!source || typeof source !== 'object') return ''
  const base = source.url ?? source.repo ?? source.path ?? source.source ?? ''
  const where = typeof source.path === 'string' && base !== source.path ? ` (${source.path})` : ''
  return cleanText(`${typeof base === 'string' ? base : ''}${where}`, MAX_TEXT.origin)
}

function splitId(id) {
  const at = id.lastIndexOf('@')
  return at > 0 ? { name: id.slice(0, at), marketplace: id.slice(at + 1) } : { name: id, marketplace: '' }
}

function normalizeEntry(raw, { installed }) {
  if (!raw || typeof raw !== 'object') return null
  const id = cleanText(raw.pluginId ?? raw.id ?? raw.name, MAX_TEXT.name + 100)
  if (!id) return null
  const parts = splitId(id)
  const marketplace = cleanText(raw.marketplaceName, MAX_TEXT.name) || parts.marketplace
  return {
    id,
    name: cleanText(raw.name, MAX_TEXT.name) || parts.name,
    description: cleanText(raw.description, MAX_TEXT.description),
    version: cleanText(typeof raw.version === 'string' ? raw.version : '', 60),
    marketplace,
    origin: describeSource(raw.source ?? raw.installMetadata?.source),
    installed,
    // `enabled` ausente (Gemini antigo, lista só de nomes) não vira "ligado".
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : null,
    scope: cleanText(raw.scope, 20) || null,
  }
}

function normalizeList(payload, { installed }) {
  const list = Array.isArray(payload) ? payload : []
  return list.map((raw) => normalizeEntry(raw, { installed })).filter(Boolean)
}

/** Claude e Codex: array simples (só instalados) ou `{ installed, available }`. */
function parsePluginList(stdout) {
  const payload = parseJsonLoose(stdout)
  if (Array.isArray(payload)) {
    return { installed: normalizeList(payload, { installed: true }), available: [] }
  }
  if (!payload || typeof payload !== 'object') return null
  const installedIds = new Set()
  const installed = normalizeList(payload.installed, { installed: true })
  installed.forEach((entry) => installedIds.add(entry.id))
  const available = normalizeList(payload.available, { installed: false }).filter(
    (entry) => !installedIds.has(entry.id),
  )
  return { installed, available }
}

function normalizeGeminiEntry(raw) {
  if (!raw || typeof raw !== 'object') return null
  const entry = normalizeEntry(
    { ...raw, enabled: raw.enabled ?? raw.isActive ?? raw.active },
    { installed: true },
  )
  return entry
}

/**
 * Gemini: `-o json` existe a partir da 0.69; sem ele, o texto
 * ("✓ nome (1.2.3)" seguido de linhas "Source: ..."), lido de forma defensiva.
 */
function parseGeminiList(stdout) {
  const payload = parseJsonLoose(stdout)
  if (Array.isArray(payload)) {
    return { installed: payload.map(normalizeGeminiEntry).filter(Boolean), available: [] }
  }
  const text = String(stdout ?? '')
  if (/no extensions installed/i.test(text)) return { installed: [], available: [] }
  const installed = []
  for (const line of text.split(/\r?\n/)) {
    const head = /^\s*\S?\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s+\(([^)]+)\)\s*$/.exec(line)
    if (head) {
      installed.push(normalizeEntry({ name: head[1], version: head[2] }, { installed: true }))
      continue
    }
    const source = /^\s*Source:\s*(\S.*)$/i.exec(line)
    const last = installed[installed.length - 1]
    if (source && last) last.origin = cleanText(source[1], MAX_TEXT.origin)
  }
  return installed.length > 0 ? { installed, available: [] } : null
}

function parseMarketplaces(stdout) {
  const payload = parseJsonLoose(stdout)
  const list = Array.isArray(payload) ? payload : Array.isArray(payload?.marketplaces) ? payload.marketplaces : []
  return list
    .filter((item) => item && typeof item === 'object' && typeof item.name === 'string')
    .map((item) => ({
      name: cleanText(item.name, MAX_TEXT.name),
      origin: describeSource(item.repo ?? item.url ?? item.path ?? item.root ?? item.source),
    }))
}

function isValidPluginId(providerId, id) {
  if (typeof id !== 'string') return false
  const { name, marketplace } = splitId(id)
  if (!NAME_PATTERN.test(name)) return false
  if (providerId === 'gemini') return marketplace === ''
  return marketplace === '' || NAME_PATTERN.test(marketplace)
}

function validateGeminiSource(source) {
  if (typeof source !== 'string' || source.length > 300 || /[\s\u0000-\u001f]/.test(source)) return null
  try {
    const url = new URL(source)
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null
  } catch {
    return null
  }
}

function firstMessage(result, fallback) {
  const json = parseJsonLoose(result.stdout)
  const own = typeof json?.message === 'string' ? json.message : ''
  return cleanText(own || result.message || result.stderr || fallback, MAX_TEXT.message)
}

/**
 * @param {object} deps
 * @param {(providerId: string, accountId?: string) => { ok: boolean, message?: string, env?: object }} deps.resolveAccountEnv
 *   Valida a conta e devolve o ambiente completo do processo auxiliar.
 * @param {Function} deps.runCommand - `runBufferedCommand`; injetável nos testes.
 */
function createCliPluginsService({ resolveAccountEnv, runCommand }) {
  const busy = new Set()

  function prepare(providerId, accountId) {
    if (!PROVIDERS.has(providerId)) return { ok: false, message: 'Escolha Claude, Codex ou Gemini.' }
    const resolved = resolveAccountEnv(providerId, accountId)
    if (!resolved?.ok) return { ok: false, message: resolved?.message ?? 'Conta inválida.' }
    const env = { ...resolved.env }
    for (const name of SECRET_ENV_NAMES) delete env[name]
    return { ok: true, env, key: `${providerId}:${accountId ?? ''}` }
  }

  function run(providerId, env, args, options = {}) {
    return runCommand({
      command: providerId,
      args,
      env,
      timeoutMs: options.timeoutMs ?? LIST_TIMEOUT_MS,
      ...(options.outputLimit ? { outputLimit: options.outputLimit } : {}),
    })
  }

  async function list({ providerId, accountId, includeAvailable = false } = {}) {
    const ctx = prepare(providerId, accountId)
    if (!ctx.ok) return ctx
    const caps = CAPABILITIES[providerId]
    const wantsAvailable = includeAvailable === true && caps.available
    const listArgs =
      providerId === 'gemini'
        ? ['extensions', 'list', '-o', 'json']
        : ['plugin', 'list', '--json', ...(wantsAvailable ? ['--available'] : [])]

    const result = await run(providerId, ctx.env, listArgs, { outputLimit: LIST_OUTPUT_LIMIT })
    if (!result.ok) {
      return { ok: false, message: firstMessage(result, 'A CLI não listou os plugins.') }
    }
    const parsed = providerId === 'gemini' ? parseGeminiList(result.stdout) : parsePluginList(result.stdout)
    if (!parsed) {
      return { ok: false, message: 'A CLI respondeu num formato que o app não reconhece.' }
    }

    let marketplaces = []
    if (caps.marketplaces) {
      const mk = await run(providerId, ctx.env, ['plugin', 'marketplace', 'list', '--json'])
      marketplaces = mk.ok ? parseMarketplaces(mk.stdout) : []
    }

    return { ok: true, capabilities: caps, ...parsed, marketplaces }
  }

  async function mutate({ providerId, accountId, confirmed }, buildArgs) {
    // Sem confirmação explícita nada muda: é o que impede instalar sozinho.
    if (confirmed !== true) {
      return { ok: false, requiresConfirmation: true, message: 'A alteração exige confirmação explícita.' }
    }
    const ctx = prepare(providerId, accountId)
    if (!ctx.ok) return ctx
    const args = buildArgs(CAPABILITIES[providerId])
    if (!Array.isArray(args)) return { ok: false, message: args?.message ?? 'Ação indisponível nesta CLI.' }
    if (busy.has(ctx.key)) {
      return { ok: false, message: 'Já há uma alteração de plugin em andamento nesta conta.' }
    }
    busy.add(ctx.key)
    try {
      const result = await run(providerId, ctx.env, args, { timeoutMs: MUTATE_TIMEOUT_MS })
      const json = parseJsonLoose(result.stdout)
      const failed = !result.ok || json?.outcome === 'error'
      return { ok: !failed, message: firstMessage(result, failed ? 'A CLI recusou a alteração.' : 'Concluído.') }
    } finally {
      busy.delete(ctx.key)
    }
  }

  const invalidId = { message: 'Identificador de plugin inválido.' }

  return {
    list,
    capabilities: (providerId) => CAPABILITIES[providerId] ?? null,

    install: ({ pluginId, source, ...rest }) =>
      mutate(rest, (caps) => {
        if (caps.installBySource) {
          const url = validateGeminiSource(source)
          return url
            ? ['extensions', 'install', url, '--consent', '--skip-settings']
            : { message: 'Informe o endereço https do repositório da extensão.' }
        }
        if (!isValidPluginId(rest.providerId, pluginId)) return invalidId
        return rest.providerId === 'claude'
          ? ['plugin', 'install', pluginId, '--scope', 'user', '--json']
          : ['plugin', 'add', pluginId, '--json']
      }),

    remove: ({ pluginId, ...rest }) =>
      mutate(rest, () => {
        if (!isValidPluginId(rest.providerId, pluginId)) return invalidId
        if (rest.providerId === 'gemini') return ['extensions', 'uninstall', pluginId]
        return rest.providerId === 'claude'
          ? ['plugin', 'uninstall', pluginId, '--scope', 'user', '--json']
          : ['plugin', 'remove', pluginId, '--json']
      }),

    setEnabled: ({ pluginId, enabled, ...rest }) =>
      mutate(rest, (caps) => {
        if (!caps.toggle) return { message: 'Esta CLI não liga nem desliga plugins.' }
        if (!isValidPluginId(rest.providerId, pluginId)) return invalidId
        const verb = enabled === true ? 'enable' : 'disable'
        return rest.providerId === 'gemini'
          ? ['extensions', verb, pluginId]
          : ['plugin', verb, pluginId, '--scope', 'user', '--json']
      }),

    update: ({ pluginId, ...rest }) =>
      mutate(rest, (caps) => {
        if (!caps.update) return { message: 'Esta CLI não atualiza plugins pelo app.' }
        if (!isValidPluginId(rest.providerId, pluginId)) return invalidId
        return rest.providerId === 'gemini'
          ? ['extensions', 'update', pluginId]
          : ['plugin', 'update', pluginId, '--scope', 'user', '--json']
      }),
  }
}

module.exports = {
  CAPABILITIES,
  createCliPluginsService,
  isValidPluginId,
  parseGeminiList,
  parsePluginList,
  validateGeminiSource,
}
