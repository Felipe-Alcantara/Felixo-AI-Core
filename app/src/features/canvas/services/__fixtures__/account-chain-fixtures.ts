/**
 * Falso do namespace `window.felixo.accountChain` e construtores de estado
 * para os testes do renderer da cadeia. Nada aqui roda no app: só os testes
 * importam este arquivo.
 */
import type {
  AccountChainBridge,
  AccountChainDetection,
  AccountChainMember,
  AccountChainProposalEvent,
  AccountChainState,
  AccountSwitchCandidate,
  AccountSwitchProposal,
} from '../../../shared/types/account-chain'

export function makeMember(overrides: Partial<AccountChainMember> = {}): AccountChainMember {
  return {
    accountId: 'conta-a',
    providerId: 'codex',
    label: 'Pessoal',
    position: 0,
    billingDeclared: null,
    billingDetected: 'assinatura',
    planText: 'plus',
    multiplierDeclared: null,
    multiplierDetected: null,
    multiplier: 1,
    multiplierSource: 'nao_declarado',
    capacity: {
      value: null,
      remainingPercent: null,
      measuredAt: null,
      lastMeasuredAt: null,
      comparable: true,
    },
    login: {
      status: 'logged_in',
      checkedAt: '2026-09-28T17:00:00.000Z',
      source: 'checagem',
      method: 'Logged in using ChatGPT',
      plan: 'plus',
      identityStatus: 'matched',
    },
    enabled: true,
    locked: false,
    eligible: true,
    reason: null,
    reasonText: null,
    cooldown: null,
    apiKeySourcePresent: false,
    ...overrides,
  }
}

export function makeCandidate(overrides: Partial<AccountSwitchCandidate> = {}): AccountSwitchCandidate {
  const member = makeMember()
  return {
    accountId: member.accountId,
    providerId: member.providerId,
    label: member.label,
    position: member.position,
    billingDeclared: member.billingDeclared,
    billingDetected: member.billingDetected,
    planText: member.planText,
    multiplierDeclared: member.multiplierDeclared,
    multiplierDetected: member.multiplierDetected,
    multiplier: member.multiplier,
    multiplierSource: member.multiplierSource,
    capacity: member.capacity,
    login: member.login,
    checkingLogin: false,
    ...overrides,
  }
}

export function makeState(overrides: Partial<AccountChainState> = {}): AccountChainState {
  return {
    settings: { enabled: true, strategy: 'manual', maxHopsPerLineage: 3, updatedAt: null },
    revision: 1,
    members: [makeMember()],
    pendingProposals: [],
    cooldowns: [],
    envCredentialNames: [],
    ...overrides,
  }
}

export function makeProposal(overrides: Partial<AccountSwitchProposal> = {}): AccountSwitchProposal {
  return {
    id: 'proposta-1',
    kind: 'continuation',
    state: 'proposed',
    sourceSessionId: 'canvas:bloco-1',
    lineageId: 'linhagem-1',
    hop: 0,
    incidentKey: 'conta-a|2026-09-28T17:32:05.000Z',
    from: {
      accountId: 'conta-a',
      providerId: 'codex',
      label: 'Pessoal',
      billingDeclared: null,
      billingDetected: 'assinatura',
      multiplier: 1,
      multiplierSource: 'nao_declarado',
    },
    failureClass: 'limit',
    scope: 'account',
    reason: 'Limite de uso da conta Pessoal',
    evidence: 'You’ve hit your usage limit. … or try again at 8:04 PM.',
    detectedAt: '2026-09-28T17:32:05.000Z',
    proposedAt: '2026-09-28T17:32:06.000Z',
    expiresAt: '2026-09-28T18:02:06.000Z',
    cooldown: {
      accountId: 'conta-a',
      providerId: 'codex',
      failureClass: 'limit',
      detectedAt: '2026-09-28T17:32:05.000Z',
      untilAt: '2026-09-28T19:40:00.000Z',
      untilSource: 'texto',
      alternativeUntilAt: null,
      alternativeUntilSource: null,
      evidence: null,
      needsCheck: false,
    },
    strategy: 'manual',
    candidates: [
      makeCandidate({ accountId: 'conta-b', label: 'Trabalho', position: 1 }),
      makeCandidate({ accountId: 'conta-c', label: 'Reserva', position: 2 }),
    ],
    recommendedAccountId: 'conta-b',
    excluded: [],
    sourceLastOutputAt: '2026-09-28T17:32:05.000Z',
    sourceAutoResumeAt: null,
    otherSessionsInIncident: 0,
    ...overrides,
  }
}

export function makeDetection(overrides: Partial<AccountChainDetection> = {}): AccountChainDetection {
  return {
    id: 'deteccao-1',
    sessionId: 'canvas:bloco-1',
    accountId: 'conta-a',
    accountLabel: 'Pessoal',
    providerId: 'codex',
    accountMode: 'chain',
    failureClass: 'limit',
    scope: 'account',
    ambiguous: false,
    evidence: 'You’ve hit your usage limit.',
    detectedAt: '2026-09-28T17:32:05.000Z',
    cooldown: null,
    outcome: 'proposed',
    proposalId: 'proposta-1',
    switchEventId: null,
    exclusions: [],
    postSwitchFailure: false,
    ...overrides,
  }
}

type Handler<T> = (value: T) => void

export type FakeAccountChainBridge = AccountChainBridge & {
  calls: Array<{ method: string; params: unknown }>
  emitChanged: (state: AccountChainState) => void
  emitProposal: (event: AccountChainProposalEvent) => void
  emitDetection: (detection: AccountChainDetection) => void
  listenerCount: () => number
}

/**
 * Falso da ponte: registra cada chamada e devolve o que `responses` mandar
 * (ou um padrão OK). Os `emit*` simulam os pushes do main.
 */
export function createFakeBridge(
  responses: Partial<Record<keyof AccountChainBridge, (params: unknown) => unknown>> = {},
  initialState: AccountChainState = makeState(),
): FakeAccountChainBridge {
  const calls: Array<{ method: string; params: unknown }> = []
  const changed = new Set<Handler<AccountChainState>>()
  const proposals = new Set<Handler<AccountChainProposalEvent>>()
  const detections = new Set<Handler<AccountChainDetection>>()

  const invoke = (method: keyof AccountChainBridge, fallback: unknown) => async (params?: unknown) => {
    calls.push({ method, params })
    const custom = responses[method]
    return (custom ? custom(params) : fallback) as never
  }

  return {
    calls,
    getState: invoke('getState', { ok: true, ...initialState }),
    updateSettings: invoke('updateSettings', { ok: true, state: initialState }),
    updateMembers: invoke('updateMembers', { ok: true, state: initialState }),
    checkLogin: invoke('checkLogin', { ok: true, results: [] }),
    previewLaunch: invoke('previewLaunch', { ok: true, proposal: makeProposal({ kind: 'launch' }) }),
    confirm: invoke('confirm', {
      ok: true,
      ticket: 'proposta-1',
      destination: { accountId: 'conta-b', providerId: 'codex', label: 'Trabalho' },
    }),
    decline: invoke('decline', { ok: true }),
    resolveAmbiguous: invoke('resolveAmbiguous', { ok: true }),
    setSessionMode: invoke('setSessionMode', { ok: true }),
    releaseCooldown: invoke('releaseCooldown', { ok: true, requiresCheck: false }),
    redactTranscript: async (params) => {
      calls.push({ method: 'redactTranscript', params })
      const custom = responses.redactTranscript
      if (custom) return custom(params) as never
      const text = (params as { text: string }).text.replace(/sk-[A-Za-z0-9]+/g, '[redigido]')
      return { ok: true, text, chars: text.length }
    },
    recordManual: invoke('recordManual', { ok: true, eventId: 'evento-manual-1' }),
    history: invoke('history', { ok: true, entries: [], hasMore: false }),
    onChanged: (callback) => {
      changed.add(callback)
      return () => changed.delete(callback)
    },
    onProposal: (callback) => {
      proposals.add(callback)
      return () => proposals.delete(callback)
    },
    onDetection: (callback) => {
      detections.add(callback)
      return () => detections.delete(callback)
    },
    emitChanged: (state) => changed.forEach((callback) => callback(state)),
    emitProposal: (event) => proposals.forEach((callback) => callback(event)),
    emitDetection: (detection) => detections.forEach((callback) => callback(detection)),
    listenerCount: () => changed.size + proposals.size + detections.size,
  }
}
