'use strict'

/**
 * @module accounts/account-chain-view
 * Tradução do estado da cadeia para o contrato do renderer
 * (`src/features/shared/types/account-chain.ts`).
 *
 * O serviço e o repositório falam o formato do banco; a interface lê o do
 * contrato. Esta camada só monta a visão: não decide elegibilidade, ordem nem
 * espera (isso é da política e do serviço). Ela lê os fatos já gravados e
 * devolve objetos com exatamente os campos do contrato.
 *
 * Nada de caminho de perfil, env, chave ou e-mail sai daqui: a identidade
 * vira só `identityStatus`, e todo texto que veio da CLI (evidência, método,
 * plano, motivo) passa por `redactSecrets` de novo antes de sair.
 */

const defaultPolicy = require('./account-chain-policy.cjs')
const { computeAccountFigures } = require('./account-chain-port.cjs')
const { EVIDENCE_MAX_CHARS, SWITCH_LABEL_MAX_CHARS, SWITCH_REASON_MAX_CHARS } = require('./account-chain-constants.cjs')
const { getAgentUsageSource } = require('../agent-usage-sources.cjs')
const { redactSecrets } = require('../official-cli-account-status.cjs')

/** Razões que o contrato conhece (`AccountIneligibilityReason`). */
const CONTRACT_REASONS = Object.freeze([
  'cadeia-desligada',
  'membro-desabilitado',
  'conta-removida',
  'sem-checagem-de-login',
  'sem-chave',
  'em-espera',
  'esgotada-pela-medicao',
  'login-nao-conferido',
  'deslogada',
  'cli-ausente',
  'tempo-esgotado',
  'identidade-diferente',
  'identidade-duplicada',
  'origem',
  'ja-visitada-na-linhagem',
])

/**
 * Razão da política fora do contrato → a do contrato mais próxima, sem
 * perder o texto: `reasonText` continua dizendo o que aconteceu.
 * `checagem-falhou` (checagem com erro) e as falhas internas do serviço
 * contam como "login não conferido": a conta fica fora, como no main.
 */
const REASON_FALLBACK = 'login-nao-conferido'
const INTERNAL_REASON_TEXTS = Object.freeze({
  'erro-na-avaliacao': 'O app não conseguiu avaliar esta conta agora.',
  desconhecido: 'O app não conseguiu avaliar esta conta agora.',
  'membro-removido': 'A conta saiu da lista da cadeia.',
})

const DETECTION_OUTCOMES = Object.freeze({
  noticed: 'noticed',
  proposed: 'proposed',
  no_candidate: 'no_candidate',
  ambiguous: 'ambiguous',
  transient: 'informational',
  model_limit: 'informational',
  source_resumed: 'source_resumed',
})

const CONFIRM_ERROR_CODES = Object.freeze(['SUPERSEDED', 'EXPIRED', 'SOURCE_ACTIVE', 'NOT_ELIGIBLE', 'NOT_PENDING'])

function clipText(value, maxChars) {
  if (typeof value !== 'string' || !value.trim()) return null
  return redactSecrets(value).slice(0, maxChars)
}

function toIsoOrNull(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? new Date(value).toISOString() : null
  if (typeof value !== 'string' || !value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

/**
 * @param {{ repository: object, describeAccount: (accountId: string) => object | null, listLiveSessions?: () => Array<object>, policy?: object, now?: () => number }} deps
 */
function createAccountChainView({ repository, describeAccount, listLiveSessions = () => [], policy = defaultPolicy, now = () => Date.now() }) {
  function safeDescribe(accountId) {
    if (!accountId) return null
    try {
      return describeAccount(accountId) ?? null
    } catch {
      return null
    }
  }

  function findLiveSession(sessionId) {
    if (!sessionId) return null
    try {
      return (listLiveSessions() ?? []).find((session) => session?.sessionId === sessionId) ?? null
    } catch {
      return null
    }
  }

  function reason(value) {
    if (!value) return { reason: null, reasonText: null }
    const reasonText = defaultPolicy.ELIGIBILITY_REASONS[value] ?? INTERNAL_REASON_TEXTS[value] ?? null
    return { reason: CONTRACT_REASONS.includes(value) ? value : REASON_FALLBACK, reasonText }
  }

  function loginCheck(check) {
    if (!check) return null
    return {
      status: check.status,
      checkedAt: check.checkedAt,
      source: check.source,
      method: clipText(check.method, SWITCH_LABEL_MAX_CHARS),
      plan: clipText(check.plan, SWITCH_LABEL_MAX_CHARS),
      identityStatus: check.identityStatus ?? null,
    }
  }

  function cooldown(row, nowMs = now()) {
    if (!row || row.releasedAt) return null
    const untilMs = row.untilAt ? Date.parse(row.untilAt) : null
    const expired = untilMs !== null && Number.isFinite(untilMs) && untilMs <= nowMs
    return {
      accountId: row.accountId,
      providerId: row.providerId,
      failureClass: row.failureClass,
      detectedAt: row.detectedAt,
      untilAt: row.untilAt ?? null,
      untilSource: row.untilSource,
      // O fim alternativo (medição × texto) não é gravado na espera; só o que vale.
      alternativeUntilAt: null,
      alternativeUntilSource: null,
      evidence: clipText(row.evidence, EVIDENCE_MAX_CHARS),
      needsCheck: expired && policy.cooldownBlocks(row, repository.getLoginCheck(row.accountId), nowMs),
    }
  }

  function capacity(figures, account, nowMs) {
    const sample = figures.sample
    const measuredAt = toIsoOrNull(sample?.metadata?.measuredAt ?? sample?.collectedAt)
    return {
      value: figures.capacity.value,
      remainingPercent: figures.capacity.remainingPercent,
      measuredAt: policy.isMeasurementCurrent(sample, nowMs) ? measuredAt : null,
      lastMeasuredAt: measuredAt,
      comparable: figures.capacity.reason !== 'nao-comparavel' && account?.providerId !== 'openia',
    }
  }

  /** `AccountChainAccountView` de uma conta (membro ou não). */
  function accountView(accountId, { member = null, providerId = null, nowMs = now() } = {}) {
    const account = safeDescribe(accountId)
    const check = repository.getLoginCheck(accountId)
    const figures = computeAccountFigures({ member, account, loginCheck: check, nowMs, policy })
    return {
      accountId,
      providerId: member?.providerId ?? account?.providerId ?? providerId,
      label: clipText(account?.label, SWITCH_LABEL_MAX_CHARS) ?? accountId,
      position: member?.position ?? 0,
      billingDeclared: member?.billingDeclared ?? null,
      billingDetected: check?.billingDetected ?? null,
      planText: clipText(check?.plan, SWITCH_LABEL_MAX_CHARS),
      multiplierDeclared: member?.multiplierDeclared ?? null,
      multiplierDetected: check?.multiplierDetected ?? null,
      multiplier: figures.multiplier.value,
      multiplierSource: figures.multiplier.source,
      capacity: capacity(figures, account, nowMs),
      login: loginCheck(check),
    }
  }

  /** Membro da lista (`AccountChainMember`), a partir do membro do `getState` do serviço. */
  function member(serviceMember, nowMs) {
    const stored = repository.listMembers().find((item) => item.accountId === serviceMember.accountId) ?? serviceMember
    const view = accountView(serviceMember.accountId, { member: stored, nowMs })
    const check = repository.getLoginCheck(serviceMember.accountId)
    return {
      ...view,
      enabled: serviceMember.enabled === true,
      locked: !getAgentUsageSource(view.providerId)?.auth,
      eligible: serviceMember.eligible === true,
      ...reason(serviceMember.eligible ? null : serviceMember.reason),
      cooldown: cooldown(repository.getCooldown(serviceMember.accountId), nowMs),
      apiKeySourcePresent: check?.apiKeySourcePresent === true,
    }
  }

  function candidateProviderId(item) {
    return item?.providerId ?? safeDescribe(item?.accountId)?.providerId ?? null
  }

  function exclusion(item) {
    return {
      accountId: item.accountId,
      providerId: candidateProviderId(item),
      label: clipText(item.label, SWITCH_LABEL_MAX_CHARS) ?? clipText(safeDescribe(item.accountId)?.label, SWITCH_LABEL_MAX_CHARS) ?? item.accountId,
      ...reason(item.reason ?? REASON_FALLBACK),
    }
  }

  function fromEndpoint(event, nowMs) {
    const base = {
      accountId: event.fromAccountId ?? null,
      providerId: event.fromProviderId,
      label: clipText(event.fromLabel, SWITCH_LABEL_MAX_CHARS),
    }
    if (!event.fromAccountId) {
      return { ...base, billingDeclared: null, billingDetected: null, multiplier: null, multiplierSource: null }
    }
    const stored = repository.listMembers().find((item) => item.accountId === event.fromAccountId) ?? null
    const view = accountView(event.fromAccountId, { member: stored, providerId: event.fromProviderId, nowMs })
    return {
      ...base,
      billingDeclared: view.billingDeclared,
      billingDetected: view.billingDetected,
      multiplier: view.multiplier,
      multiplierSource: view.multiplierSource,
    }
  }

  /** `AccountSwitchProposal` de um evento `continuation`/`launch` do registro. */
  function proposal(event, nowMs = now()) {
    if (!event) return null
    const candidates = Array.isArray(event.candidates) ? event.candidates : []
    const selectable = candidates
      .filter((item) => item?.selectable === true && typeof item.accountId === 'string')
      .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
    const members = repository.listMembers()
    const sourceCooldown = event.fromAccountId ? repository.getCooldown(event.fromAccountId) : null
    const liveSource = event.kind === 'continuation' ? findLiveSession(event.sourceSessionId) : null
    const others = event.incidentKey
      ? repository.listOpenSwitchEvents().filter((item) => item.incidentKey === event.incidentKey && item.id !== event.id).length
      : 0
    return {
      id: event.id,
      kind: event.kind === 'launch' ? 'launch' : 'continuation',
      state: event.state,
      sourceSessionId: event.sourceSessionId ?? null,
      lineageId: event.lineageId ?? null,
      hop: event.hop ?? 0,
      incidentKey: event.incidentKey ?? null,
      from: fromEndpoint(event, nowMs),
      failureClass: event.kind === 'launch' ? null : (event.failureClass ?? null),
      scope: event.kind === 'launch' ? null : 'account',
      reason: clipText(event.reason, SWITCH_REASON_MAX_CHARS) ?? '',
      evidence: cooldown(sourceCooldown, nowMs)?.evidence ?? null,
      detectedAt: event.detectedAt ?? null,
      proposedAt: event.proposedAt,
      expiresAt: event.expiresAt,
      cooldown: cooldown(sourceCooldown, nowMs),
      strategy: event.strategy ?? 'manual',
      candidates: selectable.map((item) => ({
        ...accountView(item.accountId, {
          member: members.find((stored) => stored.accountId === item.accountId) ?? null,
          providerId: item.providerId ?? null,
          nowMs,
        }),
        checkingLogin: false,
      })),
      recommendedAccountId: event.toAccountId ?? null,
      excluded: candidates.filter((item) => item?.selectable !== true && typeof item?.accountId === 'string').map(exclusion),
      sourceLastOutputAt: toIsoOrNull(liveSource?.lastOutputAt ?? null),
      sourceAutoResumeAt: event.sourceAutoResumeAt ?? null,
      otherSessionsInIncident: others,
    }
  }

  /** Propostas abertas (só `proposed`: um ticket confirmado já saiu da tela). */
  function pendingProposals(nowMs = now()) {
    return repository
      .listOpenSwitchEvents()
      .filter((event) => event.state === 'proposed' && (event.kind === 'continuation' || event.kind === 'launch'))
      .map((event) => proposal(event, nowMs))
  }

  /**
   * `AccountChainState` a partir do `getState` do serviço.
   *
   * @param {object} serviceState - `{ settings, revision, members }` do serviço.
   * @param {string[]} envCredentialNames - só os nomes.
   */
  function state(serviceState, envCredentialNames = []) {
    const nowMs = now()
    const stored = repository.readSettings()
    return {
      settings: {
        enabled: serviceState?.settings?.enabled === true,
        strategy: serviceState?.settings?.strategy ?? stored.strategy,
        maxHopsPerLineage: serviceState?.settings?.maxHops ?? stored.maxHopsPerLineage,
        updatedAt: stored.updatedAt ?? null,
      },
      revision: serviceState?.revision ?? stored.revision,
      members: (serviceState?.members ?? []).map((item) => member(item, nowMs)),
      pendingProposals: pendingProposals(nowMs),
      cooldowns: repository.listCooldowns().map((row) => cooldown(row, nowMs)).filter(Boolean),
      envCredentialNames: [...envCredentialNames],
    }
  }

  /** Linha do registro de trocas (`AccountSwitchHistoryEntry`). */
  function historyEntry(event) {
    const hasDestination = event.kind !== 'notice' && event.state !== 'no_candidate'
    return {
      id: event.id,
      kind: event.kind,
      state: event.state,
      from: {
        accountId: event.fromAccountId ?? null,
        providerId: event.fromProviderId,
        label: clipText(event.fromLabel, SWITCH_LABEL_MAX_CHARS),
      },
      to: hasDestination
        ? {
            accountId: event.toAccountId ?? null,
            providerId: event.toProviderId ?? null,
            label: clipText(event.toLabel, SWITCH_LABEL_MAX_CHARS),
          }
        : null,
      failureClass: event.failureClass ?? null,
      reason: clipText(event.reason, SWITCH_REASON_MAX_CHARS) ?? '',
      strategy: event.strategy ?? null,
      chosenBy: event.chosenBy ?? null,
      sourceSessionId: event.sourceSessionId ?? null,
      targetSessionId: event.targetSessionId ?? null,
      detectedAt: event.detectedAt ?? null,
      proposedAt: event.proposedAt,
      decidedAt: event.decidedAt ?? null,
      spawnedAt: event.spawnedAt ?? null,
      sourceActiveAck: event.sourceActiveAck === true,
      transcriptChars: event.transcriptChars ?? null,
      postSwitchFailure: event.postSwitchFailure ?? null,
    }
  }

  /**
   * `AccountChainDetection` a partir do push do serviço
   * (`{ sessionId, accountId, providerId, failureClass, scope, ambiguous,
   * evidence, action, eventId?, detectionId?, postSwitchFailure? }`).
   */
  function detection(payload, { id } = {}) {
    const nowMs = now()
    const outcome = DETECTION_OUTCOMES[payload?.action] ?? 'informational'
    const event = payload?.eventId ? repository.getSwitchEvent(payload.eventId) : null
    const live = findLiveSession(payload?.sessionId)
    const accountId = payload?.accountId ?? null
    return {
      id: payload?.detectionId ?? payload?.eventId ?? id,
      sessionId: payload?.sessionId,
      accountId,
      accountLabel: accountId ? clipText(safeDescribe(accountId)?.label, SWITCH_LABEL_MAX_CHARS) : null,
      providerId: payload?.providerId,
      accountMode: live?.accountMode === 'chain' && accountId ? 'chain' : 'pinned',
      failureClass: payload?.failureClass ?? 'unknown',
      scope: payload?.scope === 'model' ? 'model' : 'account',
      ambiguous: payload?.ambiguous === true,
      evidence: clipText(payload?.evidence, EVIDENCE_MAX_CHARS),
      detectedAt: new Date(nowMs).toISOString(),
      cooldown: accountId ? cooldown(repository.getCooldown(accountId), nowMs) : null,
      outcome,
      proposalId: outcome === 'proposed' ? (payload?.eventId ?? null) : null,
      switchEventId: outcome === 'noticed' || outcome === 'no_candidate' ? (payload?.eventId ?? null) : null,
      exclusions:
        outcome === 'no_candidate' && event
          ? (event.candidates ?? []).filter((item) => typeof item?.accountId === 'string').map(exclusion)
          : [],
      postSwitchFailure: payload?.postSwitchFailure === true,
    }
  }

  /** Motivos de uma abertura recusada (`preview-launch` sem conta apta). */
  function launchReasons(reasons) {
    return (Array.isArray(reasons) ? reasons : []).filter((item) => typeof item?.accountId === 'string').map(exclusion)
  }

  /** Estado atual de uma proposta que saiu da lista de abertas. */
  function proposalState(proposalId) {
    try {
      return repository.getSwitchEvent(proposalId)?.state ?? null
    } catch {
      return null
    }
  }

  return {
    accountView,
    cooldown,
    detection,
    historyEntry,
    launchReasons,
    loginCheck,
    pendingProposals,
    proposal,
    proposalState,
    state,
  }
}

module.exports = {
  CONFIRM_ERROR_CODES,
  CONTRACT_REASONS,
  DETECTION_OUTCOMES,
  createAccountChainView,
}
