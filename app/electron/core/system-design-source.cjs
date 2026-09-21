'use strict'

/**
 * @module system-design-source
 * Contrato único da fonte do System Design (repositório + branch) e do estado
 * de sincronização dela.
 *
 * Antes, o default vivia copiado em quatro lugares (serviço, handlers, hook do
 * renderer e texto do prompt) e a configuração gravada SEMPRE carregava
 * `repoUrl`/`branch`, mesmo nunca tendo sido escolhidos: o default era copiado
 * para o disco na primeira sincronização. Consequência: não dava para separar
 * "a pessoa escolheu esta fonte" de "o app copiou o padrão", e trocar o default
 * do app ou nunca alcançaria quem já tinha o antigo gravado, ou o reinterpretaria
 * em silêncio.
 *
 * Regras deste módulo:
 *
 * 1. **Só a escolha explícita é gravada.** No modo `default` a fonte é resolvida
 *    na leitura a partir do default do app; no modo `custom` ela vem do disco e
 *    nunca é trocada por um novo default.
 * 2. **Precedência:** escolha da pessoa (`custom`) > default do app. O fallback
 *    offline não é uma terceira fonte: é o último conteúdo entregue
 *    (`delivered`), que continua valendo enquanto a sincronização falha.
 * 3. **A fonte entregue é dita à parte da configurada.** Se a URL foi trocada e
 *    ainda não sincronizou, o conteúdo em cache continua vindo da fonte antiga —
 *    e o prompt/UI precisam dizer isso, não a fonte configurada.
 * 4. **Nada de segredo:** URL sai sem credencial; texto de erro nunca entra no
 *    contrato de leitura, só o estado.
 */

const {
  sanitizeGitErrorText,
  sanitizeGitRemoteUrl,
} = require('../services/git-secret-redaction.cjs')

const DEFAULT_REPO_URL = 'https://github.com/Felipe-Alcantara/Felixo-System-Design.git'
const DEFAULT_BRANCH = 'main'
const DEFAULT_LABEL = 'Felixo System Design'
const CONFIG_SCHEMA_VERSION = 2

const SOURCE_MODES = Object.freeze({ DEFAULT: 'default', CUSTOM: 'custom' })

/** Estados que a UI e o prompt sabem descrever. Fechado: quem consome faz `switch`. */
const SYNC_STATES = Object.freeze({
  DISABLED: 'disabled',
  NEVER_SYNCED: 'never-synced',
  SYNCED: 'synced',
  /** A última sincronização falhou; o conteúdo entregue é o da sincronização anterior. */
  OFFLINE_FALLBACK: 'offline-fallback',
  /** A fonte configurada mudou e ainda não sincronizou; o conteúdo é da fonte anterior. */
  PENDING_SOURCE_CHANGE: 'pending-source-change',
})

function getDefaultSource() {
  return { repoUrl: DEFAULT_REPO_URL, branch: DEFAULT_BRANCH }
}

/**
 * Defaults que versões ANTERIORES do app gravaram no disco sem a pessoa ter
 * escolhido. Um v1 igual a qualquer um deles é "seguindo o padrão", mesmo que o
 * default atual seja outro — senão quem pulasse de uma versão v1 direto para uma
 * com novo default teria o antigo lido como escolha explícita.
 *
 * Ao trocar o default do app, ACRESCENTE o default que está saindo aqui.
 */
const LEGACY_DEFAULT_SOURCES = Object.freeze([getDefaultSource()])

/**
 * Forma canônica só para COMPARAR duas fontes: tolera `.git` final, barra
 * final, caixa do host e espaços — diferenças que não mudam o repositório.
 */
function canonicalizeSource({ repoUrl, branch } = {}) {
  const url = String(repoUrl ?? '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
  let canonicalUrl = url
  try {
    const parsed = new URL(url)
    canonicalUrl = `${parsed.protocol}//${parsed.host.toLowerCase()}${parsed.pathname}`
  } catch {
    canonicalUrl = url
  }
  return { repoUrl: canonicalUrl, branch: String(branch ?? '').trim() }
}

function sourcesEqual(a, b) {
  if (!a || !b) return false
  const left = canonicalizeSource(a)
  const right = canonicalizeSource(b)
  return left.repoUrl === right.repoUrl && left.branch === right.branch
}

/**
 * Valida uma URL escolhida pela pessoa. Devolve o motivo em português ou null.
 *
 * `repoUrl` chega do renderer e vira argumento do `git clone`; o `--` do
 * serviço já impede leitura como opção, mas aceitar lixo só empurraria a falha
 * para o clone. Recusa aqui, antes de gravar.
 */
function validateSourceUrl(repoUrl) {
  const value = String(repoUrl ?? '').trim()
  if (!value) return 'Informe a URL do repositório.'
  if (value.startsWith('-')) return 'A URL do repositório é inválida.'

  const isScp = /^[\w.-]+@[\w.-]+:[\w./~-]+$/.test(value)
  if (isScp) return null

  try {
    const parsed = new URL(value)
    if (!['https:', 'http:', 'ssh:', 'git:'].includes(parsed.protocol)) {
      return 'Use uma URL https, ssh ou git.'
    }
    if (!parsed.host) return 'A URL do repositório é inválida.'
    return null
  } catch {
    return 'A URL do repositório é inválida.'
  }
}

function normalizeBranch(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function normalizeDelivered(value) {
  if (!value || typeof value !== 'object') return null
  const repoUrl = typeof value.repoUrl === 'string' ? sanitizeGitRemoteUrl(value.repoUrl) : ''
  const branch = normalizeBranch(value.branch)
  const sha = typeof value.sha === 'string' && value.sha ? value.sha : null
  const syncedAt = typeof value.syncedAt === 'string' && value.syncedAt ? value.syncedAt : null
  if (!repoUrl || !branch || !sha) return null
  return { repoUrl, branch, sha, syncedAt }
}

/**
 * Lê o que estiver gravado (v1 legado, v2 ou lixo) e devolve SEMPRE a forma v2.
 *
 * O v1 não tinha marcação de escolha. Regra combinada com o dono do produto:
 * gravado igual ao default atual = "segue o padrão" (um novo default do app
 * passa a valer); diferente do default = "escolha explícita" (nunca é trocado).
 * Config antiga carrega sem reset: `enabled`, sha, data e erro são preservados.
 *
 * @param {unknown} raw
 */
function migrateStoredConfig(raw, defaultSource = getDefaultSource()) {
  const value = raw && typeof raw === 'object' ? raw : {}
  const enabled = typeof value.enabled === 'boolean' ? value.enabled : true
  const lastError =
    typeof value.lastError === 'string' ? sanitizeGitErrorText(value.lastError) || null : null

  if (value.schemaVersion === CONFIG_SCHEMA_VERSION) {
    const custom =
      value.sourceMode === SOURCE_MODES.CUSTOM && value.customSource
        ? {
            repoUrl: sanitizeGitRemoteUrl(value.customSource.repoUrl),
            branch: normalizeBranch(value.customSource.branch),
          }
        : null
    const isValidCustom = custom && custom.repoUrl && custom.branch
    return {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      enabled,
      sourceMode: isValidCustom ? SOURCE_MODES.CUSTOM : SOURCE_MODES.DEFAULT,
      customSource: isValidCustom ? custom : null,
      delivered: normalizeDelivered(value.delivered),
      lastError,
    }
  }

  // v1: `repoUrl`/`branch` sempre gravados; `lastSha`/`lastSyncedAt` descrevem a
  // última sincronização, que usou exatamente essa fonte.
  // Cada campo cai no default ANTIGO sozinho, como o `normalizeConfig` do v1
  // fazia: uma URL própria com branch ausente continua sendo uma URL própria,
  // não vira "sem fonte" (isso seria um reset silencioso).
  const legacyBase = LEGACY_DEFAULT_SOURCES[0]
  const storedSource = {
    repoUrl:
      (typeof value.repoUrl === 'string' ? sanitizeGitRemoteUrl(value.repoUrl) : '') ||
      legacyBase.repoUrl,
    branch: normalizeBranch(value.branch) || legacyBase.branch,
  }
  const followsDefault =
    sourcesEqual(storedSource, defaultSource) ||
    LEGACY_DEFAULT_SOURCES.some((legacy) => sourcesEqual(storedSource, legacy))
  const isCustom = !followsDefault
  const lastSha = typeof value.lastSha === 'string' && value.lastSha ? value.lastSha : null
  const lastSyncedAt =
    typeof value.lastSyncedAt === 'string' && value.lastSyncedAt ? value.lastSyncedAt : null

  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    enabled,
    sourceMode: isCustom ? SOURCE_MODES.CUSTOM : SOURCE_MODES.DEFAULT,
    customSource: isCustom ? storedSource : null,
    delivered: lastSha
      ? normalizeDelivered({
          repoUrl: storedSource.repoUrl,
          branch: storedSource.branch,
          sha: lastSha,
          syncedAt: lastSyncedAt,
        })
      : null,
    lastError,
  }
}

/** Fonte configurada agora, já resolvida pela precedência. */
function resolveConfiguredSource(stored, defaultSource = getDefaultSource()) {
  if (stored.sourceMode === SOURCE_MODES.CUSTOM && stored.customSource) {
    return { ...stored.customSource, origin: SOURCE_MODES.CUSTOM }
  }
  return { ...defaultSource, origin: SOURCE_MODES.DEFAULT }
}

function deriveSyncState(stored, configured) {
  if (!stored.enabled) return SYNC_STATES.DISABLED
  if (!stored.delivered) return SYNC_STATES.NEVER_SYNCED
  if (!sourcesEqual(stored.delivered, configured)) return SYNC_STATES.PENDING_SOURCE_CHANGE
  return stored.lastError ? SYNC_STATES.OFFLINE_FALLBACK : SYNC_STATES.SYNCED
}

function labelFor(source, origin) {
  if (origin === SOURCE_MODES.DEFAULT) return DEFAULT_LABEL
  const segment = String(source.repoUrl ?? '')
    .replace(/[/:]+$/, '')
    .replace(/\.git$/i, '')
    .split(/[/:]/)
    .filter(Boolean)
    .pop()
  return segment ? `System Design (${segment})` : 'System Design (fonte personalizada)'
}

/**
 * Forma que o renderer lê. Mantém os campos planos que a UI já usava
 * (`repoUrl`, `branch`, `lastSha`…) e acrescenta o que faltava para dizer a
 * verdade: origem, estado e a fonte efetivamente entregue.
 */
function toPublicConfig(stored, defaultSource = getDefaultSource()) {
  const configured = resolveConfiguredSource(stored, defaultSource)
  const syncState = deriveSyncState(stored, configured)
  const delivered = stored.delivered
  const deliveredOrigin = delivered && sourcesEqual(delivered, defaultSource)
    ? SOURCE_MODES.DEFAULT
    : SOURCE_MODES.CUSTOM

  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    enabled: stored.enabled,
    repoUrl: configured.repoUrl,
    branch: configured.branch,
    sourceMode: configured.origin,
    label: labelFor(configured, configured.origin),
    syncState,
    delivered: delivered
      ? { ...delivered, label: labelFor(delivered, deliveredOrigin) }
      : null,
    // Compatibilidade com quem lê os campos planos.
    lastSha: delivered ? delivered.sha : null,
    lastSyncedAt: delivered ? delivered.syncedAt : null,
    lastError: stored.lastError,
  }
}

/**
 * Aplica uma alteração vinda do renderer. **Lista branca**: o renderer não
 * escreve `delivered`, sha, data nem erro — antes `{ ...current, ...partial }`
 * deixava qualquer chave passar.
 *
 * - `sourceMode: 'default'` volta ao padrão do app e descarta a fonte própria.
 * - `repoUrl` e/ou `branch` sem `sourceMode: 'default'` são uma ESCOLHA
 *   EXPLÍCITA: viram `custom`, mesmo iguais ao default de hoje — a pessoa
 *   escolheu, então um novo default não a alcança.
 *
 * @returns {{ ok: true, stored: object } | { ok: false, message: string }}
 */
function applyConfigChange(stored, partial, defaultSource = getDefaultSource()) {
  const change = partial && typeof partial === 'object' ? partial : {}
  const next = { ...stored }

  if (typeof change.enabled === 'boolean') next.enabled = change.enabled

  if (change.sourceMode === SOURCE_MODES.DEFAULT) {
    next.sourceMode = SOURCE_MODES.DEFAULT
    next.customSource = null
  } else if (change.repoUrl !== undefined || change.branch !== undefined) {
    const base = resolveConfiguredSource(stored, defaultSource)
    const repoUrl = change.repoUrl !== undefined ? change.repoUrl : base.repoUrl
    const branch = change.branch !== undefined ? change.branch : base.branch

    const urlProblem = validateSourceUrl(repoUrl)
    if (urlProblem) return { ok: false, message: urlProblem }
    const cleanBranch = normalizeBranch(branch)
    if (!cleanBranch || cleanBranch.startsWith('-')) {
      return { ok: false, message: 'Informe um nome de branch válido.' }
    }

    next.sourceMode = SOURCE_MODES.CUSTOM
    next.customSource = { repoUrl: sanitizeGitRemoteUrl(repoUrl), branch: cleanBranch }
  }

  return { ok: true, stored: next }
}

/** Registra uma sincronização bem-sucedida: é AQUI que a fonte entregue muda. */
function recordSuccessfulSync(stored, { repoUrl, branch, sha, syncedAt }) {
  return {
    ...stored,
    delivered: normalizeDelivered({ repoUrl, branch, sha, syncedAt }),
    lastError: null,
  }
}

/** Registra uma falha. Não mexe em `delivered`: o cache anterior segue valendo. */
function recordFailedSync(stored, message) {
  return { ...stored, lastError: sanitizeGitErrorText(message) || null }
}

/** Esquece o que foi entregue (cache limpo). */
function recordClearedCache(stored) {
  return { ...stored, delivered: null }
}

module.exports = {
  CONFIG_SCHEMA_VERSION,
  DEFAULT_BRANCH,
  DEFAULT_LABEL,
  DEFAULT_REPO_URL,
  LEGACY_DEFAULT_SOURCES,
  SOURCE_MODES,
  SYNC_STATES,
  applyConfigChange,
  canonicalizeSource,
  getDefaultSource,
  migrateStoredConfig,
  recordClearedCache,
  recordFailedSync,
  recordSuccessfulSync,
  resolveConfiguredSource,
  sourcesEqual,
  toPublicConfig,
  validateSourceUrl,
}
