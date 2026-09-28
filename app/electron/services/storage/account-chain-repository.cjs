'use strict'

/**
 * @module storage/account-chain-repository
 * Estado da cadeia de contas no SQLite (migration 017), com compare-and-set.
 *
 * Dois Felixo abertos no mesmo perfil têm conexões em processos diferentes; a
 * decisão sobre uma troca (proposta → confirmada → ticket usado) não pode ser
 * aplicada duas vezes. Por isso toda transição é um
 * `UPDATE … WHERE id = ? AND state = ? AND revision = ?` que só conta com
 * `changes === 1`, no molde de `onboarding-state-repository.cjs`, e o índice
 * parcial único da migration garante no máximo uma proposta aberta por sessão
 * mesmo que alguém escreva por fora deste módulo.
 *
 * As transações são mínimas (SELECT + UPDATE/INSERT, sem I/O nem regra de
 * negócio), porque sob contenção o `BEGIN IMMEDIATE` espera até o
 * `busy_timeout` (5 s) na thread do processo principal. A regra (quem é apto,
 * quando propor, quando uma espera acaba) fica na política e no serviço da
 * cadeia; aqui só se valida o formato e se guarda.
 *
 * Nunca entra aqui transcript, env, caminho de perfil ou segredo: evidência e
 * motivo chegam já redigidos, e a identidade só como impressão digital.
 */

const {
  BILLING_CLASSES,
  CHAIN_PROVIDER_IDS,
  CHAIN_STRATEGIES,
  COOLDOWN_FAILURE_CLASSES,
  COOLDOWN_RELEASE_REASONS,
  COOLDOWN_UNTIL_SOURCES,
  DEFAULT_CHAIN_STRATEGY,
  DEFAULT_MAX_HOPS_PER_LINEAGE,
  EVIDENCE_MAX_CHARS,
  IDENTITY_STATUSES,
  LOGIN_CHECK_SOURCES,
  LOGIN_CHECK_STATUSES,
  MAX_MAX_HOPS_PER_LINEAGE,
  MAX_PLAN_MULTIPLIER,
  MIN_MAX_HOPS_PER_LINEAGE,
  MIN_PLAN_MULTIPLIER,
  OPEN_SWITCH_EVENT_STATES,
  SWITCH_EVENTS_RETENTION,
  SWITCH_EVENT_KINDS,
  SWITCH_EVENT_STATES,
  SWITCH_EVENT_TRANSITIONS,
  SWITCH_HISTORY_PAGE_MAX,
  SWITCH_LABEL_MAX_CHARS,
  SWITCH_REASON_MAX_CHARS,
} = require('../accounts/account-chain-constants.cjs')

const SETTINGS_ROW_ID = 1
const ID_MAX_CHARS = 200
const SHORT_TEXT_MAX_CHARS = 64
const CHOSEN_BY_VALUES = Object.freeze(['chain', 'person'])
const OPEN_STATES_SQL = OPEN_SWITCH_EVENT_STATES.map((state) => `'${state}'`).join(', ')

// ── Validação de formato ────────────────────────────────────────────────────

function requireConnection(database) {
  const connection = database?.connection ?? database
  if (!connection?.prepare || !connection?.exec) {
    throw new Error('Conexão SQLite inválida para a cadeia de contas.')
  }
  return connection
}

function requireText(value, field, maxChars = ID_MAX_CHARS) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Campo ${field} da cadeia de contas precisa de texto.`)
  }
  if (value.length > maxChars) {
    throw new Error(`Campo ${field} da cadeia de contas passa de ${maxChars} caracteres.`)
  }
  return value
}

function optionalText(value, field, maxChars = ID_MAX_CHARS) {
  if (value === undefined || value === null) return null
  return requireText(value, field, maxChars)
}

function requireEnum(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new Error(`Valor inválido em ${field} da cadeia de contas.`)
  }
  return value
}

function optionalEnum(value, allowed, field) {
  if (value === undefined || value === null) return null
  return requireEnum(value, allowed, field)
}

/**
 * Horário em ISO UTC (`toISOString`). Normalizar na entrada é o que permite
 * comparar horários como texto no SQL (`expires_at <= ?`) sem erro de fuso ou
 * de formato.
 */
function requireIso(value, field) {
  const ms = typeof value === 'string' ? Date.parse(value) : Number.NaN
  if (!Number.isFinite(ms)) {
    throw new Error(`Horário inválido em ${field} da cadeia de contas.`)
  }
  return new Date(ms).toISOString()
}

function optionalIso(value, field) {
  if (value === undefined || value === null) return null
  return requireIso(value, field)
}

function optionalNumber(value, field, { min, max, integer = false }) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || (integer && !Number.isInteger(value))) {
    throw new Error(`Número inválido em ${field} da cadeia de contas.`)
  }
  if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
    throw new Error(`Número fora da faixa em ${field} da cadeia de contas.`)
  }
  return value
}

function requireBoolean(value, field) {
  if (typeof value !== 'boolean') {
    throw new Error(`Campo ${field} da cadeia de contas precisa ser verdadeiro ou falso.`)
  }
  return value
}

function requireRevision(value, field = 'expectedRevision') {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Revisão inválida em ${field} da cadeia de contas.`)
  }
  return value
}

function inImmediateTransaction(connection, work) {
  let began = false
  try {
    connection.exec('BEGIN IMMEDIATE')
    began = true
    const result = work()
    connection.exec('COMMIT')
    return result
  } catch (error) {
    // Só desfaz a transação que esta função abriu: se o BEGIN falhou porque
    // outro módulo tem uma transação aberta na mesma conexão, um ROLLBACK aqui
    // desfaria o trabalho dele.
    if (began) {
      try {
        connection.exec('ROLLBACK')
      } catch {
        // Mantém o erro original; o SQLite pode já ter abortado a transação.
      }
    }
    throw error
  }
}

/** `null` no fim da espera = até checagem ou ação, mais tarde que qualquer horário. */
function isUntilLater(candidate, current) {
  if (current === null) return false
  if (candidate === null) return true
  return Date.parse(candidate) > Date.parse(current)
}

// ── Linhas → objetos ────────────────────────────────────────────────────────

function mapSettingsRow(row) {
  return {
    exists: true,
    enabled: row.enabled === 1,
    strategy: row.strategy,
    maxHopsPerLineage: row.max_hops_per_lineage,
    revision: row.revision,
    updatedAt: row.updated_at,
  }
}

function defaultSettings() {
  return {
    exists: false,
    enabled: false,
    strategy: DEFAULT_CHAIN_STRATEGY,
    maxHopsPerLineage: DEFAULT_MAX_HOPS_PER_LINEAGE,
    revision: 0,
    updatedAt: null,
  }
}

function mapMemberRow(row) {
  return {
    accountId: row.account_id,
    providerId: row.provider_id,
    position: row.position,
    enabled: row.enabled === 1,
    billingDeclared: row.billing_declared ?? null,
    multiplierDeclared: row.multiplier_declared ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapCooldownRow(row) {
  return {
    accountId: row.account_id,
    providerId: row.provider_id,
    failureClass: row.failure_class,
    detectedAt: row.detected_at,
    untilAt: row.until_at ?? null,
    untilSource: row.until_source,
    evidence: row.evidence ?? null,
    evidenceHash: row.evidence_hash ?? null,
    sessionId: row.session_id ?? null,
    releasedAt: row.released_at ?? null,
    releasedBy: row.released_by ?? null,
    revision: row.revision,
  }
}

function mapLoginCheckRow(row) {
  return {
    accountId: row.account_id,
    providerId: row.provider_id,
    status: row.status,
    checkedAt: row.checked_at,
    source: row.source,
    durationMs: row.duration_ms ?? null,
    method: row.method ?? null,
    plan: row.plan ?? null,
    billingDetected: row.billing_detected ?? null,
    apiKeySourcePresent: row.api_key_source_present === 1,
    multiplierDetected: row.multiplier_detected ?? null,
    identityKey: row.identity_key ?? null,
    identityStatus: row.identity_status ?? null,
  }
}

/** `candidates_json` inválido marca o item como corrompido sem derrubar a lista. */
function parseCandidates(candidatesJson) {
  try {
    const parsed = JSON.parse(candidatesJson)
    if (Array.isArray(parsed)) return { candidates: parsed, corrupted: false }
  } catch {
    // Cai no retorno de corrompido abaixo.
  }
  return { candidates: [], corrupted: true }
}

function mapSwitchEventRow(row) {
  const { candidates, corrupted } = parseCandidates(row.candidates_json)
  return {
    id: row.id,
    kind: row.kind,
    state: row.state,
    sourceSessionId: row.source_session_id ?? null,
    sourceNodeId: row.source_node_id ?? null,
    lineageId: row.lineage_id ?? null,
    hop: row.hop,
    incidentKey: row.incident_key ?? null,
    fromAccountId: row.from_account_id ?? null,
    fromProviderId: row.from_provider_id,
    fromLabel: row.from_label ?? null,
    toAccountId: row.to_account_id ?? null,
    toProviderId: row.to_provider_id ?? null,
    toLabel: row.to_label ?? null,
    failureClass: row.failure_class ?? null,
    reason: row.reason,
    evidenceHash: row.evidence_hash ?? null,
    strategy: row.strategy ?? null,
    chosenBy: row.chosen_by ?? null,
    candidates,
    corrupted,
    sourceActiveAck: row.source_active_ack === 1,
    sourceAutoResumeAt: row.source_auto_resume_at ?? null,
    transcriptChars: row.transcript_chars ?? null,
    postSwitchFailure: row.post_switch_failure ?? null,
    detectedAt: row.detected_at ?? null,
    proposedAt: row.proposed_at,
    decidedAt: row.decided_at ?? null,
    spawnedAt: row.spawned_at ?? null,
    expiresAt: row.expires_at,
    targetSessionId: row.target_session_id ?? null,
    revision: row.revision,
  }
}

// ── Campos do registro de trocas ────────────────────────────────────────────

/**
 * Coluna e normalização de cada campo do registro de trocas. `patchable`
 * marca o que uma transição pode mudar: tipo, horário da proposta e ligação
 * com a sessão de origem ficam como nasceram.
 */
const SWITCH_EVENT_FIELDS = Object.freeze({
  sourceSessionId: { column: 'source_session_id', patchable: false, normalize: (v, f) => optionalText(v, f) },
  sourceNodeId: { column: 'source_node_id', patchable: false, normalize: (v, f) => optionalText(v, f) },
  lineageId: { column: 'lineage_id', patchable: false, normalize: (v, f) => optionalText(v, f) },
  hop: {
    column: 'hop',
    patchable: false,
    normalize: (v, f) => optionalNumber(v, f, { min: 0, max: MAX_MAX_HOPS_PER_LINEAGE, integer: true }) ?? 0,
  },
  incidentKey: { column: 'incident_key', patchable: false, normalize: (v, f) => optionalText(v, f, ID_MAX_CHARS * 2) },
  fromAccountId: { column: 'from_account_id', patchable: false, normalize: (v, f) => optionalText(v, f) },
  fromProviderId: { column: 'from_provider_id', patchable: false, normalize: (v, f) => requireText(v, f, SHORT_TEXT_MAX_CHARS) },
  fromLabel: { column: 'from_label', patchable: false, normalize: (v, f) => optionalText(v, f, SWITCH_LABEL_MAX_CHARS) },
  toAccountId: { column: 'to_account_id', patchable: true, normalize: (v, f) => optionalText(v, f) },
  toProviderId: { column: 'to_provider_id', patchable: true, normalize: (v, f) => optionalText(v, f, SHORT_TEXT_MAX_CHARS) },
  toLabel: { column: 'to_label', patchable: true, normalize: (v, f) => optionalText(v, f, SWITCH_LABEL_MAX_CHARS) },
  failureClass: { column: 'failure_class', patchable: false, normalize: (v, f) => optionalText(v, f, SHORT_TEXT_MAX_CHARS) },
  reason: { column: 'reason', patchable: true, normalize: (v, f) => requireText(v, f, SWITCH_REASON_MAX_CHARS) },
  evidenceHash: { column: 'evidence_hash', patchable: false, normalize: (v, f) => optionalText(v, f, SHORT_TEXT_MAX_CHARS) },
  strategy: { column: 'strategy', patchable: true, normalize: (v, f) => optionalEnum(v, CHAIN_STRATEGIES, f) },
  chosenBy: { column: 'chosen_by', patchable: true, normalize: (v, f) => optionalEnum(v, CHOSEN_BY_VALUES, f) },
  candidates: { column: 'candidates_json', patchable: true, normalize: (v, f) => serializeCandidates(v, f) },
  sourceActiveAck: {
    column: 'source_active_ack',
    patchable: true,
    normalize: (v, f) => (v === undefined || v === null ? 0 : requireBoolean(v, f) ? 1 : 0),
  },
  sourceAutoResumeAt: { column: 'source_auto_resume_at', patchable: true, normalize: (v, f) => optionalIso(v, f) },
  transcriptChars: {
    column: 'transcript_chars',
    patchable: true,
    normalize: (v, f) => optionalNumber(v, f, { min: 0, integer: true }),
  },
  postSwitchFailure: { column: 'post_switch_failure', patchable: true, normalize: (v, f) => optionalText(v, f, SHORT_TEXT_MAX_CHARS) },
  detectedAt: { column: 'detected_at', patchable: false, normalize: (v, f) => optionalIso(v, f) },
  proposedAt: { column: 'proposed_at', patchable: false, normalize: (v, f) => requireIso(v, f) },
  decidedAt: { column: 'decided_at', patchable: true, normalize: (v, f) => optionalIso(v, f) },
  spawnedAt: { column: 'spawned_at', patchable: true, normalize: (v, f) => optionalIso(v, f) },
  expiresAt: { column: 'expires_at', patchable: true, normalize: (v, f) => requireIso(v, f) },
  targetSessionId: { column: 'target_session_id', patchable: true, normalize: (v, f) => optionalText(v, f) },
})

function serializeCandidates(value, field) {
  if (value === undefined || value === null) return '[]'
  if (!Array.isArray(value)) {
    throw new Error(`Campo ${field} da cadeia de contas precisa ser uma lista.`)
  }
  return JSON.stringify(value)
}

function normalizeNewSwitchEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new Error('Evento de troca inválido.')
  }
  const columns = {
    id: requireText(event.id, 'id'),
    kind: requireEnum(event.kind, SWITCH_EVENT_KINDS, 'kind'),
    state: requireEnum(event.state, SWITCH_EVENT_STATES, 'state'),
  }
  for (const [field, spec] of Object.entries(SWITCH_EVENT_FIELDS)) {
    columns[spec.column] = spec.normalize(event[field], field)
  }
  return columns
}

function normalizeSwitchEventPatch(patch) {
  if (patch === undefined || patch === null) return {}
  if (typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('Alteração de evento de troca inválida.')
  }
  const columns = {}
  for (const [field, value] of Object.entries(patch)) {
    const spec = SWITCH_EVENT_FIELDS[field]
    if (!spec?.patchable) {
      throw new Error(`Campo ${field} do evento de troca não pode ser alterado.`)
    }
    columns[spec.column] = spec.normalize(value, field)
  }
  return columns
}

// ── Repositório ─────────────────────────────────────────────────────────────

/**
 * @param {unknown} database - `{ connection }` do `createStorageDatabase` ou a própria conexão.
 */
function createAccountChainRepository(database) {
  const connection = requireConnection(database)

  function readSettings() {
    const row = connection.prepare('SELECT * FROM account_chain_settings WHERE id = ?').get(SETTINGS_ROW_ID)
    return row ? mapSettingsRow(row) : defaultSettings()
  }

  function writeSettingsRow(settings, revision, nowIso) {
    connection
      .prepare(
        `INSERT INTO account_chain_settings (id, enabled, strategy, max_hops_per_lineage, revision, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           enabled = excluded.enabled,
           strategy = excluded.strategy,
           max_hops_per_lineage = excluded.max_hops_per_lineage,
           revision = excluded.revision,
           updated_at = excluded.updated_at`,
      )
      .run(SETTINGS_ROW_ID, settings.enabled ? 1 : 0, settings.strategy, settings.maxHopsPerLineage, revision, nowIso)
  }

  /** Sobe a revisão sem mudar os valores: a lista de membros mudou por fora da interface. */
  function bumpSettingsRevision(nowIso) {
    connection
      .prepare('UPDATE account_chain_settings SET revision = revision + 1, updated_at = ? WHERE id = ?')
      .run(nowIso, SETTINGS_ROW_ID)
  }

  /**
   * Muda as opções só se a revisão atual for `expectedRevision` (0 quando a
   * linha ainda não existe, isto é, a cadeia nunca foi ligada).
   *
   * @returns {{ applied: true, settings: object } | { applied: false, settings: object }}
   */
  function updateSettings({ expectedRevision, enabled, strategy, maxHopsPerLineage, nowIso }) {
    requireRevision(expectedRevision)
    const now = requireIso(nowIso, 'nowIso')
    const changes = {
      enabled: enabled === undefined ? undefined : requireBoolean(enabled, 'enabled'),
      strategy: strategy === undefined ? undefined : requireEnum(strategy, CHAIN_STRATEGIES, 'strategy'),
      maxHopsPerLineage:
        maxHopsPerLineage === undefined
          ? undefined
          : optionalNumber(maxHopsPerLineage, 'maxHopsPerLineage', {
              min: MIN_MAX_HOPS_PER_LINEAGE,
              max: MAX_MAX_HOPS_PER_LINEAGE,
              integer: true,
            }),
    }

    return inImmediateTransaction(connection, () => {
      const current = readSettings()
      if (current.revision !== expectedRevision) return { applied: false, settings: current }
      const next = {
        enabled: changes.enabled ?? current.enabled,
        strategy: changes.strategy ?? current.strategy,
        maxHopsPerLineage: changes.maxHopsPerLineage ?? current.maxHopsPerLineage,
      }
      writeSettingsRow(next, current.revision + 1, now)
      return { applied: true, settings: readSettings() }
    })
  }

  function listMembers() {
    return connection
      .prepare('SELECT * FROM account_chain_members ORDER BY position ASC, account_id ASC')
      .all()
      .map(mapMemberRow)
  }

  function normalizeMembers(members) {
    if (!Array.isArray(members)) throw new Error('Lista de membros da cadeia inválida.')
    const seen = new Set()
    return members.map((member, index) => {
      if (!member || typeof member !== 'object' || Array.isArray(member)) {
        throw new Error(`Membro ${index + 1} da cadeia inválido.`)
      }
      const accountId = requireText(member.accountId, 'accountId')
      if (seen.has(accountId)) throw new Error('Conta repetida na lista da cadeia.')
      seen.add(accountId)
      return {
        accountId,
        providerId: requireEnum(member.providerId, CHAIN_PROVIDER_IDS, 'providerId'),
        enabled: requireBoolean(member.enabled, 'enabled'),
        billingDeclared: optionalEnum(member.billingDeclared, BILLING_CLASSES, 'billingDeclared'),
        multiplierDeclared: optionalNumber(member.multiplierDeclared, 'multiplierDeclared', {
          min: MIN_PLAN_MULTIPLIER,
          max: MAX_PLAN_MULTIPLIER,
        }),
      }
    })
  }

  /**
   * Regrava a lista inteira na ordem recebida (`position` = índice), numa
   * transação guardada pela revisão de settings. Reordenar com UPDATEs
   * sequenciais colidiria no meio; regravar não. Sem a linha de settings
   * (`expectedRevision` 0), ela nasce com os padrões e a cadeia DESLIGADA.
   *
   * @returns {{ applied: true, revision: number } | { applied: false, settings: object, members: object[] }}
   */
  function replaceMembers({ members, expectedRevision, nowIso }) {
    requireRevision(expectedRevision)
    const now = requireIso(nowIso, 'nowIso')
    const normalized = normalizeMembers(members)

    return inImmediateTransaction(connection, () => {
      const current = readSettings()
      if (current.revision !== expectedRevision) {
        return { applied: false, settings: current, members: listMembers() }
      }
      const createdAtById = new Map(listMembers().map((member) => [member.accountId, member.createdAt]))
      connection.exec('DELETE FROM account_chain_members')
      const insert = connection.prepare(
        `INSERT INTO account_chain_members
           (account_id, provider_id, position, enabled, billing_declared, multiplier_declared, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      normalized.forEach((member, position) => {
        insert.run(
          member.accountId,
          member.providerId,
          position,
          member.enabled ? 1 : 0,
          member.billingDeclared,
          member.multiplierDeclared,
          createdAtById.get(member.accountId) ?? now,
          now,
        )
      })
      const revision = current.revision + 1
      writeSettingsRow(current, revision, now)
      return { applied: true, revision }
    })
  }

  function getCooldown(accountId) {
    const row = connection.prepare('SELECT * FROM account_cooldowns WHERE account_id = ?').get(requireText(accountId, 'accountId'))
    return row ? mapCooldownRow(row) : null
  }

  function listCooldowns({ includeReleased = false } = {}) {
    const sql = includeReleased
      ? 'SELECT * FROM account_cooldowns ORDER BY detected_at ASC, account_id ASC'
      : 'SELECT * FROM account_cooldowns WHERE released_at IS NULL ORDER BY detected_at ASC, account_id ASC'
    return connection.prepare(sql).all().map(mapCooldownRow)
  }

  /**
   * Põe a conta em espera. Uma espera ativa nunca encurta: a linha nova só
   * vence se o fim dela for mais tarde (`null`, até checagem, vence qualquer
   * horário). Várias sessões da mesma conta batendo o limite juntas viram uma
   * espera só, com o `detected_at` da primeira (a chave do incidente), mesmo
   * quando uma detecção posterior estende o fim.
   *
   * @returns {{ applied: boolean, cooldown: object }}
   */
  function upsertCooldown(input) {
    if (!input || typeof input !== 'object') throw new Error('Espera de conta inválida.')
    const cooldown = {
      accountId: requireText(input.accountId, 'accountId'),
      providerId: requireText(input.providerId, 'providerId', SHORT_TEXT_MAX_CHARS),
      failureClass: requireEnum(input.failureClass, COOLDOWN_FAILURE_CLASSES, 'failureClass'),
      detectedAt: requireIso(input.detectedAt, 'detectedAt'),
      untilAt: optionalIso(input.untilAt, 'untilAt'),
      untilSource: requireEnum(input.untilSource, COOLDOWN_UNTIL_SOURCES, 'untilSource'),
      evidence: optionalText(input.evidence, 'evidence', EVIDENCE_MAX_CHARS),
      evidenceHash: optionalText(input.evidenceHash, 'evidenceHash', SHORT_TEXT_MAX_CHARS),
      sessionId: optionalText(input.sessionId, 'sessionId'),
    }

    return inImmediateTransaction(connection, () => {
      const existing = getCooldown(cooldown.accountId)
      if (existing && existing.releasedAt === null && !isUntilLater(cooldown.untilAt, existing.untilAt)) {
        return { applied: false, cooldown: existing }
      }
      connection
        .prepare(
          `INSERT INTO account_cooldowns
             (account_id, provider_id, failure_class, detected_at, until_at, until_source,
              evidence, evidence_hash, session_id, released_at, released_by, revision)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 1)
           ON CONFLICT(account_id) DO UPDATE SET
             provider_id = excluded.provider_id,
             failure_class = excluded.failure_class,
             -- Estender uma espera ativa da mesma classe não muda o início do
             -- incidente (incident_key); classe nova ou espera liberada, sim.
             detected_at = CASE
               WHEN account_cooldowns.released_at IS NULL AND account_cooldowns.failure_class = excluded.failure_class
                 THEN account_cooldowns.detected_at
               ELSE excluded.detected_at
             END,
             until_at = excluded.until_at,
             until_source = excluded.until_source,
             evidence = excluded.evidence,
             evidence_hash = excluded.evidence_hash,
             session_id = excluded.session_id,
             released_at = NULL,
             released_by = NULL,
             revision = account_cooldowns.revision + 1`,
        )
        .run(
          cooldown.accountId,
          cooldown.providerId,
          cooldown.failureClass,
          cooldown.detectedAt,
          cooldown.untilAt,
          cooldown.untilSource,
          cooldown.evidence,
          cooldown.evidenceHash,
          cooldown.sessionId,
        )
      return { applied: true, cooldown: getCooldown(cooldown.accountId) }
    })
  }

  /**
   * Libera uma espera ativa. Com `expectedRevision`, só libera a espera que a
   * pessoa viu: se uma detecção nova a estendeu nesse meio-tempo, não aplica.
   *
   * @returns {{ applied: boolean, cooldown: object | null }}
   */
  function releaseCooldown({ accountId, releasedBy, releasedAt, expectedRevision }) {
    const id = requireText(accountId, 'accountId')
    const reason = requireEnum(releasedBy, COOLDOWN_RELEASE_REASONS, 'releasedBy')
    const at = requireIso(releasedAt, 'releasedAt')
    const revision = expectedRevision === undefined || expectedRevision === null ? null : requireRevision(expectedRevision)
    const result = connection
      .prepare(
        `UPDATE account_cooldowns
         SET released_at = ?, released_by = ?, revision = revision + 1
         WHERE account_id = ? AND released_at IS NULL AND (? IS NULL OR revision = ?)`,
      )
      .run(at, reason, id, revision, revision)
    return { applied: result.changes === 1, cooldown: getCooldown(id) }
  }

  /**
   * Marca como vencidas as esperas com fim até `nowIso`. O `released_at` é o
   * próprio fim da espera (quando ela de fato acabou), para que uma checagem
   * de login feita depois do vencimento conte, mesmo que o app estivesse
   * fechado nessa hora.
   *
   * @returns {number} Quantas esperas venceram.
   */
  function releaseExpiredCooldowns(nowIso) {
    const now = requireIso(nowIso, 'nowIso')
    return Number(
      connection
        .prepare(
          `UPDATE account_cooldowns
           SET released_at = until_at, released_by = 'vencimento', revision = revision + 1
           WHERE released_at IS NULL AND until_at IS NOT NULL AND until_at <= ?`,
        )
        .run(now).changes,
    )
  }

  function getLoginCheck(accountId) {
    const row = connection.prepare('SELECT * FROM account_login_checks WHERE account_id = ?').get(requireText(accountId, 'accountId'))
    return row ? mapLoginCheckRow(row) : null
  }

  function listLoginChecks() {
    return connection.prepare('SELECT * FROM account_login_checks ORDER BY account_id ASC').all().map(mapLoginCheckRow)
  }

  /**
   * Guarda a última checagem de login da conta. Uma checagem mais antiga que
   * a gravada (outro processo terminou depois) não sobrescreve a mais nova.
   *
   * @returns {{ applied: boolean, check: object | null }}
   */
  function recordLoginCheck(input) {
    if (!input || typeof input !== 'object') throw new Error('Checagem de login inválida.')
    const check = {
      accountId: requireText(input.accountId, 'accountId'),
      providerId: requireText(input.providerId, 'providerId', SHORT_TEXT_MAX_CHARS),
      status: requireEnum(input.status, LOGIN_CHECK_STATUSES, 'status'),
      checkedAt: requireIso(input.checkedAt, 'checkedAt'),
      source: requireEnum(input.source, LOGIN_CHECK_SOURCES, 'source'),
      durationMs: optionalNumber(input.durationMs, 'durationMs', { min: 0, integer: true }),
      method: optionalText(input.method, 'method', SWITCH_LABEL_MAX_CHARS),
      plan: optionalText(input.plan, 'plan', SWITCH_LABEL_MAX_CHARS),
      billingDetected: optionalEnum(input.billingDetected, BILLING_CLASSES, 'billingDetected'),
      apiKeySourcePresent:
        input.apiKeySourcePresent === undefined ? false : requireBoolean(input.apiKeySourcePresent, 'apiKeySourcePresent'),
      multiplierDetected: optionalNumber(input.multiplierDetected, 'multiplierDetected', {
        min: MIN_PLAN_MULTIPLIER,
        max: MAX_PLAN_MULTIPLIER,
      }),
      identityKey: optionalText(input.identityKey, 'identityKey', SHORT_TEXT_MAX_CHARS * 2),
      identityStatus: optionalEnum(input.identityStatus, IDENTITY_STATUSES, 'identityStatus'),
    }
    const result = connection
      .prepare(
        `INSERT INTO account_login_checks
           (account_id, provider_id, status, checked_at, source, duration_ms, method, plan,
            billing_detected, api_key_source_present, multiplier_detected, identity_key, identity_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET
           provider_id = excluded.provider_id,
           status = excluded.status,
           checked_at = excluded.checked_at,
           source = excluded.source,
           duration_ms = excluded.duration_ms,
           method = excluded.method,
           plan = excluded.plan,
           billing_detected = excluded.billing_detected,
           api_key_source_present = excluded.api_key_source_present,
           multiplier_detected = excluded.multiplier_detected,
           identity_key = excluded.identity_key,
           identity_status = excluded.identity_status
         WHERE excluded.checked_at >= account_login_checks.checked_at`,
      )
      .run(
        check.accountId,
        check.providerId,
        check.status,
        check.checkedAt,
        check.source,
        check.durationMs,
        check.method,
        check.plan,
        check.billingDetected,
        check.apiKeySourcePresent ? 1 : 0,
        check.multiplierDetected,
        check.identityKey,
        check.identityStatus,
      )
    return { applied: result.changes === 1, check: getLoginCheck(check.accountId) }
  }

  function getSwitchEvent(id) {
    const row = connection.prepare('SELECT * FROM account_switch_events WHERE id = ?').get(requireText(id, 'id'))
    return row ? mapSwitchEventRow(row) : null
  }

  function findOpenSwitchEventForSession(sessionId) {
    const row = connection
      .prepare(`SELECT * FROM account_switch_events WHERE source_session_id = ? AND state IN (${OPEN_STATES_SQL})`)
      .get(requireText(sessionId, 'sessionId'))
    return row ? mapSwitchEventRow(row) : null
  }

  function listOpenSwitchEvents() {
    return connection
      .prepare(`SELECT * FROM account_switch_events WHERE state IN (${OPEN_STATES_SQL}) ORDER BY proposed_at ASC, rowid ASC`)
      .all()
      .map(mapSwitchEventRow)
  }

  function listSwitchEventsByLineage(lineageId) {
    return connection
      .prepare('SELECT * FROM account_switch_events WHERE lineage_id = ? ORDER BY proposed_at ASC, rowid ASC')
      .all(requireText(lineageId, 'lineageId'))
      .map(mapSwitchEventRow)
  }

  /**
   * Histórico, do mais novo para o mais antigo.
   *
   * @param {{ limit?: number, before?: string }} [options] - `before` pagina pelo horário da proposta.
   */
  function listSwitchEvents({ limit = SWITCH_HISTORY_PAGE_MAX, before } = {}) {
    const pageSize = optionalNumber(limit, 'limit', { min: 1, max: SWITCH_HISTORY_PAGE_MAX, integer: true })
    const cursor = optionalIso(before, 'before')
    const rows = cursor
      ? connection
          .prepare('SELECT * FROM account_switch_events WHERE proposed_at < ? ORDER BY proposed_at DESC, rowid DESC LIMIT ?')
          .all(cursor, pageSize)
      : connection.prepare('SELECT * FROM account_switch_events ORDER BY proposed_at DESC, rowid DESC LIMIT ?').all(pageSize)
    return rows.map(mapSwitchEventRow)
  }

  /**
   * Grava um evento novo. Id repetido (confirm duplo, IPC repetido) ou uma
   * segunda proposta aberta para a mesma sessão não nascem: devolvem o evento
   * que já existe.
   *
   * @returns {{ inserted: true, event: object } | { inserted: false, code: 'DUPLICATE_ID' | 'OPEN_EVENT_EXISTS', event: object }}
   */
  function insertSwitchEvent(event) {
    const columns = normalizeNewSwitchEvent(event)
    const names = Object.keys(columns)

    return inImmediateTransaction(connection, () => {
      const sameId = getSwitchEvent(columns.id)
      if (sameId) return { inserted: false, code: 'DUPLICATE_ID', event: sameId }
      if (columns.source_session_id !== null && OPEN_SWITCH_EVENT_STATES.includes(columns.state)) {
        const open = findOpenSwitchEventForSession(columns.source_session_id)
        if (open) return { inserted: false, code: 'OPEN_EVENT_EXISTS', event: open }
      }
      connection
        .prepare(
          `INSERT INTO account_switch_events (${names.join(', ')}, revision)
           VALUES (${names.map(() => '?').join(', ')}, 1)`,
        )
        .run(...names.map((name) => columns[name]))
      return { inserted: true, event: getSwitchEvent(columns.id) }
    })
  }

  /**
   * Compare-and-set de uma transição (ou de uma alteração no mesmo estado,
   * com `fromState === toState`). Só aplica se o evento ainda estiver em
   * `fromState` na revisão `expectedRevision`; transição fora da máquina de
   * estados é erro de programação e lança.
   *
   * @returns {{ applied: boolean, event: object | null }}
   */
  function transitionSwitchEvent({ id, fromState, toState, expectedRevision, patch }) {
    const eventId = requireText(id, 'id')
    requireEnum(fromState, SWITCH_EVENT_STATES, 'fromState')
    requireEnum(toState, SWITCH_EVENT_STATES, 'toState')
    requireRevision(expectedRevision)
    if (fromState !== toState && !SWITCH_EVENT_TRANSITIONS[fromState]?.includes(toState)) {
      throw new Error(`Transição de ${fromState} para ${toState} não existe na cadeia de contas.`)
    }
    const columns = normalizeSwitchEventPatch(patch)
    const assignments = Object.keys(columns).map((column) => `, ${column} = ?`).join('')
    const result = connection
      .prepare(
        `UPDATE account_switch_events
         SET state = ?, revision = revision + 1${assignments}
         WHERE id = ? AND state = ? AND revision = ?`,
      )
      .run(toState, ...Object.values(columns), eventId, fromState, expectedRevision)
    return { applied: result.changes === 1, event: getSwitchEvent(eventId) }
  }

  /**
   * Vence as propostas e os tickets com prazo até `nowIso`.
   *
   * @returns {object[]} Os eventos que venceram agora, para avisar a interface.
   */
  function expireDueSwitchEvents(nowIso) {
    const now = requireIso(nowIso, 'nowIso')
    return inImmediateTransaction(connection, () => {
      const due = connection
        .prepare(
          `SELECT id FROM account_switch_events
           WHERE state IN ('proposed', 'confirmed') AND expires_at <= ?
           ORDER BY proposed_at ASC, rowid ASC`,
        )
        .all(now)
      connection
        .prepare(
          `UPDATE account_switch_events SET state = 'expired', revision = revision + 1
           WHERE state IN ('proposed', 'confirmed') AND expires_at <= ?`,
        )
        .run(now)
      return due.map((row) => getSwitchEvent(row.id))
    })
  }

  function deleteAccountRows(accountIdsJson, negate) {
    const filter = `account_id ${negate ? 'NOT IN' : 'IN'} (SELECT value FROM json_each(?))`
    return {
      members: Number(connection.prepare(`DELETE FROM account_chain_members WHERE ${filter}`).run(accountIdsJson).changes),
      cooldowns: Number(connection.prepare(`DELETE FROM account_cooldowns WHERE ${filter}`).run(accountIdsJson).changes),
      loginChecks: Number(connection.prepare(`DELETE FROM account_login_checks WHERE ${filter}`).run(accountIdsJson).changes),
    }
  }

  /**
   * Tira a conta removida da lista, da espera e das checagens. O registro de
   * trocas fica, com o rótulo guardado como fotografia.
   */
  function forgetAccount(accountId, nowIso) {
    const id = requireText(accountId, 'accountId')
    const now = requireIso(nowIso, 'nowIso')
    return inImmediateTransaction(connection, () => {
      const removed = deleteAccountRows(JSON.stringify([id]), false)
      if (removed.members > 0) bumpSettingsRevision(now)
      return removed
    })
  }

  /**
   * Recuperação no início do app. Nada que estava pendente é executado:
   * proposta e ticket viram `expired`; um spawn em andamento vira
   * `spawn_failed`, porque o PTY morre com o app; esperas vencidas são
   * marcadas; contas que não existem mais saem da lista, da espera e das
   * checagens (o registro fica).
   *
   * @param {{ nowIso: string, knownAccountIds: string[] | null }} options -
   *   `knownAccountIds: null` quando o registro de contas não pôde ser lido:
   *   uma lista vazia apagaria todos os membros.
   */
  function recoverOnStartup({ nowIso, knownAccountIds }) {
    const now = requireIso(nowIso, 'nowIso')
    let knownJson = null
    if (knownAccountIds !== null) {
      if (!Array.isArray(knownAccountIds)) throw new Error('Lista de contas conhecidas inválida.')
      knownJson = JSON.stringify(knownAccountIds.map((id) => requireText(id, 'knownAccountIds')))
    }

    return inImmediateTransaction(connection, () => {
      const expired = Number(
        connection
          .prepare(
            `UPDATE account_switch_events SET state = 'expired', revision = revision + 1
             WHERE state IN ('proposed', 'confirmed')`,
          )
          .run().changes,
      )
      const spawnFailed = Number(
        connection
          .prepare(
            `UPDATE account_switch_events SET state = 'spawn_failed', revision = revision + 1
             WHERE state = 'spawning'`,
          )
          .run().changes,
      )
      const cooldownsReleased = releaseExpiredCooldowns(now)
      const removed = knownJson === null ? { members: 0, cooldowns: 0, loginChecks: 0 } : deleteAccountRows(knownJson, true)
      if (removed.members > 0) bumpSettingsRevision(now)
      return { expired, spawnFailed, cooldownsReleased, removed }
    })
  }

  /**
   * Retenção do registro de trocas: ficam as `keep` linhas mais recentes, e
   * uma linha em estado aberto nunca é apagada.
   *
   * @returns {number} Quantas linhas saíram.
   */
  function pruneSwitchEvents({ keep = SWITCH_EVENTS_RETENTION } = {}) {
    const limit = optionalNumber(keep, 'keep', { min: 0, integer: true })
    return Number(
      connection
        .prepare(
          `DELETE FROM account_switch_events
           WHERE state NOT IN (${OPEN_STATES_SQL})
             AND id NOT IN (
               SELECT id FROM account_switch_events ORDER BY proposed_at DESC, rowid DESC LIMIT ?
             )`,
        )
        .run(limit).changes,
    )
  }

  return {
    expireDueSwitchEvents,
    findOpenSwitchEventForSession,
    forgetAccount,
    getCooldown,
    getLoginCheck,
    getSwitchEvent,
    insertSwitchEvent,
    listCooldowns,
    listLoginChecks,
    listMembers,
    listOpenSwitchEvents,
    listSwitchEvents,
    listSwitchEventsByLineage,
    pruneSwitchEvents,
    readSettings,
    recordLoginCheck,
    recoverOnStartup,
    releaseCooldown,
    releaseExpiredCooldowns,
    replaceMembers,
    transitionSwitchEvent,
    updateSettings,
    upsertCooldown,
  }
}

module.exports = {
  createAccountChainRepository,
  parseCandidates,
}
