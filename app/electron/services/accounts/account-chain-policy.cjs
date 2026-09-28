'use strict'

/**
 * @module accounts/account-chain-policy
 * Regra pura da cadeia de contas (ver `docs/projeto/POLITICA-CONTAS.md`):
 * quem está apto a receber uma troca, em que ordem cada estratégia oferece os
 * aptos, quanto vale a quota de cada conta, qual a classe de cobrança e
 * quando uma espera acaba.
 *
 * Puro: recebe os fatos (membros, esperas, checagens de login, amostras do
 * painel, o "agora") e devolve decisões com o motivo em pt-BR. Não lê banco,
 * não roda CLI, não tem relógio próprio. O serviço da cadeia junta os fatos e
 * grava o resultado; a interface só mostra.
 *
 * Fail-closed em toda parte:
 * - sem login conferido pela CLI há até 15 min, a conta fica fora;
 * - sem medição atual, a quota não é comparada (ausência nunca vira 0 nem 100);
 * - cobrança desconhecida nunca é tratada como assinatura;
 * - espera vencida só volta a ser apta com checagem de login posterior.
 */

const {
  CLAUDE_LIMIT_COOLDOWN_MS,
  DEFAULT_LIMIT_COOLDOWN_MS,
  ELIGIBILITY_TTL_MS,
  MAX_PLAN_MULTIPLIER,
  MIN_PLAN_MULTIPLIER,
  RESET_MAX_AHEAD_MS,
} = require('./account-chain-constants.cjs')
const { parseResetFromText } = require('./reset-time.cjs')
const { getAgentUsageSource } = require('../agent-usage-sources.cjs')

// ── Razões de inelegibilidade ────────────────────────────────────────────────

/**
 * Razões na ordem em que a política as confere; vale a primeira que bloquear.
 * Cada uma tem o texto que a interface mostra.
 */
const ELIGIBILITY_REASONS = Object.freeze({
  'cadeia-desligada': 'A cadeia de contas está desligada.',
  'membro-desabilitado': 'Conta desabilitada na cadeia.',
  'conta-removida': 'A conta não existe mais no app.',
  'sem-checagem-de-login': 'Fora da cadeia até o app conseguir conferir o login deste provedor.',
  'sem-chave': 'A conta não tem chave configurada.',
  'em-espera': 'A conta está em espera.',
  'esgotada-pela-medicao': 'A medição atual mostra a quota esgotada.',
  'login-nao-conferido': 'Login não conferido pela CLI nos últimos 15 min.',
  deslogada: 'A CLI informa que não há login nesta conta.',
  'cli-ausente': 'A CLI deste provedor não foi encontrada.',
  'tempo-esgotado': 'A checagem de login não respondeu a tempo.',
  'checagem-falhou': 'A checagem de login não confirmou a conta.',
  'identidade-diferente': 'A CLI informa outra conta, não a vinculada a esta.',
  'identidade-duplicada': 'É a mesma conta da origem ou de outro membro mais acima na lista.',
  origem: 'É a conta de origem da troca.',
  'ja-visitada-na-linhagem': 'Esta conta já foi usada nesta sequência de trocas.',
})

/** Status de uma checagem recente que não confirmou login → razão. */
const LOGIN_STATUS_REASONS = Object.freeze({
  logged_out: 'deslogada',
  cli_ausente: 'cli-ausente',
  tempo_esgotado: 'tempo-esgotado',
  sem_checagem: 'sem-checagem-de-login',
  erro: 'checagem-falhou',
  unknown: 'checagem-falhou',
})

// ── Tempo ───────────────────────────────────────────────────────────────────

/** Instante em ms de um ISO válido; `null` para ausente ou inválido. */
function parseInstant(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

/**
 * Se um instante registrado ainda vale dentro de `ttlMs`. Horário ausente,
 * inválido ou no futuro não vale (não prova quando aconteceu).
 */
function isWithinTtl(value, nowMs, ttlMs = ELIGIBILITY_TTL_MS) {
  const ms = parseInstant(value)
  if (ms === null || !Number.isFinite(nowMs)) return false
  const ageMs = nowMs - ms
  return ageMs >= 0 && ageMs <= ttlMs
}

// ── Medição atual e capacidade (§7.2, §7.3) ─────────────────────────────────

/**
 * Medição atual, pela regra estrita da cadeia: amostra `current` com horário
 * de medição (ou de coleta) válido e de até 15 min. Diferente do painel, que
 * aceita amostra sem horário como atual: aqui ausência nunca prova nada.
 */
function isMeasurementCurrent(sample, nowMs, ttlMs = ELIGIBILITY_TTL_MS) {
  if (!sample || sample.status !== 'current') return false
  return isWithinTtl(sample.metadata?.measuredAt ?? sample.collectedAt, nowMs, ttlMs)
}

/** Janelas em % com restante finito (as únicas comparáveis entre contas). */
function readPercentWindows(sample) {
  const metrics = Array.isArray(sample?.metrics) ? sample.metrics : []
  return metrics.filter(
    (metric) => metric?.unit === '%' && typeof metric.remaining === 'number' && Number.isFinite(metric.remaining),
  )
}

/**
 * Janela esgotada numa medição atual: `remaining ≤ 0` e o reset dela ainda
 * não passou (sem `resetAt`, vale enquanto a medição for atual).
 *
 * @returns {{ key: string, resetAt: string | null } | null}
 */
function findExhaustedWindow(sample, nowMs) {
  if (!isMeasurementCurrent(sample, nowMs)) return null
  for (const metric of readPercentWindows(sample)) {
    if (metric.remaining > 0) continue
    const resetMs = parseInstant(metric.resetAt)
    if (resetMs === null || resetMs > nowMs) {
      return { key: metric.key ?? null, resetAt: resetMs === null ? null : new Date(resetMs).toISOString() }
    }
  }
  return null
}

/**
 * Multiplicador que a CLI publicou num CAMPO DE PLANO ("Max 20x",
 * `default_claude_max_20x`). Nunca é aplicado ao texto do terminal: o Claude
 * imprime "Upgrade to Max 20x" justamente para quem não tem esse plano.
 */
const PLAN_MULTIPLIER_PATTERN = /(?:^|[^a-z0-9])(\d{1,3}(?:[.,]\d)?)\s*x(?:$|[^a-z0-9])/i

/**
 * @param {Array<string | null | undefined>} planFields Campos de plano publicados pela CLI.
 * @returns {number | null} Multiplicador na faixa aceita, ou `null`.
 */
function detectPlanMultiplier(planFields) {
  for (const field of Array.isArray(planFields) ? planFields : [planFields]) {
    if (typeof field !== 'string') continue
    const match = field.match(PLAN_MULTIPLIER_PATTERN)
    if (!match) continue
    const value = Number(match[1].replace(',', '.'))
    if (Number.isFinite(value) && value >= MIN_PLAN_MULTIPLIER && value <= MAX_PLAN_MULTIPLIER) return value
  }
  return null
}

function isDeclaredMultiplier(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_PLAN_MULTIPLIER && value <= MAX_PLAN_MULTIPLIER
}

/**
 * Multiplicador do plano: o que a CLI publicou vence; depois o declarado pela
 * pessoa; sem nenhum dos dois vale 1, com o selo "não declarado".
 *
 * @param {{ planFields?: Array<string | null | undefined>, declared?: number | null }} input
 * @returns {{ value: number, source: 'cli' | 'declarado' | 'nao_declarado', detected: number | null, declared: number | null, divergent: boolean }}
 */
function resolvePlanMultiplier({ planFields = [], declared = null } = {}) {
  const detected = detectPlanMultiplier(planFields)
  const declaredValue = isDeclaredMultiplier(declared) ? declared : null
  if (detected !== null) {
    return {
      value: detected,
      source: 'cli',
      detected,
      declared: declaredValue,
      divergent: declaredValue !== null && declaredValue !== detected,
    }
  }
  if (declaredValue !== null) {
    return { value: declaredValue, source: 'declarado', detected: null, declared: declaredValue, divergent: false }
  }
  return { value: 1, source: 'nao_declarado', detected: null, declared: null, divergent: false }
}

/**
 * Capacidade absoluta = restante% da janela mais apertada × multiplicador.
 * "50% com 20x (1000) é maior que 100% com 1x (100)".
 *
 * `value` é `null` quando não há medição atual ou quando a conta não tem
 * janela em % (o Openia mede créditos em US$: não é comparável).
 *
 * @param {{ sample?: object | null, multiplier?: { value: number, source?: string } | number, nowMs: number }} input
 *   `multiplier` é o resultado de `resolvePlanMultiplier` (ou só o número).
 * @returns {{ value: number | null, remainingPercent: number | null, multiplier: number, multiplierSource: string | null, reason: null | 'sem-medicao-atual' | 'nao-comparavel' }}
 */
function computeCapacity({ sample, multiplier = 1, nowMs }) {
  const factor = typeof multiplier === 'number' ? multiplier : (multiplier?.value ?? 1)
  const multiplierSource = typeof multiplier === 'object' ? (multiplier?.source ?? null) : null
  const empty = (reason) => ({ value: null, remainingPercent: null, multiplier: factor, multiplierSource, reason })
  if (!isMeasurementCurrent(sample, nowMs)) return empty('sem-medicao-atual')
  const windows = readPercentWindows(sample)
  if (windows.length === 0) return empty('nao-comparavel')
  // A janela mais apertada manda: 5 h com 90% e semanal com 5% dá 5%.
  const remainingPercent = Math.max(0, Math.min(...windows.map((metric) => metric.remaining)))
  return { value: remainingPercent * factor, remainingPercent, multiplier: factor, multiplierSource, reason: null }
}

// ── Cobrança (§7.4) ─────────────────────────────────────────────────────────

const CLAUDE_SUBSCRIPTION_METHODS = Object.freeze(['claude.ai'])
const CLAUDE_USAGE_METHODS = Object.freeze(['api_key', 'api_key_helper', 'third_party'])

/**
 * Classe de cobrança detectada pelo método de login que a CLI publicou.
 *
 * @param {{ providerId: string, method?: string | null, apiKeySourcePresent?: boolean }} input
 * @returns {{ detected: 'assinatura' | 'uso' | null, source: 'regra' | 'metodo_de_login' | null, apiKeyWarning: boolean }}
 */
function classifyBilling({ providerId, method = null, apiKeySourcePresent = false }) {
  const text = typeof method === 'string' ? method.trim() : ''
  const apiKeyWarning = providerId === 'claude' && apiKeySourcePresent === true

  if (providerId === 'openia') {
    // Créditos do OpenRouter: sempre por uso.
    return { detected: 'uso', source: 'regra', apiKeyWarning: false }
  }
  if (providerId === 'codex') {
    if (/chatgpt/i.test(text)) return { detected: 'assinatura', source: 'metodo_de_login', apiKeyWarning }
    if (/api key/i.test(text)) return { detected: 'uso', source: 'metodo_de_login', apiKeyWarning }
    return { detected: null, source: null, apiKeyWarning }
  }
  if (providerId === 'claude') {
    const normalized = text.toLowerCase()
    if (CLAUDE_SUBSCRIPTION_METHODS.includes(normalized)) {
      return { detected: 'assinatura', source: 'metodo_de_login', apiKeyWarning }
    }
    if (CLAUDE_USAGE_METHODS.includes(normalized)) return { detected: 'uso', source: 'metodo_de_login', apiKeyWarning }
    return { detected: null, source: null, apiKeyWarning }
  }
  return { detected: null, source: null, apiKeyWarning }
}

/**
 * Cobrança que vale para ordenar: a declarada; na falta dela, a detectada.
 * Se as duas divergirem, a conta é tratada como desconhecida (e a interface
 * mostra as duas). Desconhecida nunca é presumida como assinatura.
 *
 * @returns {{ effective: 'assinatura' | 'uso' | 'desconhecida', declared: string | null, detected: string | null, divergent: boolean }}
 */
function resolveBilling({ declared = null, detected = null } = {}) {
  const isClass = (value) => value === 'assinatura' || value === 'uso'
  const declaredValue = isClass(declared) ? declared : null
  const detectedValue = isClass(detected) ? detected : null
  if (declaredValue && detectedValue && declaredValue !== detectedValue) {
    return { effective: 'desconhecida', declared: declaredValue, detected: detectedValue, divergent: true }
  }
  return {
    effective: declaredValue ?? detectedValue ?? 'desconhecida',
    declared: declaredValue,
    detected: detectedValue,
    divergent: false,
  }
}

// ── Espera (§4.2, §6.4) ─────────────────────────────────────────────────────

/**
 * Se a espera da conta ainda a bloqueia.
 *
 * - liberada (`releasedAt`) por checagem, "Não era limite" ou recarga: não
 *   bloqueia;
 * - `limit` com `untilAt` no futuro: bloqueia; vencida — inclusive a que a
 *   varredura marcou com `releasedBy: 'vencimento'` —, só deixa de bloquear
 *   com checagem de login `logged_in` DEPOIS do vencimento ("precisa
 *   conferir": nunca volta a apta sozinha);
 * - `auth`: bloqueia até uma checagem `logged_in` depois da detecção;
 * - `billing`: bloqueia até o serviço liberar ("Já recarreguei" + checagem,
 *   ou créditos atuais do Openia > 0).
 */
function cooldownBlocks(cooldown, loginCheck, nowMs) {
  if (!cooldown) return false
  // O vencimento só registra que o prazo passou; a conta ainda precisa de
  // login conferido depois dele (cai no ramo `limit` abaixo).
  if (cooldown.releasedAt && cooldown.releasedBy !== 'vencimento') return false
  const loggedInAfter = (instantMs) => {
    if (loginCheck?.status !== 'logged_in') return false
    const checkedMs = parseInstant(loginCheck.checkedAt)
    return checkedMs !== null && instantMs !== null && checkedMs > instantMs
  }

  if (cooldown.failureClass === 'limit') {
    const untilMs = parseInstant(cooldown.untilAt)
    if (untilMs === null || untilMs > nowMs) return true
    return !loggedInAfter(untilMs)
  }
  if (cooldown.failureClass === 'auth') {
    return !loggedInAfter(parseInstant(cooldown.detectedAt))
  }
  return true
}

/**
 * Fim de uma espera nova (§6.4): medição atual com janela esgotada, depois o
 * texto que a CLI imprimiu, depois o padrão (5 h no Claude, 15 min nos
 * demais, mostrado como estimado). Se medição e texto divergirem, vale o mais
 * tarde, para a conta não voltar cedo demais; os dois voltam para a
 * interface mostrar. Leitura a mais de 8 dias é inválida e cai para a fonte
 * seguinte. Login e cobrança não têm fim por relógio: saem por checagem.
 *
 * @param {{ providerId: string, failureClass: 'limit' | 'auth' | 'billing', detectedAtMs: number, nowMs: number, sample?: object | null, resetText?: string | null, localTimeZone?: string }} input
 * `autoResumeAt` é o horário em que o Claude disse que continua sozinho
 * ("continuing automatically at …"), para o registro de trocas avisar que o
 * terminal antigo pode retomar.
 *
 * @returns {{ untilAt: string | null, untilSource: 'medicao' | 'texto' | 'texto_fuso_local' | 'padrao' | 'checagem', estimated: boolean, measuredUntilAt: string | null, textUntilAt: string | null, autoResumeAt: string | null }}
 */
function resolveCooldownEnd({ providerId, failureClass, detectedAtMs, nowMs, sample = null, resetText = null, localTimeZone }) {
  if (failureClass !== 'limit') {
    return {
      untilAt: null,
      untilSource: 'checagem',
      estimated: false,
      measuredUntilAt: null,
      textUntilAt: null,
      autoResumeAt: null,
    }
  }

  const isValidAhead = (ms) => ms !== null && ms > nowMs && ms - nowMs <= RESET_MAX_AHEAD_MS
  let measuredMs = null
  if (isMeasurementCurrent(sample, nowMs)) {
    for (const metric of readPercentWindows(sample)) {
      const resetMs = parseInstant(metric.resetAt)
      if (metric.remaining <= 0 && isValidAhead(resetMs) && (measuredMs === null || resetMs > measuredMs)) {
        measuredMs = resetMs
      }
    }
  }

  const text = typeof resetText === 'string' && resetText.trim() ? parseResetFromText(resetText, { nowMs, localTimeZone }) : null
  const textMs = text && isValidAhead(text.resetAtMs) ? text.resetAtMs : null

  const measuredUntilAt = measuredMs === null ? null : new Date(measuredMs).toISOString()
  const textUntilAt = textMs === null ? null : new Date(textMs).toISOString()
  const autoResumeAt = textMs !== null && text.autoResume ? textUntilAt : null

  if (measuredMs !== null && (textMs === null || measuredMs >= textMs)) {
    return { untilAt: measuredUntilAt, untilSource: 'medicao', estimated: false, measuredUntilAt, textUntilAt, autoResumeAt }
  }
  if (textMs !== null) {
    return { untilAt: textUntilAt, untilSource: text.source, estimated: false, measuredUntilAt, textUntilAt, autoResumeAt }
  }

  const startMs = Number.isFinite(detectedAtMs) ? detectedAtMs : nowMs
  const fallbackMs = providerId === 'claude' ? CLAUDE_LIMIT_COOLDOWN_MS : DEFAULT_LIMIT_COOLDOWN_MS
  return {
    untilAt: new Date(startMs + fallbackMs).toISOString(),
    untilSource: 'padrao',
    estimated: true,
    measuredUntilAt: null,
    textUntilAt: null,
    autoResumeAt: null,
  }
}

// ── Elegibilidade (§6.1) ────────────────────────────────────────────────────

function blocked(reason) {
  return { eligible: false, reason, reasonText: ELIGIBILITY_REASONS[reason] }
}

/**
 * Se um membro está apto a receber uma troca. Confere as razões na ordem da
 * política e devolve a primeira que bloquear.
 *
 * @param {object} input
 * @param {boolean} input.chainEnabled
 * @param {{ accountId: string, providerId: string, enabled: boolean }} input.member
 * @param {'ok' | 'removed' | 'missing_key'} input.accountStatus Resultado da validação no registro de contas.
 * @param {object | null} [input.cooldown] Espera da conta (`account_cooldowns`).
 * @param {object | null} [input.loginCheck] Última checagem de login (`account_login_checks`).
 * @param {object | null} [input.sample] Amostra atual do painel da conta.
 * @param {number} input.nowMs
 * @param {string | null} [input.sourceAccountId]
 * @param {string[]} [input.visitedAccountIds] Contas já usadas na linhagem.
 * @param {string[]} [input.excludedIdentityKeys] Identidade da origem e dos membros mais bem colocados.
 * @returns {{ eligible: boolean, reason: string | null, reasonText: string | null }}
 */
function evaluateEligibility({
  chainEnabled,
  member,
  accountStatus,
  cooldown = null,
  loginCheck = null,
  sample = null,
  nowMs,
  sourceAccountId = null,
  visitedAccountIds = [],
  excludedIdentityKeys = [],
}) {
  if (!chainEnabled) return blocked('cadeia-desligada')
  if (!member?.enabled) return blocked('membro-desabilitado')
  if (accountStatus !== 'ok' && accountStatus !== 'missing_key') return blocked('conta-removida')
  // A regra não cita provedor: fica fora quem não tem comando de login.
  if (!getAgentUsageSource(member.providerId)?.auth) return blocked('sem-checagem-de-login')
  if (accountStatus === 'missing_key') return blocked('sem-chave')
  if (cooldownBlocks(cooldown, loginCheck, nowMs)) return blocked('em-espera')
  if (findExhaustedWindow(sample, nowMs)) return blocked('esgotada-pela-medicao')
  if (!loginCheck || !isWithinTtl(loginCheck.checkedAt, nowMs)) return blocked('login-nao-conferido')
  if (loginCheck.status !== 'logged_in') return blocked(LOGIN_STATUS_REASONS[loginCheck.status] ?? 'checagem-falhou')
  if (loginCheck.identityStatus === 'different') return blocked('identidade-diferente')
  if (
    loginCheck.identityStatus === 'duplicate' ||
    (loginCheck.identityKey && excludedIdentityKeys.includes(loginCheck.identityKey))
  ) {
    return blocked('identidade-duplicada')
  }
  if (sourceAccountId && member.accountId === sourceAccountId) return blocked('origem')
  if (visitedAccountIds.includes(member.accountId)) return blocked('ja-visitada-na-linhagem')
  return { eligible: true, reason: null, reasonText: null }
}

function compareManualOrder(a, b) {
  if (a.position !== b.position) return a.position - b.position
  return a.accountId < b.accountId ? -1 : a.accountId > b.accountId ? 1 : 0
}

/**
 * Avalia a lista inteira na ordem manual. A identidade duplicada depende da
 * lista: uma conta com a mesma identidade da origem ou de um membro
 * habilitado mais acima é a mesma conta real, e fica fora.
 *
 * @param {object} input
 * @param {Array<{ accountId: string, providerId: string, position: number, enabled: boolean }>} input.members
 * @param {Record<string, { accountStatus: string, cooldown?: object, loginCheck?: object, sample?: object }>} input.facts Fatos por conta.
 * @param {boolean} input.chainEnabled
 * @param {number} input.nowMs
 * @param {string | null} [input.sourceAccountId]
 * @param {string | null} [input.sourceIdentityKey]
 * @param {string[]} [input.visitedAccountIds]
 * @returns {Array<{ accountId: string, providerId: string, position: number, eligible: boolean, reason: string | null, reasonText: string | null }>}
 */
function evaluateMembers({
  members,
  facts = {},
  chainEnabled,
  nowMs,
  sourceAccountId = null,
  sourceIdentityKey = null,
  visitedAccountIds = [],
}) {
  const seenIdentityKeys = sourceIdentityKey ? [sourceIdentityKey] : []
  return [...(members ?? [])].sort(compareManualOrder).map((member) => {
    const memberFacts = facts[member.accountId] ?? {}
    const result = evaluateEligibility({
      chainEnabled,
      member,
      accountStatus: memberFacts.accountStatus ?? 'removed',
      cooldown: memberFacts.cooldown ?? null,
      loginCheck: memberFacts.loginCheck ?? null,
      sample: memberFacts.sample ?? null,
      nowMs,
      sourceAccountId,
      visitedAccountIds,
      // A própria origem sai por "origem", não por ter a identidade dela.
      excludedIdentityKeys: member.accountId === sourceAccountId ? [] : seenIdentityKeys,
    })
    const identityKey = memberFacts.loginCheck?.identityKey
    if (member.enabled && identityKey && member.accountId !== sourceAccountId && !seenIdentityKeys.includes(identityKey)) {
      seenIdentityKeys.push(identityKey)
    }
    return {
      accountId: member.accountId,
      providerId: member.providerId,
      position: member.position,
      ...result,
    }
  })
}

/**
 * Um bloco novo "Automática (cadeia)" só considera membros do provedor do
 * agente pedido; a continuação de um bloco que bateu o limite considera a
 * lista inteira (decisão 2: pode cruzar provedores).
 */
function filterMembersForKind(members, { kind, providerId }) {
  const list = Array.isArray(members) ? members : []
  return kind === 'launch' ? list.filter((member) => member.providerId === providerId) : [...list]
}

// ── Estratégias (§7.1) ──────────────────────────────────────────────────────

/** Tipos de evento em que a própria cadeia escolheu o destino. */
const CHAIN_SWITCH_KINDS = Object.freeze(['continuation', 'launch'])

/**
 * Cursor do rodízio, derivado do registro de trocas (sem campo próprio): o
 * destino do último evento da cadeia que chegou a `spawned`. Proposta
 * recusada ou spawn que falhou não gastam a vez.
 *
 * @param {Array<object>} events Eventos do registro de trocas.
 * @returns {string | null}
 */
function deriveRoundRobinCursor(events) {
  let latest = null
  let latestMs = -Infinity
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.state !== 'spawned' || !CHAIN_SWITCH_KINDS.includes(event.kind) || !event.toAccountId) continue
    const ms = parseInstant(event.spawnedAt) ?? parseInstant(event.decidedAt) ?? parseInstant(event.proposedAt) ?? -Infinity
    if (ms >= latestMs) {
      latestMs = ms
      latest = event.toAccountId
    }
  }
  return latest
}

function formatNumber(value) {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',')
}

function describeCapacity(capacity) {
  const base = `${formatNumber(capacity.value)} = ${formatNumber(capacity.remainingPercent)}% × ${formatNumber(capacity.multiplier)}x`
  return capacity.multiplierSource === 'nao_declarado' ? `${base} (multiplicador não declarado)` : base
}

const BILLING_GROUP_ORDER = Object.freeze({ assinatura: 0, desconhecida: 1, uso: 2 })

/**
 * Ordena os candidatos APTOS pela estratégia. O desempate é sempre a posição
 * manual e depois o id, então o resultado é determinístico.
 *
 * @param {object} input
 * @param {'manual' | 'round_robin' | 'most_capacity' | 'subscription_first'} input.strategy
 * @param {Array<{ accountId: string, position: number, capacity?: { value: number | null, remainingPercent: number | null, multiplier: number, multiplierSource?: string } | null, billing?: { effective: string } | null }>} input.candidates
 * @param {Array<{ accountId: string, position: number }>} [input.members] Lista inteira, para achar a posição do cursor do rodízio.
 * @param {string | null} [input.lastSpawnedAccountId] Cursor do rodízio (`deriveRoundRobinCursor`).
 * @returns {Array<object>} Candidatos com `rank` (1 = recomendado) e `explanation`.
 */
function rankCandidates({ strategy, candidates, members = [], lastSpawnedAccountId = null }) {
  const manual = [...(candidates ?? [])].sort(compareManualOrder)
  let ordered = manual
  let explain = (_candidate, rank) => (rank === 1 ? '1ª apta na ordem manual' : `${rank}ª apta na ordem manual`)

  if (strategy === 'round_robin') {
    const cursor = [...members, ...manual].find((item) => item.accountId === lastSpawnedAccountId)
    const cursorPosition = cursor ? cursor.position : -Infinity
    // Estritamente depois do último destino, em ordem circular.
    ordered = [
      ...manual.filter((candidate) => candidate.position > cursorPosition),
      ...manual.filter((candidate) => candidate.position <= cursorPosition),
    ]
    explain = (_candidate, rank) => (rank === 1 ? 'próxima do rodízio' : `${rank}ª no rodízio`)
  } else if (strategy === 'most_capacity') {
    const measured = manual.filter((candidate) => typeof candidate.capacity?.value === 'number')
    const unmeasured = manual.filter((candidate) => typeof candidate.capacity?.value !== 'number')
    measured.sort((a, b) => b.capacity.value - a.capacity.value || compareManualOrder(a, b))
    ordered = [...measured, ...unmeasured]
    explain = (candidate, rank) => {
      if (typeof candidate.capacity?.value !== 'number') return 'sem medição atual, não comparada'
      return `${rank === 1 ? 'maior capacidade' : 'capacidade'}: ${describeCapacity(candidate.capacity)}`
    }
  } else if (strategy === 'subscription_first') {
    const group = (candidate) => BILLING_GROUP_ORDER[candidate.billing?.effective] ?? BILLING_GROUP_ORDER.desconhecida
    ordered = [...manual].sort((a, b) => group(a) - group(b) || compareManualOrder(a, b))
    explain = (candidate) => {
      const effective = candidate.billing?.effective
      if (effective === 'assinatura') return 'assinatura primeiro'
      if (effective === 'uso') return 'uso, depois das assinaturas'
      return 'cobrança desconhecida, depois das assinaturas'
    }
  }

  return ordered.map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
    explanation: explain(candidate, index + 1),
  }))
}

module.exports = {
  ELIGIBILITY_REASONS,
  classifyBilling,
  computeCapacity,
  cooldownBlocks,
  deriveRoundRobinCursor,
  detectPlanMultiplier,
  evaluateEligibility,
  evaluateMembers,
  filterMembersForKind,
  findExhaustedWindow,
  isMeasurementCurrent,
  isWithinTtl,
  rankCandidates,
  readPercentWindows,
  resolveBilling,
  resolveCooldownEnd,
  resolvePlanMultiplier,
}
