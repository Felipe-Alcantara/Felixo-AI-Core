'use strict'

/**
 * @module accounts/account-chain-service
 * Serviço da cadeia de contas no processo principal: detecção → espera →
 * proposta → ticket → registro (máquina de estados da política de contas).
 *
 * É a trava de toda troca (P1): só este serviço cria proposta e ticket, só
 * `confirm` transforma uma proposta em ticket, e um ticket vale uma vez e só
 * para a conta confirmada. Nada aqui abre processo: o bloco novo nasce no
 * renderer, com o ticket, e o `pty:spawn` passa por `beginTicketSpawn`.
 *
 * O estado de decisão mora só no SQLite, com compare-and-set (P6). A memória
 * guarda apenas o que pode se perder num reinício sem executar nada: a fila
 * por sessão e as detecções ambíguas à espera de escolha.
 *
 * Tudo que é regra pura ou efeito de outro módulo chega por injeção, para o
 * serviço ser testado com dublês e não depender da ordem de montagem no main:
 *
 * - `repository`: `account-chain-repository.cjs` (migration 017).
 * - `policy.evaluateEligibility(input)` → `{ eligible, reason }`, com `input` =
 *   `{ nowMs, settings, member, account, cooldown, loginCheck,
 *   sourceAccountId, visitedAccountIds }` (primeira razão bloqueante; ver
 *   `account-chain-policy.cjs`).
 * - `policy.rankCandidates({ strategy, candidates, lastDestinationAccountId,
 *   nowMs })` → lista ordenada de `{ accountId, explanation? }`. Cada
 *   candidato é `{ accountId, providerId, position, member, account,
 *   loginCheck, cooldown, eligibility }`.
 * - `policy.resolveCooldownEnd({ providerId, failureClass, evidence,
 *   measurement, nowMs })` → `{ untilAt, untilSource }` (medição, texto ou
 *   padrão; vale o mais tarde).
 * - `checkLogin(accountId)`: checagem de login da conta
 *   (`account-eligibility.cjs`), que grava o resultado em
 *   `account_login_checks`; o serviço relê do repositório.
 * - `describeAccount(accountId)` → `{ label, providerId, measurement?, … }`
 *   ou `null` (conta removida): os fatos da conta que a política lê.
 * - `listAccounts()` → `[{ id, providerId, label }]` do registro de contas;
 *   lança se o registro estiver ilegível.
 * - `listLiveSessions()` → `[{ sessionId, accountId, providerId,
 *   accountMode, lastOutputAt? }]` (`listarSessoesVivas` do PTY).
 * - `setSessionAccountMode(sessionId, mode)` → `boolean`.
 * - `parseResetFromText`: `reset-time.cjs`, para o "continua sozinho às…".
 * - `emit(channel, payload)`: push ao renderer (`account-chain:changed`,
 *   `:proposal`, `:detection`), sempre com payload redigido.
 * - `log(entry)`: log QA `account-chain`, só com a transição, sem texto cru.
 * - `now()` e `randomUUID()`: relógio e ids, falsos nos testes.
 */

const crypto = require('node:crypto')

const { redactSecrets } = require('../official-cli-account-status.cjs')
const { FAILURE_CLASSES } = require('./failure-taxonomy.cjs')
const { parseResetFromText: parseResetFromTextDefault } = require('./reset-time.cjs')
const {
  CHAIN_PROVIDER_IDS,
  COOLDOWN_FAILURE_CLASSES,
  EVIDENCE_HASH_HEX_CHARS,
  EVIDENCE_MAX_CHARS,
  MAX_LOGIN_CHECKS_PER_PROPOSAL,
  MAX_MAX_HOPS_PER_LINEAGE,
  MAX_PENDING_AMBIGUOUS_DETECTIONS,
  POST_SWITCH_FAILURE_WINDOW_MS,
  PROPOSAL_TTL_MS,
  SOURCE_ACTIVE_QUIET_MS,
  SWITCH_LABEL_MAX_CHARS,
  SWITCH_REASON_MAX_CHARS,
  TICKET_TTL_MS,
} = require('./account-chain-constants.cjs')

/** Classes que só geram uma faixa curta: trocar de conta não resolve (P4). */
const TRANSIENT_FAILURE_CLASSES = Object.freeze(['provider', 'network', 'timeout'])

/** Tipos de evento que passam pela máquina proposta → ticket → spawn. */
const CHAIN_EVENT_KINDS = Object.freeze(['continuation', 'launch'])

/** Estados que silenciam a mesma evidência na mesma sessão (I6). */
const SILENCING_STATES = Object.freeze(['declined', 'dismissed'])

/** Aviso do Claude "Your usage limit has reset · press enter to continue": não é limite. */
const LIMIT_RESET_NOTICE = 'limit_reset'

/** Razão de elegibilidade que só pede uma checagem de login (§6.1, regra 7). */
const LOGIN_NOT_CHECKED_REASON = 'login-nao-conferido'

const SESSION_ACCOUNT_MODES = Object.freeze(['pinned', 'chain'])
const CHAIN_ACCOUNT_MODE = 'chain'
const SYSTEM_LOGIN_LABEL = 'Login do sistema'
const PROVIDER_NAMES = Object.freeze({ codex: 'Codex', claude: 'Claude', gemini: 'Gemini', openia: 'Openia' })
const DEFAULT_SWEEP_INTERVAL_MS = 60 * 1000

const DECLINE_STATES = Object.freeze({ later: 'declined', 'not-a-limit': 'dismissed' })
const RELEASE_REASONS = Object.freeze({ 'not-a-limit': 'nao_era_limite', recharged: 'recarregou', manual: 'manual' })
const AMBIGUOUS_CHOICES = Object.freeze(['limit', 'ignore'])

function toIso(ms) {
  return new Date(ms).toISOString()
}

function isNonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function clip(value, maxChars) {
  return typeof value === 'string' && value ? value.slice(0, maxChars) : null
}

function providerName(providerId) {
  return PROVIDER_NAMES[providerId] ?? providerId
}

function failure(code, extra = {}) {
  return { ok: false, code, ...extra }
}

/** Motivo gravado no registro: fato + origem, sem a linha crua da CLI. */
function buildReason({ failureClass, fromLabel, fromAccountId, fromProviderId, kind, suffix }) {
  const who = fromAccountId
    ? `na conta ${fromLabel ?? fromAccountId} (${providerName(fromProviderId)})`
    : `no ${SYSTEM_LOGIN_LABEL} (${providerName(fromProviderId)})`
  const base =
    kind === 'launch'
      ? `Conta automática pela cadeia para um bloco novo de ${providerName(fromProviderId)}`
      : failureClass === 'auth'
        ? `Login perdido ${who}`
        : failureClass === 'billing'
          ? `Sem crédito ${who}`
          : `Limite de uso ${who}`
  return redactSecrets(suffix ? `${base} · ${suffix}` : base).slice(0, SWITCH_REASON_MAX_CHARS)
}

function publicLoginCheck(check) {
  if (!check) return null
  return {
    status: check.status,
    checkedAt: check.checkedAt,
    source: check.source,
    method: check.method,
    plan: check.plan,
    billingDetected: check.billingDetected,
    apiKeySourcePresent: check.apiKeySourcePresent,
    multiplierDetected: check.multiplierDetected,
    identityStatus: check.identityStatus,
  }
}

function toMemberInput(member) {
  return {
    accountId: member.accountId,
    providerId: member.providerId,
    enabled: member.enabled,
    billingDeclared: member.billingDeclared ?? null,
    multiplierDeclared: member.multiplierDeclared ?? null,
  }
}

/**
 * Formato da detecção que a vigia do terminal entrega. Tudo que não bate é
 * descartado (fail-closed); a evidência é redigida de novo aqui, por defesa,
 * antes de chegar a banco, push ou log.
 */
function normalizeDetection(input) {
  if (!input || typeof input !== 'object') return null
  if (!isNonEmptyText(input.sessionId) || !isNonEmptyText(input.providerId)) return null
  // A vigia entrega o aviso "o limite voltou" como `{ kind: 'notice' }`, sem
  // `failure`: vira uma detecção sem classe que só serve ao `source_resumed`.
  const detected =
    input.kind === 'notice' && input.notice === LIMIT_RESET_NOTICE
      ? { failureClass: null, notice: LIMIT_RESET_NOTICE }
      : input.failure
  if (!detected || typeof detected !== 'object') return null
  if (detected.notice !== LIMIT_RESET_NOTICE && !FAILURE_CLASSES.includes(detected.failureClass)) return null

  const accountId = isNonEmptyText(input.accountId) ? input.accountId : null
  const evidence = typeof detected.evidence === 'string' && detected.evidence ? redactSecrets(detected.evidence) : null
  return {
    sessionId: input.sessionId,
    providerId: input.providerId,
    accountId,
    accountMode: accountId && input.accountMode === CHAIN_ACCOUNT_MODE ? CHAIN_ACCOUNT_MODE : 'pinned',
    lineageId: isNonEmptyText(input.lineageId) ? input.lineageId : input.sessionId,
    failure: {
      failureClass: FAILURE_CLASSES.includes(detected.failureClass) ? detected.failureClass : null,
      scope: detected.scope === 'model' ? 'model' : 'account',
      ambiguous: detected.ambiguous === true,
      evidence: evidence ? evidence.slice(0, EVIDENCE_MAX_CHARS) : null,
      evidenceHash: isNonEmptyText(detected.evidenceHash) ? detected.evidenceHash.slice(0, EVIDENCE_HASH_HEX_CHARS) : null,
      notice: detected.notice === LIMIT_RESET_NOTICE ? LIMIT_RESET_NOTICE : null,
    },
  }
}

/**
 * @param {object} deps - ver o cabeçalho do módulo.
 */
function createAccountChainService({
  repository,
  policy,
  checkLogin,
  describeAccount,
  listAccounts,
  listLiveSessions,
  setSessionAccountMode = null,
  parseResetFromText = parseResetFromTextDefault,
  emit = () => {},
  log = () => {},
  now = () => Date.now(),
  randomUUID = () => crypto.randomUUID(),
} = {}) {
  if (!repository || !policy || typeof checkLogin !== 'function') {
    throw new Error('Serviço da cadeia de contas precisa de repositório, política e checagem de login.')
  }
  for (const name of ['evaluateEligibility', 'rankCandidates', 'resolveCooldownEnd']) {
    if (typeof policy[name] !== 'function') throw new Error(`Política da cadeia sem ${name}.`)
  }
  if (typeof describeAccount !== 'function' || typeof listAccounts !== 'function' || typeof listLiveSessions !== 'function') {
    throw new Error('Serviço da cadeia de contas precisa ler contas e sessões vivas.')
  }

  const sessionQueues = new Map()
  const ambiguousDetections = new Map()

  // ── Saídas (push e log QA), que nunca derrubam o serviço ──────────────────

  function safeEmit(channel, payload) {
    try {
      emit(channel, payload)
    } catch {
      // Janela fechada ou recarregando: o renderer relê com get-state ao montar.
    }
  }

  function safeLog(entry) {
    try {
      log({ scope: 'account-chain', ...entry })
    } catch {
      // O log QA é diagnóstico; falhar nele não muda a decisão.
    }
  }

  function logEvent(transition, event, extra = {}) {
    safeLog({
      transition,
      eventId: event?.id ?? null,
      kind: event?.kind ?? null,
      state: event?.state ?? null,
      failureClass: event?.failureClass ?? null,
      providerId: event?.fromProviderId ?? null,
      ...extra,
    })
  }

  function emitChanged(reason) {
    safeEmit('account-chain:changed', { reason })
  }

  function publishDetection(detection, extra) {
    safeEmit('account-chain:detection', {
      sessionId: detection.sessionId,
      accountId: detection.accountId,
      providerId: detection.providerId,
      failureClass: detection.failure.failureClass,
      scope: detection.failure.scope,
      ambiguous: detection.failure.ambiguous,
      evidence: detection.failure.evidence,
      ...extra,
    })
  }

  // ── Leituras injetadas, sempre fail-closed ────────────────────────────────

  function safeDescribe(accountId) {
    try {
      return describeAccount(accountId) ?? null
    } catch {
      return null
    }
  }

  function findLiveSession(sessionId) {
    try {
      return (listLiveSessions() ?? []).find((session) => session?.sessionId === sessionId) ?? null
    } catch {
      return null
    }
  }

  function readKnownAccounts() {
    try {
      const accounts = listAccounts()
      return Array.isArray(accounts) ? accounts.filter((account) => isNonEmptyText(account?.id)) : null
    } catch {
      return null
    }
  }

  /** Fila por sessão: duas detecções da mesma sessão nunca decidem ao mesmo tempo. */
  function serialize(key, task) {
    const previous = sessionQueues.get(key) ?? Promise.resolve()
    const run = previous.then(task)
    const tail = run.catch(() => {})
    sessionQueues.set(key, tail)
    tail.then(() => {
      if (sessionQueues.get(key) === tail) sessionQueues.delete(key)
    })
    return run
  }

  // ── Elegibilidade e escolha do destino ────────────────────────────────────

  function evaluateMember(member, context) {
    const account = safeDescribe(member.accountId)
    const cooldown = repository.getCooldown(member.accountId)
    const loginCheck = repository.getLoginCheck(member.accountId)
    let eligibility
    try {
      const result = policy.evaluateEligibility({
        nowMs: context.nowMs,
        settings: context.settings,
        member,
        account,
        cooldown,
        loginCheck,
        sourceAccountId: context.sourceAccountId ?? null,
        visitedAccountIds: context.visitedAccountIds ?? [],
      })
      const eligible = result?.eligible === true
      eligibility = { eligible, reason: eligible ? null : isNonEmptyText(result?.reason) ? result.reason : 'desconhecido' }
    } catch {
      eligibility = { eligible: false, reason: 'erro-na-avaliacao' }
    }
    return { member, account, cooldown, loginCheck, eligibility, explanation: null }
  }

  /** Apta, ou só falta conferir o login (a checagem é preguiçosa, §6.2). */
  function isSelectable(entry) {
    return entry.eligibility.eligible || entry.eligibility.reason === LOGIN_NOT_CHECKED_REASON
  }

  function rankPool(strategy, pool, nowMs) {
    if (pool.length === 0) return []
    const lastDestination = repository.findLastSpawnedDestination()
    let ranked
    try {
      ranked = policy.rankCandidates({
        strategy,
        candidates: pool.map((entry) => ({
          accountId: entry.member.accountId,
          providerId: entry.member.providerId,
          position: entry.member.position,
          member: entry.member,
          account: entry.account,
          loginCheck: entry.loginCheck,
          cooldown: entry.cooldown,
          eligibility: entry.eligibility,
        })),
        lastDestinationAccountId: lastDestination?.accountId ?? null,
        nowMs,
      })
    } catch (error) {
      // Sem ordem da estratégia, vale a ordem manual: a pessoa ainda confirma.
      safeLog({ transition: 'rank-failed', message: redactSecrets(error?.message ?? '') })
      return pool
    }
    const byId = new Map(pool.map((entry) => [entry.member.accountId, entry]))
    const ordered = []
    for (const item of Array.isArray(ranked) ? ranked : []) {
      const entry = byId.get(item?.accountId)
      if (!entry) continue
      byId.delete(item.accountId)
      ordered.push({ ...entry, explanation: isNonEmptyText(item.explanation) ? item.explanation : null })
    }
    return ordered
  }

  function toCandidateRecord(entry, rank) {
    return {
      accountId: entry.member.accountId,
      providerId: entry.member.providerId,
      label: clip(entry.account?.label, SWITCH_LABEL_MAX_CHARS),
      rank,
      eligible: entry.eligibility.eligible,
      selectable: isSelectable(entry),
      reason: entry.eligibility.reason,
      explanation: entry.explanation,
    }
  }

  /**
   * Escolhe o destino na ordem da estratégia. A checagem de login roda só
   * quando falta, na ordem, no máximo `MAX_LOGIN_CHECKS_PER_PROPOSAL` vezes,
   * e para na primeira conta apta (a máquina é fraca, §6.2).
   */
  async function selectDestination({ settings, sourceAccountId, visitedAccountIds, providerFilter }) {
    const context = { nowMs: now(), settings, sourceAccountId, visitedAccountIds }
    const members = repository
      .listMembers()
      .filter((member) => !providerFilter || member.providerId === providerFilter)
    const evaluated = members.map((member) => evaluateMember(member, context))
    const ranked = rankPool(settings.strategy, evaluated.filter(isSelectable), context.nowMs)

    let recommended = null
    let checks = 0
    for (let index = 0; index < ranked.length && !recommended; index++) {
      if (ranked[index].eligibility.eligible) {
        recommended = ranked[index]
        break
      }
      if (checks >= MAX_LOGIN_CHECKS_PER_PROPOSAL) continue
      checks++
      await runLoginCheck(ranked[index].member.accountId)
      const rechecked = evaluateMember(ranked[index].member, { ...context, nowMs: now() })
      ranked[index] = { ...rechecked, explanation: ranked[index].explanation }
      if (rechecked.eligibility.eligible) recommended = ranked[index]
    }

    const rankedIds = new Set(ranked.map((entry) => entry.member.accountId))
    const candidates = [
      ...ranked.map((entry, index) => toCandidateRecord(entry, index + 1)),
      ...evaluated.filter((entry) => !rankedIds.has(entry.member.accountId)).map((entry) => toCandidateRecord(entry, null)),
    ]
    return { recommended, candidates }
  }

  function readLineage(lineageId, fromAccountId) {
    const events = lineageId ? repository.listSwitchEventsByLineage(lineageId) : []
    const spawned = events.filter((event) => event.kind === 'continuation' && event.state === 'spawned')
    const visited = new Set(
      [fromAccountId, ...spawned.flatMap((event) => [event.fromAccountId, event.toAccountId])].filter(isNonEmptyText),
    )
    return { hops: spawned.length, visited }
  }

  // ── Checagem de login e espera ────────────────────────────────────────────

  /**
   * Uma espera de login sai quando uma checagem `logged_in` é posterior à
   * detecção (§4.2). Crédito não sai sozinho: exige "Já recarreguei".
   */
  function releaseCooldownsConfirmedByCheck(accountIds = null) {
    let released = 0
    for (const cooldown of repository.listCooldowns()) {
      if (cooldown.failureClass !== 'auth') continue
      if (accountIds && !accountIds.includes(cooldown.accountId)) continue
      const check = repository.getLoginCheck(cooldown.accountId)
      if (check?.status !== 'logged_in' || Date.parse(check.checkedAt) <= Date.parse(cooldown.detectedAt)) continue
      const result = repository.releaseCooldown({
        accountId: cooldown.accountId,
        releasedBy: 'checagem',
        releasedAt: check.checkedAt,
        expectedRevision: cooldown.revision,
      })
      if (result.applied) released++
    }
    return released
  }

  async function runLoginCheck(accountId) {
    try {
      await checkLogin(accountId)
    } catch (error) {
      // Checagem que falhou deixa a conta fora (fail-closed); o motivo fica no repositório.
      safeLog({ transition: 'login-check-failed', accountId, message: redactSecrets(error?.message ?? '') })
    }
    releaseCooldownsConfirmedByCheck([accountId])
    return repository.getLoginCheck(accountId)
  }

  function resolveUntil(detection, nowMs) {
    if (detection.failure.failureClass !== 'limit') return { untilAt: null, untilSource: 'checagem' }
    try {
      const account = safeDescribe(detection.accountId)
      const until = policy.resolveCooldownEnd({
        providerId: detection.providerId,
        failureClass: 'limit',
        evidence: detection.failure.evidence,
        measurement: account?.measurement ?? null,
        nowMs,
      })
      if (until && (until.untilAt === null || Number.isFinite(Date.parse(until.untilAt))) && isNonEmptyText(until.untilSource)) {
        return { untilAt: until.untilAt, untilSource: until.untilSource }
      }
    } catch (error) {
      safeLog({ transition: 'cooldown-end-failed', message: redactSecrets(error?.message ?? '') })
    }
    // Sem fim conhecido, a conta espera até uma checagem ou ação: nunca volta cedo.
    return { untilAt: null, untilSource: 'checagem' }
  }

  function putInCooldown(detection, detectedAt, nowMs) {
    const until = resolveUntil(detection, nowMs)
    const result = repository.upsertCooldown({
      accountId: detection.accountId,
      providerId: detection.providerId,
      failureClass: detection.failure.failureClass,
      detectedAt,
      untilAt: until.untilAt,
      untilSource: until.untilSource,
      evidence: detection.failure.evidence,
      evidenceHash: detection.failure.evidenceHash,
      sessionId: detection.sessionId,
    })
    if (result.applied) {
      safeLog({ transition: 'cooldown', accountId: detection.accountId, failureClass: detection.failure.failureClass, untilSource: until.untilSource })
    }
    return result.cooldown
  }

  /**
   * Falha de login ou de crédito no bloco novo logo depois de nascer volta ao
   * evento que o criou ("a conta de destino falhou logo após a troca").
   */
  function markPostSwitchFailure(detection, nowMs) {
    const { failureClass } = detection.failure
    if (failureClass !== 'auth' && failureClass !== 'billing') return null
    const origin = repository.findSpawnedSwitchEventForTarget(detection.sessionId)
    if (!origin || origin.postSwitchFailure) return null
    const spawnedMs = Date.parse(origin.spawnedAt ?? '')
    if (!Number.isFinite(spawnedMs) || nowMs - spawnedMs > POST_SWITCH_FAILURE_WINDOW_MS) return null
    const result = repository.transitionSwitchEvent({
      id: origin.id,
      fromState: 'spawned',
      toState: 'spawned',
      expectedRevision: origin.revision,
      patch: { postSwitchFailure: failureClass },
    })
    if (result.applied) logEvent('post-switch-failure', result.event)
    return result.applied ? result.event : null
  }

  // ── Registro ──────────────────────────────────────────────────────────────

  function insertEvent(event) {
    const result = repository.insertSwitchEvent(event)
    if (result.inserted) logEvent('insert', result.event)
    return result
  }

  function expireEvent(event, cause) {
    if (!event || (event.state !== 'proposed' && event.state !== 'confirmed')) return false
    const result = repository.transitionSwitchEvent({
      id: event.id,
      fromState: event.state,
      toState: 'expired',
      expectedRevision: event.revision,
    })
    if (result.applied) logEvent('expire', result.event, { cause })
    return result.applied
  }

  function expireOpenProposals(predicate, cause) {
    let expired = 0
    for (const event of repository.listOpenSwitchEvents()) {
      if (event.state === 'proposed' && predicate(event) && expireEvent(event, cause)) expired++
    }
    return expired
  }

  function sourceContext(detection, cooldown, detectedAt, nowMs) {
    const fromLabel = detection.accountId ? clip(safeDescribe(detection.accountId)?.label, SWITCH_LABEL_MAX_CHARS) : SYSTEM_LOGIN_LABEL
    let autoResume = null
    try {
      autoResume = detection.failure.evidence ? parseResetFromText(detection.failure.evidence, { nowMs }) : null
    } catch {
      autoResume = null
    }
    return {
      kind: 'continuation',
      sourceSessionId: detection.sessionId,
      fromAccountId: detection.accountId,
      fromProviderId: detection.providerId,
      fromLabel,
      lineageId: detection.lineageId,
      failureClass: detection.failure.failureClass,
      evidenceHash: detection.failure.evidenceHash,
      incidentKey: cooldown ? `${cooldown.accountId}|${cooldown.detectedAt}` : null,
      detectedAt,
      sourceAutoResumeAt: autoResume?.autoResume ? autoResume.resetAt : null,
      providerFilter: null,
    }
  }

  function contextFromEvent(event) {
    return {
      kind: event.kind,
      sourceSessionId: event.sourceSessionId,
      fromAccountId: event.fromAccountId,
      fromProviderId: event.fromProviderId,
      fromLabel: event.fromLabel,
      lineageId: event.lineageId,
      failureClass: event.failureClass,
      evidenceHash: event.evidenceHash,
      incidentKey: event.incidentKey,
      detectedAt: event.detectedAt,
      sourceAutoResumeAt: event.sourceAutoResumeAt,
      providerFilter: event.kind === 'launch' ? event.fromProviderId : null,
    }
  }

  function baseEvent(context, nowMs) {
    const proposedAt = toIso(nowMs)
    return {
      id: randomUUID(),
      kind: context.kind,
      sourceSessionId: context.sourceSessionId,
      lineageId: context.lineageId,
      incidentKey: context.incidentKey,
      fromAccountId: context.fromAccountId,
      fromProviderId: context.fromProviderId,
      fromLabel: context.fromLabel,
      failureClass: context.failureClass,
      evidenceHash: context.evidenceHash,
      detectedAt: context.detectedAt,
      sourceAutoResumeAt: context.sourceAutoResumeAt,
      proposedAt,
      expiresAt: proposedAt,
    }
  }

  function recordNotice(context, cause) {
    return insertEvent({
      ...baseEvent(context, now()),
      kind: 'notice',
      state: 'noticed',
      reason: buildReason({ ...context, kind: 'notice', suffix: cause }),
    })
  }

  /**
   * Proposta nova (ou `no_candidate`), guardada pelo índice parcial único: uma
   * segunda proposta aberta para a mesma sessão não nasce (I1).
   */
  async function createProposal(context, settings) {
    const lineage = readLineage(context.lineageId, context.fromAccountId)
    const nextHop = Math.min(lineage.hops + 1, MAX_MAX_HOPS_PER_LINEAGE)
    if (context.kind === 'continuation' && lineage.hops >= settings.maxHopsPerLineage) {
      return insertEvent({
        ...baseEvent(context, now()),
        state: 'no_candidate',
        hop: Math.min(lineage.hops, MAX_MAX_HOPS_PER_LINEAGE),
        strategy: settings.strategy,
        reason: buildReason({ ...context, suffix: `teto de ${settings.maxHopsPerLineage} trocas nesta linhagem` }),
      })
    }

    const selection = await selectDestination({
      settings,
      sourceAccountId: context.fromAccountId,
      visitedAccountIds: [...lineage.visited],
      providerFilter: context.providerFilter,
    })
    const nowMs = now()
    const base = { ...baseEvent(context, nowMs), hop: nextHop, strategy: settings.strategy, candidates: selection.candidates }
    if (!selection.recommended) {
      return insertEvent({ ...base, state: 'no_candidate', reason: buildReason({ ...context, suffix: 'nenhuma conta apta agora' }) })
    }
    return insertEvent({
      ...base,
      state: 'proposed',
      toAccountId: selection.recommended.member.accountId,
      toProviderId: selection.recommended.member.providerId,
      toLabel: clip(selection.recommended.account?.label, SWITCH_LABEL_MAX_CHARS),
      chosenBy: 'chain',
      reason: buildReason(context),
      expiresAt: toIso(nowMs + PROPOSAL_TTL_MS),
    })
  }

  // ── Detecção ──────────────────────────────────────────────────────────────

  function noticeCause(detection, settings) {
    if (!detection.accountId) return 'Login do sistema: só aviso'
    const mode = findLiveSession(detection.sessionId)?.accountMode ?? detection.accountMode
    if (mode !== CHAIN_ACCOUNT_MODE) return 'bloco fixo nesta conta'
    if (!settings.enabled) return 'cadeia desligada'
    if (repository.hasSpawnedFromSession(detection.sessionId)) return 'este bloco já foi continuado'
    return null
  }

  async function processActionable(detection) {
    const nowMs = now()
    const detectedAt = toIso(nowMs)
    const postSwitch = markPostSwitchFailure(detection, nowMs)
    const cooldown = detection.accountId ? putInCooldown(detection, detectedAt, nowMs) : null
    const cooldownView = cooldown ? { untilAt: cooldown.untilAt, untilSource: cooldown.untilSource } : null

    const { evidenceHash } = detection.failure
    const previous = evidenceHash
      ? repository.findLatestSwitchEventForEvidence({ sessionId: detection.sessionId, evidenceHash })
      : null
    if (previous && previous.state !== 'expired') {
      // A mesma evidência nunca gera segunda proposta; recusada, fica silenciada (I6).
      return { action: SILENCING_STATES.includes(previous.state) ? 'silenced' : 'duplicate', event: previous, cooldown }
    }
    const open = repository.findOpenSwitchEventForSession(detection.sessionId)
    if (open) return { action: 'duplicate', event: open, cooldown }

    const context = sourceContext(detection, cooldown, detectedAt, nowMs)
    const settings = repository.readSettings()
    const cause = noticeCause(detection, settings)
    const result = cause ? recordNotice(context, cause) : await createProposal(context, settings)
    const event = result.event
    if (!result.inserted) return { action: 'duplicate', event, cooldown }

    const action = event.state === 'proposed' ? 'proposed' : event.state === 'no_candidate' ? 'no_candidate' : 'noticed'
    publishDetection(detection, {
      action,
      eventId: event.id,
      cooldown: cooldownView,
      postSwitchFailure: postSwitch !== null,
    })
    if (action === 'proposed') safeEmit('account-chain:proposal', event)
    emitChanged('detection')
    return { action, event, cooldown }
  }

  function rememberAmbiguous(detection) {
    const detectionId = randomUUID()
    ambiguousDetections.set(detectionId, { ...detection, detectedAt: toIso(now()) })
    while (ambiguousDetections.size > MAX_PENDING_AMBIGUOUS_DETECTIONS) {
      ambiguousDetections.delete(ambiguousDetections.keys().next().value)
    }
    return detectionId
  }

  async function handleDetection(detection) {
    const { failureClass, scope, ambiguous, notice } = detection.failure
    if (notice === LIMIT_RESET_NOTICE && repository.hasSpawnedFromSession(detection.sessionId)) {
      // O terminal antigo pode voltar a trabalhar na conta antiga enquanto o
      // bloco novo continua o mesmo trabalho: só avisa, nunca escreve nele.
      publishDetection(detection, { action: 'source_resumed' })
      return { action: 'source_resumed' }
    }
    if (!COOLDOWN_FAILURE_CLASSES.includes(failureClass)) {
      // Rede, provedor e tempo só avisam que trocar de conta não resolve (I7).
      if (!TRANSIENT_FAILURE_CLASSES.includes(failureClass)) return { action: 'ignored' }
      publishDetection(detection, { action: 'transient' })
      return { action: 'transient' }
    }
    if (scope === 'model') {
      // Limite só do modelo: trocar de modelo resolve; a conta segue apta.
      publishDetection(detection, { action: 'model_limit' })
      return { action: 'model_limit' }
    }
    if (ambiguous) {
      const detectionId = rememberAmbiguous(detection)
      publishDetection(detection, { action: 'ambiguous', detectionId })
      return { action: 'ambiguous', detectionId }
    }
    return processActionable(detection)
  }

  /**
   * Entrada da vigia do terminal. Nunca lança: uma falha aqui não pode
   * derrubar o `onData` nem o terminal.
   *
   * @param {{ sessionId: string, accountId: string | null, providerId: string,
   *   accountMode: 'pinned' | 'chain', lineageId?: string | null,
   *   failure: { failureClass: string, scope?: string, ambiguous?: boolean,
   *   evidence?: string | null, evidenceHash?: string | null,
   *   notice?: 'limit_reset' | null } }} input - `failure` é o resultado de
   *   `classifyFailure` (taxonomia), como a vigia o entrega.
   */
  function onOutputFailure(input) {
    const detection = normalizeDetection(input)
    if (!detection) {
      safeLog({ transition: 'detection-invalid' })
      return Promise.resolve({ action: 'invalid' })
    }
    return serialize(detection.sessionId, () => handleDetection(detection)).catch((error) => {
      safeLog({ transition: 'detection-failed', message: redactSecrets(error?.message ?? '') })
      return { action: 'error' }
    })
  }

  async function resolveAmbiguous({ detectionId, treatAs } = {}) {
    if (!AMBIGUOUS_CHOICES.includes(treatAs)) return failure('INVALID')
    const detection = ambiguousDetections.get(detectionId)
    if (!detection) return failure('NOT_PENDING')
    ambiguousDetections.delete(detectionId)
    if (treatAs === 'ignore') {
      emitChanged('ambiguous-ignored')
      return { ok: true, action: 'ignored' }
    }
    const asLimit = { ...detection, failure: { ...detection.failure, failureClass: 'limit', scope: 'account', ambiguous: false } }
    const outcome = await serialize(detection.sessionId, () => processActionable(asLimit))
    return { ok: true, action: outcome.action, event: outcome.event ?? null }
  }

  // ── Confirmação, recusa e ticket ──────────────────────────────────────────

  function confirmedResult(event, alreadyConfirmed) {
    return {
      ok: true,
      ticket: event.id,
      destination: { accountId: event.toAccountId, providerId: event.toProviderId, label: event.toLabel },
      lineageId: event.lineageId,
      alreadyConfirmed,
    }
  }

  function codeForState(state) {
    if (state === 'expired') return 'EXPIRED'
    if (state === 'superseded') return 'SUPERSEDED'
    return 'NOT_PENDING'
  }

  /** O pedido chegou de novo depois de confirmado: mesmo destino devolve o mesmo ticket. */
  function answerAlreadyDecided(event, destinationAccountId) {
    if (event.state === 'confirmed') {
      if (Date.parse(event.expiresAt) <= now()) {
        expireEvent(event, 'ticket-vencido')
        return failure('EXPIRED')
      }
      return event.toAccountId === destinationAccountId ? confirmedResult(event, true) : failure('NOT_PENDING')
    }
    return failure(codeForState(event.state))
  }

  async function supersede(event, settings) {
    const result = repository.transitionSwitchEvent({
      id: event.id,
      fromState: 'proposed',
      toState: 'superseded',
      expectedRevision: event.revision,
      patch: { decidedAt: toIso(now()) },
    })
    if (!result.applied) return answerAlreadyDecided(result.event ?? event, null)
    logEvent('supersede', result.event)
    // Nasce outra proposta, que também espera confirmação: nada troca sozinho.
    const next = await createProposal(contextFromEvent(event), settings)
    if (next.inserted && next.event.state === 'proposed') safeEmit('account-chain:proposal', next.event)
    emitChanged('superseded')
    return failure('SUPERSEDED', { proposal: next.event ?? null })
  }

  /**
   * Confirma uma proposta com o destino escolhido e devolve o ticket. Todas as
   * revalidações são daqui (§4.1); a interface só devolve a escolha.
   */
  async function confirm({ proposalId, destinationAccountId, acknowledgeSourceActive = false } = {}) {
    if (!isNonEmptyText(proposalId) || !isNonEmptyText(destinationAccountId)) return failure('INVALID')
    const event = repository.getSwitchEvent(proposalId)
    if (!event || !CHAIN_EVENT_KINDS.includes(event.kind)) return failure('NOT_PENDING')
    if (event.state !== 'proposed') return answerAlreadyDecided(event, destinationAccountId)

    const nowMs = now()
    if (Date.parse(event.expiresAt) <= nowMs) {
      expireEvent(event, 'proposta-vencida')
      emitChanged('expired')
      return failure('EXPIRED')
    }
    const settings = repository.readSettings()
    let source = null
    if (event.kind === 'continuation') {
      source = findLiveSession(event.sourceSessionId)
      const cause = !settings.enabled
        ? 'cadeia-desligada'
        : !source
          ? 'origem-saiu'
          : source.accountMode !== CHAIN_ACCOUNT_MODE
            ? 'bloco-fixado'
            : readLineage(event.lineageId, event.fromAccountId).hops >= settings.maxHopsPerLineage
              ? 'teto-de-saltos'
              : null
      if (cause) {
        expireEvent(event, cause)
        emitChanged('expired')
        return failure('EXPIRED', { reason: cause })
      }
    } else if (!settings.enabled) {
      expireEvent(event, 'cadeia-desligada')
      emitChanged('expired')
      return failure('EXPIRED', { reason: 'cadeia-desligada' })
    }

    const candidate = event.candidates.find((item) => item?.accountId === destinationAccountId)
    const lineage = readLineage(event.lineageId, event.fromAccountId)
    if (!candidate?.selectable || destinationAccountId === event.fromAccountId || lineage.visited.has(destinationAccountId)) {
      return failure('NOT_ELIGIBLE')
    }
    const member = repository.listMembers().find((item) => item.accountId === destinationAccountId)
    if (!member) return failure('NOT_ELIGIBLE', { reason: 'membro-removido' })

    const context = { settings, sourceAccountId: event.fromAccountId, visitedAccountIds: [...lineage.visited] }
    let destination = evaluateMember(member, { ...context, nowMs: now() })
    if (destination.eligibility.reason === LOGIN_NOT_CHECKED_REASON) {
      await runLoginCheck(destinationAccountId)
      destination = evaluateMember(member, { ...context, nowMs: now() })
    }
    if (!destination.eligibility.eligible) {
      // O recomendado deixou de ser apto: a proposta é trocada por outra; um
      // destino que a própria pessoa escolheu só é recusado.
      if (destinationAccountId === event.toAccountId) return supersede(event, settings)
      return failure('NOT_ELIGIBLE', { reason: destination.eligibility.reason })
    }

    const decidedMs = now()
    const lastOutputAt = Number(source?.lastOutputAt)
    const sourceActive = Number.isFinite(lastOutputAt) && decidedMs - lastOutputAt < SOURCE_ACTIVE_QUIET_MS
    if (sourceActive && acknowledgeSourceActive !== true) return failure('SOURCE_ACTIVE')

    const result = repository.transitionSwitchEvent({
      id: event.id,
      fromState: 'proposed',
      toState: 'confirmed',
      expectedRevision: event.revision,
      patch: {
        toAccountId: member.accountId,
        toProviderId: member.providerId,
        toLabel: clip(destination.account?.label, SWITCH_LABEL_MAX_CHARS),
        chosenBy: destinationAccountId === event.toAccountId ? 'chain' : 'person',
        decidedAt: toIso(decidedMs),
        expiresAt: toIso(decidedMs + TICKET_TTL_MS),
        sourceActiveAck: sourceActive,
      },
    })
    if (!result.applied) {
      // Outro pedido decidiu antes (confirm duplo, IPC repetido, outro processo).
      return result.event ? answerAlreadyDecided(result.event, destinationAccountId) : failure('NOT_PENDING')
    }
    logEvent('confirm', result.event)
    emitChanged('confirmed')
    return confirmedResult(result.event, false)
  }

  async function decline({ proposalId, reason } = {}) {
    const toState = DECLINE_STATES[reason]
    if (!isNonEmptyText(proposalId) || !toState) return failure('INVALID')
    const event = repository.getSwitchEvent(proposalId)
    if (!event || !CHAIN_EVENT_KINDS.includes(event.kind) || event.state !== 'proposed') return failure('NOT_PENDING')

    const result = repository.transitionSwitchEvent({
      id: event.id,
      fromState: 'proposed',
      toState,
      expectedRevision: event.revision,
      patch: { decidedAt: toIso(now()) },
    })
    if (!result.applied) return failure('NOT_PENDING')
    logEvent('decline', result.event)

    let cooldownReleased = false
    if (toState === 'dismissed' && event.fromAccountId) {
      const released = await releaseCooldown({ accountId: event.fromAccountId, reason: 'not-a-limit' })
      cooldownReleased = released.ok === true && released.released === true
    }
    emitChanged('declined')
    return { ok: true, cooldownReleased }
  }

  /**
   * Primeiro passo do `pty:spawn` com ticket. Só um ticket confirmado, da
   * mesma conta, dentro do prazo, passa (I2, I3); o mesmo ticket já usado por
   * esta sessão vira spawn comum (reload e reinício do bloco).
   */
  function beginTicketSpawn({ ticket, accountId, sessionId } = {}) {
    if (!isNonEmptyText(ticket) || !isNonEmptyText(accountId) || !isNonEmptyText(sessionId)) return failure('TICKET_INVALID')
    const event = repository.getSwitchEvent(ticket)
    if (!event || !CHAIN_EVENT_KINDS.includes(event.kind)) return failure('TICKET_NOT_FOUND')
    if (event.state === 'spawned') {
      return event.targetSessionId === sessionId && event.toAccountId === accountId
        ? { ok: true, alreadySpawned: true, eventId: event.id, lineageId: event.lineageId, hop: event.hop }
        : failure('TICKET_USED')
    }
    if (event.state === 'spawning') return failure('TICKET_IN_USE')
    if (event.state !== 'confirmed') return failure(event.state === 'expired' ? 'TICKET_EXPIRED' : 'TICKET_NOT_CONFIRMED')
    if (event.toAccountId !== accountId) return failure('TICKET_ACCOUNT_MISMATCH')
    if (Date.parse(event.expiresAt) <= now()) {
      expireEvent(event, 'ticket-vencido')
      emitChanged('expired')
      return failure('TICKET_EXPIRED')
    }
    const result = repository.transitionSwitchEvent({
      id: event.id,
      fromState: 'confirmed',
      toState: 'spawning',
      expectedRevision: event.revision,
      patch: { targetSessionId: sessionId },
    })
    if (!result.applied) return failure('TICKET_USED')
    logEvent('spawning', result.event)
    return { ok: true, alreadySpawned: false, eventId: event.id, lineageId: event.lineageId, hop: event.hop }
  }

  /** Fim do spawn com ticket: nasceu ou falhou. Falha não tem retry (P9). */
  function finishTicketSpawn({ ticket, sessionId, ok } = {}) {
    if (!isNonEmptyText(ticket) || !isNonEmptyText(sessionId)) return failure('INVALID')
    const event = repository.getSwitchEvent(ticket)
    if (!event || event.state !== 'spawning' || event.targetSessionId !== sessionId) return failure('NOT_SPAWNING')
    const spawned = ok === true
    const result = repository.transitionSwitchEvent({
      id: event.id,
      fromState: 'spawning',
      toState: spawned ? 'spawned' : 'spawn_failed',
      expectedRevision: event.revision,
      patch: spawned ? { spawnedAt: toIso(now()) } : {},
    })
    if (!result.applied) return failure('NOT_SPAWNING')
    logEvent(spawned ? 'spawned' : 'spawn-failed', result.event)
    emitChanged(spawned ? 'spawned' : 'spawn-failed')
    return { ok: true, state: result.event.state }
  }

  // ── Bloco "Automática (cadeia)" e passagem manual ─────────────────────────

  async function previewLaunch({ providerId } = {}) {
    if (!CHAIN_PROVIDER_IDS.includes(providerId)) return failure('INVALID')
    sweep()
    const settings = repository.readSettings()
    if (!settings.enabled) return failure('CHAIN_DISABLED', { reasons: [] })
    const context = {
      kind: 'launch',
      sourceSessionId: null,
      fromAccountId: null,
      fromProviderId: providerId,
      fromLabel: null,
      lineageId: randomUUID(),
      failureClass: null,
      evidenceHash: null,
      incidentKey: null,
      detectedAt: null,
      sourceAutoResumeAt: null,
      // Um bloco novo pela cadeia só considera contas do provedor pedido.
      providerFilter: providerId,
    }
    const selection = await selectDestination({ settings, sourceAccountId: null, visitedAccountIds: [], providerFilter: providerId })
    if (!selection.recommended) {
      // Nunca cai para o Login do sistema: a abertura é recusada com os motivos.
      return failure('NO_CANDIDATE', {
        reasons: selection.candidates.map((item) => ({ accountId: item.accountId, label: item.label, reason: item.reason })),
      })
    }
    const nowMs = now()
    const result = insertEvent({
      ...baseEvent(context, nowMs),
      state: 'proposed',
      strategy: settings.strategy,
      candidates: selection.candidates,
      toAccountId: selection.recommended.member.accountId,
      toProviderId: selection.recommended.member.providerId,
      toLabel: clip(selection.recommended.account?.label, SWITCH_LABEL_MAX_CHARS),
      chosenBy: 'chain',
      reason: buildReason(context),
      expiresAt: toIso(nowMs + PROPOSAL_TTL_MS),
    })
    emitChanged('launch-proposed')
    return { ok: true, proposal: result.event }
  }

  /**
   * "Passar responsabilidade…" feita pela pessoa por causa de uma detecção.
   * Não há ticket: a escolha foi dela, pelo fluxo que já existe. Fica como
   * `accepted`, para não contar como vez do rodízio nem marcar a origem como
   * continuada pela cadeia.
   */
  function recordManual({ sourceSessionId, toAccountId = null, toProviderId, reasonClass } = {}) {
    if (!isNonEmptyText(sourceSessionId) || !COOLDOWN_FAILURE_CLASSES.includes(reasonClass)) return failure('INVALID')
    if (!CHAIN_PROVIDER_IDS.includes(toProviderId)) return failure('INVALID')
    if (toAccountId !== null && !isNonEmptyText(toAccountId)) return failure('INVALID')
    const source = findLiveSession(sourceSessionId)
    if (!source || !isNonEmptyText(source.providerId)) return failure('SESSION_NOT_FOUND')

    const fromAccountId = isNonEmptyText(source.accountId) ? source.accountId : null
    const cooldown = fromAccountId ? repository.getCooldown(fromAccountId) : null
    const nowMs = now()
    const decidedAt = toIso(nowMs)
    const context = {
      kind: 'manual',
      sourceSessionId,
      fromAccountId,
      fromProviderId: source.providerId,
      fromLabel: fromAccountId ? clip(safeDescribe(fromAccountId)?.label, SWITCH_LABEL_MAX_CHARS) : SYSTEM_LOGIN_LABEL,
      lineageId: sourceSessionId,
      failureClass: reasonClass,
      evidenceHash: null,
      incidentKey: cooldown && !cooldown.releasedAt ? `${cooldown.accountId}|${cooldown.detectedAt}` : null,
      detectedAt: cooldown?.detectedAt ?? null,
      sourceAutoResumeAt: null,
    }
    const result = insertEvent({
      ...baseEvent(context, nowMs),
      state: 'accepted',
      toAccountId,
      toProviderId,
      toLabel: toAccountId ? clip(safeDescribe(toAccountId)?.label, SWITCH_LABEL_MAX_CHARS) : SYSTEM_LOGIN_LABEL,
      chosenBy: 'person',
      reason: buildReason({ ...context, kind: 'manual', suffix: 'passagem feita pela pessoa' }),
      decidedAt,
    })
    emitChanged('manual')
    return { ok: true, eventId: result.event.id }
  }

  // ── Sessão, espera e opções ───────────────────────────────────────────────

  /** A sessão de origem saiu: a proposta aberta dela vence sem executar nada. */
  function onSessionExit(sessionId) {
    if (!isNonEmptyText(sessionId)) return 0
    for (const [detectionId, detection] of ambiguousDetections) {
      if (detection.sessionId === sessionId) ambiguousDetections.delete(detectionId)
    }
    const expired = expireOpenProposals((event) => event.sourceSessionId === sessionId, 'origem-saiu')
    if (expired > 0) emitChanged('source-exited')
    return expired
  }

  function setSessionMode({ sessionId, mode } = {}) {
    if (!isNonEmptyText(sessionId) || !SESSION_ACCOUNT_MODES.includes(mode)) return failure('INVALID')
    let applied = false
    try {
      applied = typeof setSessionAccountMode === 'function' && setSessionAccountMode(sessionId, mode) === true
    } catch {
      applied = false
    }
    if (!applied) return failure('SESSION_NOT_FOUND')
    // Fixar o bloco expira as propostas abertas dele (decisão 5).
    if (mode === 'pinned') expireOpenProposals((event) => event.sourceSessionId === sessionId, 'bloco-fixado')
    emitChanged('session-mode')
    return { ok: true }
  }

  /**
   * Liberação manual da espera. Login e crédito só saem depois de uma
   * checagem de login OK posterior à detecção; limite sai direto (a conta
   * ainda precisa de login conferido para voltar a ser apta).
   */
  async function releaseCooldown({ accountId, reason } = {}) {
    const releasedBy = RELEASE_REASONS[reason]
    if (!isNonEmptyText(accountId) || !releasedBy) return failure('INVALID')
    const cooldown = repository.getCooldown(accountId)
    if (!cooldown || cooldown.releasedAt) return { ok: true, released: false }

    if (cooldown.failureClass !== 'limit') {
      const check = await runLoginCheck(accountId)
      const confirmed = check?.status === 'logged_in' && Date.parse(check.checkedAt) > Date.parse(cooldown.detectedAt)
      if (!confirmed) return failure('CHECK_REQUIRED', { loginStatus: check?.status ?? null })
    }
    const current = repository.getCooldown(accountId)
    const result = current?.releasedAt
      ? { applied: false, cooldown: current }
      : repository.releaseCooldown({ accountId, releasedBy, releasedAt: toIso(now()), expectedRevision: current.revision })
    const released = result.applied || Boolean(result.cooldown?.releasedAt)
    if (released) {
      safeLog({ transition: 'cooldown-released', accountId, releasedBy: result.cooldown?.releasedBy ?? releasedBy })
      // Espera da origem liberada: as propostas abertas a partir dela vencem.
      expireOpenProposals((event) => event.fromAccountId === accountId, 'espera-liberada')
      emitChanged('cooldown-released')
    }
    return { ok: true, released }
  }

  async function checkLoginNow({ accountIds } = {}) {
    if (!Array.isArray(accountIds) || accountIds.some((id) => !isNonEmptyText(id))) return failure('INVALID')
    const results = await Promise.all(
      [...new Set(accountIds)].map(async (accountId) => ({ accountId, loginCheck: publicLoginCheck(await runLoginCheck(accountId)) })),
    )
    emitChanged('login-checked')
    return { ok: true, results }
  }

  /**
   * Ao ligar pela primeira vez, a lista nasce com todas as contas, em ordem e
   * desabilitadas; uma conta criada depois entra no fim, desabilitada. Nenhuma
   * conta passa a receber trocas sem ação da pessoa.
   */
  function syncMembersWithAccounts() {
    const settings = repository.readSettings()
    if (!settings.exists) return false
    const accounts = readKnownAccounts()
    if (!accounts) return false
    const members = repository.listMembers()
    const known = new Set(members.map((member) => member.accountId))
    const missing = accounts.filter((account) => CHAIN_PROVIDER_IDS.includes(account.providerId) && !known.has(account.id))
    if (missing.length === 0) return false
    const result = repository.replaceMembers({
      members: [
        ...members.map(toMemberInput),
        ...missing.map((account) => ({ accountId: account.id, providerId: account.providerId, enabled: false })),
      ],
      expectedRevision: settings.revision,
      nowIso: toIso(now()),
    })
    return result.applied
  }

  function updateSettings({ enabled, strategy, maxHops, expectedRevision } = {}) {
    let result
    try {
      result = repository.updateSettings({ expectedRevision, enabled, strategy, maxHopsPerLineage: maxHops, nowIso: toIso(now()) })
    } catch {
      return failure('INVALID')
    }
    if (!result.applied) return failure('REVISION_CONFLICT', { current: result.settings })
    syncMembersWithAccounts()
    // Cadeia desligada: nenhuma proposta aberta continua valendo.
    if (!result.settings.enabled) expireOpenProposals(() => true, 'cadeia-desligada')
    emitChanged('settings')
    return { ok: true, settings: repository.readSettings() }
  }

  function updateMembers({ members, expectedRevision } = {}) {
    if (!Array.isArray(members)) return failure('INVALID')
    const providers = new Map(repository.listMembers().map((member) => [member.accountId, member.providerId]))
    for (const account of readKnownAccounts() ?? []) {
      if (!providers.has(account.id)) providers.set(account.id, account.providerId)
    }
    const list = []
    for (const member of members) {
      const providerId = providers.get(member?.accountId)
      if (!providerId) return failure('UNKNOWN_ACCOUNT')
      list.push({
        accountId: member.accountId,
        providerId,
        enabled: member.enabled,
        billingDeclared: member.billingDeclared ?? null,
        multiplierDeclared: member.multiplierDeclared ?? null,
      })
    }
    let result
    try {
      result = repository.replaceMembers({ members: list, expectedRevision, nowIso: toIso(now()) })
    } catch {
      return failure('INVALID')
    }
    if (!result.applied) return failure('REVISION_CONFLICT', { current: { settings: result.settings, members: result.members } })
    emitChanged('members')
    return { ok: true, revision: result.revision }
  }

  // ── Leitura, prazo e recuperação ──────────────────────────────────────────

  function getState() {
    sweep()
    syncMembersWithAccounts()
    const settings = repository.readSettings()
    const context = { nowMs: now(), settings, sourceAccountId: null, visitedAccountIds: [] }
    const members = repository.listMembers().map((member) => {
      const entry = evaluateMember(member, context)
      return {
        accountId: member.accountId,
        providerId: member.providerId,
        label: clip(entry.account?.label, SWITCH_LABEL_MAX_CHARS),
        position: member.position,
        enabled: member.enabled,
        billingDeclared: member.billingDeclared,
        multiplierDeclared: member.multiplierDeclared,
        eligible: entry.eligibility.eligible,
        reason: entry.eligibility.reason,
        loginCheck: publicLoginCheck(entry.loginCheck),
        cooldown: entry.cooldown && !entry.cooldown.releasedAt ? entry.cooldown : null,
      }
    })
    return {
      ok: true,
      settings: { enabled: settings.enabled, strategy: settings.strategy, maxHops: settings.maxHopsPerLineage },
      revision: settings.revision,
      members,
      pendingProposals: repository.listOpenSwitchEvents(),
      cooldowns: repository.listCooldowns(),
      ambiguousDetections: [...ambiguousDetections].map(([detectionId, detection]) => ({
        detectionId,
        sessionId: detection.sessionId,
        accountId: detection.accountId,
        providerId: detection.providerId,
        failureClass: detection.failure.failureClass,
        evidence: detection.failure.evidence,
        detectedAt: detection.detectedAt,
      })),
    }
  }

  function history({ limit, before } = {}) {
    try {
      return { ok: true, events: repository.listSwitchEvents({ limit, before }) }
    } catch {
      return failure('INVALID')
    }
  }

  /**
   * Vence propostas e tickets fora do prazo, marca as esperas vencidas e tira
   * da espera de login as contas com checagem OK posterior. Barato (só
   * SQLite); roda antes de cada leitura e no varredor.
   */
  function sweep() {
    const nowIso = toIso(now())
    const expired = repository.expireDueSwitchEvents(nowIso)
    for (const event of expired) logEvent('expire', event, { cause: 'prazo' })
    const released = repository.releaseExpiredCooldowns(nowIso) + releaseCooldownsConfirmedByCheck()
    if (expired.length > 0 || released > 0) emitChanged('sweep')
    return { expired: expired.length, cooldownsReleased: released }
  }

  /** Varredor de prazo com `unref`: não segura o app aberto. Devolve quem o para. */
  function startExpirySweeper({ intervalMs = DEFAULT_SWEEP_INTERVAL_MS } = {}) {
    const timer = setInterval(() => {
      try {
        sweep()
      } catch (error) {
        safeLog({ transition: 'sweep-failed', message: redactSecrets(error?.message ?? '') })
      }
    }, intervalMs)
    timer.unref?.()
    return () => clearInterval(timer)
  }

  /**
   * Recuperação no início do app (P6, I4): o que estava pendente é
   * invalidado e nunca executado. Proposta e ticket vencem, spawn em
   * andamento vira falha (o PTY morreu com o app), esperas vencidas saem e
   * contas que sumiram deixam a lista. Registro de contas ilegível não apaga
   * membro nenhum.
   */
  function recoverOnStartup() {
    const knownAccounts = readKnownAccounts()
    const result = repository.recoverOnStartup({
      nowIso: toIso(now()),
      knownAccountIds: knownAccounts ? knownAccounts.map((account) => account.id) : null,
    })
    const pruned = repository.pruneSwitchEvents()
    ambiguousDetections.clear()
    safeLog({
      transition: 'recover',
      expired: result.expired,
      spawnFailed: result.spawnFailed,
      cooldownsReleased: result.cooldownsReleased,
      pruned,
    })
    emitChanged('recovered')
    return { ...result, pruned }
  }

  return {
    beginTicketSpawn,
    checkLoginNow,
    confirm,
    decline,
    finishTicketSpawn,
    getState,
    history,
    onOutputFailure,
    onSessionExit,
    previewLaunch,
    recordManual,
    recoverOnStartup,
    releaseCooldown,
    resolveAmbiguous,
    setSessionMode,
    startExpirySweeper,
    sweep,
    updateMembers,
    updateSettings,
  }
}

module.exports = {
  LOGIN_NOT_CHECKED_REASON,
  createAccountChainService,
  normalizeDetection,
}
