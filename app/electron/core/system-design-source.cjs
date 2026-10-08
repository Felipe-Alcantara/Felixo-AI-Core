'use strict'

/**
 * @module system-design-source
 * Contrato único das fontes do System Design (repositório + branch) da camada
 * do usuário e do estado de sincronização de cada fonte.
 *
 * Histórico: na v1 a configuração gravada SEMPRE carregava `repoUrl`/`branch`
 * (o default era copiado para o disco), e não dava para separar "a pessoa
 * escolheu" de "o app copiou o padrão". A v2 (21/09/2026) gravou só a escolha
 * explícita. A v3 (08/10/2026) troca a fonte única por uma LISTA de guias —
 * dá para seguir dois padrões ao mesmo tempo (ex.: Felixo + Doktor) — e tira o
 * estado de sincronização da configuração: cada fonte tem cache e índice
 * próprios, então "o que foi entregue" passa a ser um fato por fonte
 * (`system-design.sync`), não um campo da escolha.
 *
 * Regras deste módulo:
 *
 * 1. **Só a escolha explícita é gravada.** No modo `default` os guias são
 *    resolvidos na leitura a partir do default do app; no modo `custom` a lista
 *    vem do disco e nunca é trocada por um novo default.
 * 2. **Precedência da camada do usuário:** lista própria (`custom`) > default do
 *    app. A camada de projeto (`system-design-project.cjs`) fica por cima disto.
 *    O fallback offline não é outra fonte: é o último conteúdo sincronizado de
 *    CADA guia, que segue valendo enquanto a sincronização dele falha.
 * 3. **Nada de segredo:** URL sai sem credencial; o texto de erro é saneado.
 */

const crypto = require('node:crypto')
const {
  sanitizeGitErrorText,
  sanitizeGitRemoteUrl,
} = require('../services/git-secret-redaction.cjs')

const DEFAULT_REPO_URL = 'https://github.com/Felipe-Alcantara/Felixo-System-Design.git'
const DEFAULT_BRANCH = 'main'
const DEFAULT_LABEL = 'Felixo System Design'
const CONFIG_SCHEMA_VERSION = 3
const SYNC_STORE_VERSION = 1
/** Teto de guias por camada: cada um vira um clone e um índice no disco. */
const MAX_GUIDES = 5

const SOURCE_MODES = Object.freeze({ DEFAULT: 'default', CUSTOM: 'custom' })

/** Estados que a UI e o prompt sabem descrever. Fechado: quem consome faz `switch`. */
const SYNC_STATES = Object.freeze({
  DISABLED: 'disabled',
  NEVER_SYNCED: 'never-synced',
  SYNCED: 'synced',
  /** A última sincronização falhou; o conteúdo é o da sincronização anterior. */
  OFFLINE_FALLBACK: 'offline-fallback',
  /**
   * Só da v2 (fonte única): a fonte configurada mudou e o conteúdo em cache era
   * da anterior. Com um cache por fonte não acontece mais; fica no conjunto
   * para quem ainda lê o campo plano de uma config antiga.
   */
  PENDING_SOURCE_CHANGE: 'pending-source-change',
})

function getDefaultSource() {
  return { repoUrl: DEFAULT_REPO_URL, branch: DEFAULT_BRANCH }
}

/**
 * Defaults que versões ANTERIORES do app gravaram no disco sem a pessoa ter
 * escolhido. Um v1 igual a qualquer um deles é "seguindo o padrão", mesmo que o
 * default atual seja outro.
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
 * Identidade estável de uma fonte git: a mesma para `.git`/sem `.git`, barra
 * final e caixa do host. É a chave do cache, do índice e do estado.
 */
function sourceKey(source) {
  const canonical = canonicalizeSource(source)
  return `${canonical.repoUrl}#${canonical.branch}`
}

/** Nome de pasta curto e sem caracteres de caminho para o cache de uma fonte. */
function sourceDirName(key) {
  return crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 16)
}

/**
 * Valida uma URL escolhida pela pessoa ou lida de um projeto. Devolve o motivo
 * em português ou null.
 *
 * `repoUrl` vira argumento do `git clone`; o `--` do serviço já impede leitura
 * como opção, mas aceitar lixo só empurraria a falha para o clone. Recusa aqui,
 * antes de gravar.
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

/** `null` = branch aceitável; senão o motivo. */
function validateBranch(branch) {
  const clean = normalizeBranch(branch)
  if (!clean || clean.startsWith('-')) return 'Informe um nome de branch válido.'
  return null
}

/**
 * Valida e normaliza uma lista de guias (vinda do renderer ou de um projeto).
 * Repetidos (mesma fonte canônica) contam uma vez, na primeira posição.
 *
 * @returns {{ ok: true, guides: {repoUrl: string, branch: string}[] } | { ok: false, message: string }}
 */
function normalizeGuideList(list, { maxGuides = MAX_GUIDES } = {}) {
  if (!Array.isArray(list)) return { ok: false, message: 'Lista de guias inválida.' }
  const guides = []
  for (const [index, item] of list.entries()) {
    const entry = item && typeof item === 'object' ? item : {}
    const position = list.length > 1 ? `Guia ${index + 1}: ` : ''
    const urlProblem = validateSourceUrl(entry.repoUrl)
    if (urlProblem) return { ok: false, message: `${position}${urlProblem}` }
    const branchProblem = validateBranch(entry.branch)
    if (branchProblem) return { ok: false, message: `${position}${branchProblem}` }
    const guide = {
      repoUrl: sanitizeGitRemoteUrl(String(entry.repoUrl).trim()),
      branch: normalizeBranch(entry.branch),
    }
    if (!guides.some((existing) => sourcesEqual(existing, guide))) guides.push(guide)
  }
  if (guides.length > maxGuides) {
    return { ok: false, message: `Use no máximo ${maxGuides} guias.` }
  }
  return { ok: true, guides }
}

/** Lista gravada → só entradas inteiras, saneadas e sem repetição (sem recusar a config toda). */
function sanitizeStoredGuides(list) {
  if (!Array.isArray(list)) return []
  const guides = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const repoUrl = typeof item.repoUrl === 'string' ? sanitizeGitRemoteUrl(item.repoUrl) : ''
    const branch = normalizeBranch(item.branch)
    if (!repoUrl || !branch) continue
    const guide = { repoUrl, branch }
    if (!guides.some((existing) => sourcesEqual(existing, guide))) guides.push(guide)
    if (guides.length === MAX_GUIDES) break
  }
  return guides
}

/**
 * Forma v2 a partir de um v1 (ou de lixo): regra combinada com o dono do
 * produto em 21/09 — gravado igual ao default (atual ou histórico) = "segue o
 * padrão"; diferente = "escolha explícita". Cada campo cai no default ANTIGO
 * sozinho: uma URL própria com branch ausente continua própria.
 */
function v1ToV2(value, defaultSource) {
  const enabled = typeof value.enabled === 'boolean' ? value.enabled : true
  const lastError =
    typeof value.lastError === 'string' ? sanitizeGitErrorText(value.lastError) || null : null
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
  const lastSha = typeof value.lastSha === 'string' && value.lastSha ? value.lastSha : null
  const lastSyncedAt =
    typeof value.lastSyncedAt === 'string' && value.lastSyncedAt ? value.lastSyncedAt : null
  return {
    enabled,
    customSource: followsDefault ? null : storedSource,
    delivered: lastSha
      ? { repoUrl: storedSource.repoUrl, branch: storedSource.branch, sha: lastSha, syncedAt: lastSyncedAt }
      : null,
    lastError,
  }
}

/** Lê uma v2 gravada, só os campos que a v3 precisa. */
function readV2(value) {
  const enabled = typeof value.enabled === 'boolean' ? value.enabled : true
  const lastError =
    typeof value.lastError === 'string' ? sanitizeGitErrorText(value.lastError) || null : null
  const custom = value.sourceMode === SOURCE_MODES.CUSTOM && value.customSource
    ? sanitizeStoredGuides([value.customSource])[0] ?? null
    : null
  const delivered = value.delivered && typeof value.delivered === 'object'
    ? {
        repoUrl: typeof value.delivered.repoUrl === 'string'
          ? sanitizeGitRemoteUrl(value.delivered.repoUrl)
          : '',
        branch: normalizeBranch(value.delivered.branch),
        sha: typeof value.delivered.sha === 'string' && value.delivered.sha ? value.delivered.sha : null,
        syncedAt: typeof value.delivered.syncedAt === 'string' && value.delivered.syncedAt
          ? value.delivered.syncedAt
          : null,
      }
    : null
  return {
    enabled,
    customSource: custom,
    delivered: delivered && delivered.repoUrl && delivered.branch && delivered.sha ? delivered : null,
    lastError,
  }
}

/** Fonte única da v1/v2 já lida, para quem precisa migrar os dois lados. */
function readLegacy(raw, defaultSource) {
  const value = raw && typeof raw === 'object' ? raw : {}
  return value.schemaVersion === 2 ? readV2(value) : v1ToV2(value, defaultSource)
}

/**
 * Lê o que estiver gravado (v1, v2, v3 ou lixo) e devolve SEMPRE a v3, que só
 * guarda escolhas. Config antiga carrega sem reset silencioso: `enabled` e a
 * fonte escolhida sobrevivem; o estado de sincronização sai para o store por
 * fonte (`extractLegacySyncEntries`).
 *
 * @param {unknown} raw
 */
function migrateStoredConfig(raw, defaultSource = getDefaultSource()) {
  const value = raw && typeof raw === 'object' ? raw : {}

  if (value.schemaVersion === CONFIG_SCHEMA_VERSION) {
    const guides = sanitizeStoredGuides(value.customSources)
    const isCustom = value.sourceMode === SOURCE_MODES.CUSTOM && guides.length > 0
    return {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
      sourceMode: isCustom ? SOURCE_MODES.CUSTOM : SOURCE_MODES.DEFAULT,
      customSources: isCustom ? guides : [],
    }
  }

  const legacy = readLegacy(value, defaultSource)
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    enabled: legacy.enabled,
    sourceMode: legacy.customSource ? SOURCE_MODES.CUSTOM : SOURCE_MODES.DEFAULT,
    customSources: legacy.customSource ? [legacy.customSource] : [],
  }
}

/**
 * O que uma config v1/v2 sabia sobre sincronização, já no formato do store por
 * fonte. `documentsSource` é a fonte dona dos documentos da tabela antiga (a
 * entregue): é para a chave dela que o índice antigo migra. Uma v3 não tem
 * nada a migrar.
 *
 * @returns {{ entries: object[], documentsSource: {repoUrl: string, branch: string} | null }}
 */
function extractLegacySyncEntries(raw, defaultSource = getDefaultSource()) {
  const value = raw && typeof raw === 'object' ? raw : {}
  if (value.schemaVersion === CONFIG_SCHEMA_VERSION || !raw) {
    return { entries: [], documentsSource: null }
  }
  const legacy = readLegacy(value, defaultSource)
  const configured = legacy.customSource ?? defaultSource
  const entries = []
  if (legacy.delivered) {
    entries.push({
      repoUrl: legacy.delivered.repoUrl,
      branch: legacy.delivered.branch,
      sha: legacy.delivered.sha,
      syncedAt: legacy.delivered.syncedAt,
      // O erro gravado era da fonte CONFIGURADA; só pertence à entregue se for a mesma.
      lastError: sourcesEqual(legacy.delivered, configured) ? legacy.lastError : null,
    })
  }
  if (legacy.lastError && !(legacy.delivered && sourcesEqual(legacy.delivered, configured))) {
    entries.push({
      repoUrl: configured.repoUrl,
      branch: configured.branch,
      sha: null,
      syncedAt: null,
      lastError: legacy.lastError,
    })
  }
  return {
    entries,
    documentsSource: legacy.delivered
      ? { repoUrl: legacy.delivered.repoUrl, branch: legacy.delivered.branch }
      : null,
  }
}

/** Guias da camada do usuário, já resolvidos pela precedência (sempre ≥ 1). */
function resolveUserGuides(stored, defaultSource = getDefaultSource()) {
  if (stored.sourceMode === SOURCE_MODES.CUSTOM && stored.customSources?.length) {
    return stored.customSources.map((guide) => ({ ...guide, origin: SOURCE_MODES.CUSTOM }))
  }
  return [{ ...defaultSource, origin: SOURCE_MODES.DEFAULT }]
}

/** Compatibilidade: a primeira fonte da camada do usuário. */
function resolveConfiguredSource(stored, defaultSource = getDefaultSource()) {
  return resolveUserGuides(stored, defaultSource)[0]
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

// ── Store de sincronização por fonte (`system-design.sync`) ─────────────────

function normalizeSyncEntry(value) {
  if (!value || typeof value !== 'object') return null
  const repoUrl = typeof value.repoUrl === 'string' ? sanitizeGitRemoteUrl(value.repoUrl) : ''
  const branch = normalizeBranch(value.branch)
  if (!repoUrl || !branch) return null
  return {
    repoUrl,
    branch,
    sha: typeof value.sha === 'string' && value.sha ? value.sha : null,
    syncedAt: typeof value.syncedAt === 'string' && value.syncedAt ? value.syncedAt : null,
    lastError:
      typeof value.lastError === 'string' ? sanitizeGitErrorText(value.lastError) || null : null,
  }
}

/** Lê o store (ou lixo) e devolve sempre `{ version, sources: { [key]: entry } }`. */
function normalizeSyncStore(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  const sources = {}
  const rawSources = value.sources && typeof value.sources === 'object' ? value.sources : {}
  for (const entry of Object.values(rawSources)) {
    const normalized = normalizeSyncEntry(entry)
    if (normalized) sources[sourceKey(normalized)] = normalized
  }
  return { version: SYNC_STORE_VERSION, sources }
}

/** Acrescenta entradas migradas sem sobrescrever o que o store já sabe. */
function mergeSyncEntries(store, entries) {
  const next = { version: SYNC_STORE_VERSION, sources: { ...store.sources } }
  for (const entry of entries) {
    const normalized = normalizeSyncEntry(entry)
    if (!normalized) continue
    const key = sourceKey(normalized)
    if (!next.sources[key]) next.sources[key] = normalized
  }
  return next
}

/** Registra uma sincronização bem-sucedida de UMA fonte: limpa o erro dela. */
function recordSuccessfulSync(store, { repoUrl, branch, sha, syncedAt }) {
  const entry = normalizeSyncEntry({ repoUrl, branch, sha, syncedAt, lastError: null })
  if (!entry) return store
  return { version: SYNC_STORE_VERSION, sources: { ...store.sources, [sourceKey(entry)]: entry } }
}

/** Registra uma falha. Não mexe no sha/data: o conteúdo anterior segue valendo. */
function recordFailedSync(store, { repoUrl, branch }, message) {
  const key = sourceKey({ repoUrl, branch })
  const previous = store.sources[key]
  const entry = normalizeSyncEntry({
    repoUrl,
    branch,
    sha: previous?.sha ?? null,
    syncedAt: previous?.syncedAt ?? null,
    lastError: message,
  })
  if (!entry) return store
  return { version: SYNC_STORE_VERSION, sources: { ...store.sources, [key]: entry } }
}

/** Esquece tudo que foi sincronizado (cache limpo). */
function recordClearedCache() {
  return { version: SYNC_STORE_VERSION, sources: {} }
}

/** Estado de um guia git a partir da entrada dele no store. */
function guideSyncState(enabled, entry) {
  if (!enabled) return SYNC_STATES.DISABLED
  if (!entry || !entry.sha) return SYNC_STATES.NEVER_SYNCED
  return entry.lastError ? SYNC_STATES.OFFLINE_FALLBACK : SYNC_STATES.SYNCED
}

/**
 * Forma pública de um guia git: identidade, rótulo, origem e o estado dele.
 * O texto de erro vai junto porque já é saneado no registro.
 */
function toPublicGuide(guide, { enabled, store, origin }) {
  const key = sourceKey(guide)
  const entry = store.sources[key] ?? null
  return {
    key,
    kind: 'git',
    repoUrl: sanitizeGitRemoteUrl(guide.repoUrl),
    branch: guide.branch,
    label: labelFor(guide, origin),
    origin,
    syncState: guideSyncState(enabled, entry),
    sha: entry?.sha ?? null,
    syncedAt: entry?.syncedAt ?? null,
    lastError: entry?.lastError ?? null,
  }
}

/**
 * Forma que o renderer lê. `guides` é a lista da camada do usuário, cada guia
 * com o próprio estado. Os campos planos de antes (`repoUrl`, `syncState`,
 * `delivered`…) continuam, descrevendo o PRIMEIRO guia, para quem ainda os lê.
 */
function toPublicConfig(stored, syncStore = normalizeSyncStore(null), defaultSource = getDefaultSource()) {
  const guides = resolveUserGuides(stored, defaultSource).map((guide) =>
    toPublicGuide(guide, { enabled: stored.enabled, store: syncStore, origin: guide.origin }),
  )
  const first = guides[0]
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    enabled: stored.enabled,
    sourceMode: stored.sourceMode,
    guides,
    // Compatibilidade com quem lê os campos planos (o primeiro guia).
    repoUrl: first.repoUrl,
    branch: first.branch,
    label: first.label,
    syncState: first.syncState,
    delivered: first.sha
      ? { repoUrl: first.repoUrl, branch: first.branch, sha: first.sha, syncedAt: first.syncedAt, label: first.label }
      : null,
    lastSha: first.sha,
    lastSyncedAt: first.syncedAt,
    lastError: first.lastError,
  }
}

/**
 * Aplica uma alteração vinda do renderer. **Lista branca**: o renderer não
 * escreve sha, data, erro nem estado.
 *
 * - `sourceMode: 'default'` volta ao padrão do app e descarta a lista própria.
 * - `guides: [{ repoUrl, branch }]` troca a lista inteira (vazia = padrão).
 * - `repoUrl` e/ou `branch` sozinhos (forma da v2) viram uma lista de um guia.
 * Escolha explícita é `custom` mesmo igual ao default de hoje: a pessoa
 * escolheu, então um novo default não a alcança.
 *
 * @returns {{ ok: true, stored: object } | { ok: false, message: string }}
 */
function applyConfigChange(stored, partial, defaultSource = getDefaultSource()) {
  const change = partial && typeof partial === 'object' ? partial : {}
  const next = { ...stored, customSources: [...(stored.customSources ?? [])] }

  if (typeof change.enabled === 'boolean') next.enabled = change.enabled

  if (change.sourceMode === SOURCE_MODES.DEFAULT) {
    next.sourceMode = SOURCE_MODES.DEFAULT
    next.customSources = []
  } else if (change.guides !== undefined) {
    const result = normalizeGuideList(change.guides)
    if (!result.ok) return result
    next.sourceMode = result.guides.length ? SOURCE_MODES.CUSTOM : SOURCE_MODES.DEFAULT
    next.customSources = result.guides
  } else if (change.repoUrl !== undefined || change.branch !== undefined) {
    const base = resolveConfiguredSource(stored, defaultSource)
    const repoUrl = change.repoUrl !== undefined ? change.repoUrl : base.repoUrl
    const branch = change.branch !== undefined ? change.branch : base.branch
    const result = normalizeGuideList([{ repoUrl, branch }])
    if (!result.ok) return result
    next.sourceMode = SOURCE_MODES.CUSTOM
    next.customSources = result.guides
  }

  return { ok: true, stored: next }
}

module.exports = {
  CONFIG_SCHEMA_VERSION,
  DEFAULT_BRANCH,
  DEFAULT_LABEL,
  DEFAULT_REPO_URL,
  LEGACY_DEFAULT_SOURCES,
  MAX_GUIDES,
  SOURCE_MODES,
  SYNC_STATES,
  SYNC_STORE_VERSION,
  applyConfigChange,
  canonicalizeSource,
  extractLegacySyncEntries,
  getDefaultSource,
  guideSyncState,
  labelFor,
  mergeSyncEntries,
  migrateStoredConfig,
  normalizeBranch,
  normalizeGuideList,
  normalizeSyncStore,
  recordClearedCache,
  recordFailedSync,
  recordSuccessfulSync,
  resolveConfiguredSource,
  resolveUserGuides,
  sourceDirName,
  sourceKey,
  sourcesEqual,
  toPublicConfig,
  toPublicGuide,
  validateBranch,
  validateSourceUrl,
}
