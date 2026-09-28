/**
 * Cliente da cadeia de contas no renderer: um store externo sobre a ponte
 * `window.felixo.accountChain`.
 *
 * Existe um só por janela porque o painel "Limites e uso", os blocos e as
 * notificações leem o mesmo estado; cada um assinar os pushes por conta
 * própria multiplicaria as chamadas `get-state` e poderia mostrar versões
 * diferentes da cadeia ao mesmo tempo.
 *
 * O acesso à ponte é defensivo: sem o namespace (versão sem o serviço) o store
 * fica `unavailable` e a UI diz isso, sem lançar. Nenhuma decisão mora aqui —
 * o store só guarda o que o main devolveu e repassa as ações.
 */
import type {
  AccountChainBridge,
  AccountChainDetection,
  AccountChainMember,
  AccountChainMutationResult,
  AccountChainProviderId,
  AccountChainProposalEvent,
  AccountChainReleaseReason,
  AccountChainSettingsUpdate,
  AccountChainState,
  AccountSwitchProposal,
} from '../../shared/types/account-chain'
import {
  chainLaunchSummary,
  confirmErrorText,
  exclusionsText,
  toMemberUpdates,
} from './account-chain-view'

export type AccountChainStatus = 'loading' | 'unavailable' | 'ready' | 'error'

export type AccountChainSnapshot = {
  status: AccountChainStatus
  /** Erro ou aviso para a pessoa (falha do main, conflito de revisão). */
  message: string | null
  state: AccountChainState | null
  /** Última detecção por sessão PTY (`canvas:<nodeId>`). */
  detections: Readonly<Record<string, AccountChainDetection>>
}

export type AccountChainActionResult = { ok: true } | { ok: false; message: string; conflict?: boolean }

export const CHAIN_UNAVAILABLE_MESSAGE =
  'A cadeia de contas não está disponível nesta versão do app. Nenhum bloco troca de conta.'
export const CHAIN_CONFLICT_MESSAGE = 'Outra janela mudou a cadeia; mostrei a versão atual.'
const MAIN_UNREACHABLE_MESSAGE = 'Não foi possível falar com o processo principal.'

type Listener = () => void

/** Lê a ponte sem lançar quando o preload não a tem. */
export function getAccountChainBridge(
  host: { felixo?: { accountChain?: AccountChainBridge } } | undefined =
    typeof window === 'undefined' ? undefined : window,
): AccountChainBridge | null {
  try {
    return host?.felixo?.accountChain ?? null
  } catch {
    return null
  }
}

function upsertProposal(
  proposals: readonly AccountSwitchProposal[],
  proposal: AccountSwitchProposal,
): AccountSwitchProposal[] {
  const others = proposals.filter((item) => item.id !== proposal.id)
  return [...others, proposal]
}

export function applyProposalEvent(
  state: AccountChainState,
  event: AccountChainProposalEvent,
): AccountChainState {
  if (event.type === 'opened') {
    return { ...state, pendingProposals: upsertProposal(state.pendingProposals, event.proposal) }
  }
  if (!state.pendingProposals.some((item) => item.id === event.proposalId)) return state
  return {
    ...state,
    pendingProposals: state.pendingProposals.filter((item) => item.id !== event.proposalId),
  }
}

export type AccountChainStore = ReturnType<typeof createAccountChainStore>

export function createAccountChainStore(bridge: AccountChainBridge | null) {
  let snapshot: AccountChainSnapshot = {
    status: bridge ? 'loading' : 'unavailable',
    message: bridge ? null : CHAIN_UNAVAILABLE_MESSAGE,
    state: null,
    detections: {},
  }
  const listeners = new Set<Listener>()
  let retainCount = 0
  let unsubscribers: Array<() => void> = []
  let loadToken = 0

  const emit = () => {
    listeners.forEach((listener) => listener())
  }

  const set = (patch: Partial<AccountChainSnapshot>) => {
    snapshot = { ...snapshot, ...patch }
    emit()
  }

  const setState = (state: AccountChainState, message: string | null = null) => {
    set({ status: 'ready', state, message })
  }

  const refresh = async (): Promise<void> => {
    if (!bridge) return
    const token = ++loadToken
    try {
      const result = await bridge.getState()
      if (token !== loadToken) return
      if (!result.ok) {
        set({
          status: snapshot.state ? 'ready' : 'error',
          message: result.message ?? 'Não foi possível carregar a cadeia de contas.',
        })
        return
      }
      setState({
        settings: result.settings,
        revision: result.revision,
        members: result.members,
        pendingProposals: result.pendingProposals,
        cooldowns: result.cooldowns,
        envCredentialNames: result.envCredentialNames,
      })
    } catch {
      if (token !== loadToken) return
      set({ status: snapshot.state ? 'ready' : 'error', message: MAIN_UNREACHABLE_MESSAGE })
    }
  }

  const subscribePushes = () => {
    if (!bridge) return
    const safe = (subscribe: () => () => void) => {
      try {
        unsubscribers.push(subscribe())
      } catch {
        // Um push que não assina não derruba os outros: o get-state ao montar
        // e ao mutar continua trazendo o estado.
      }
    }
    safe(() =>
      bridge.onChanged((state) => {
        loadToken += 1
        setState(state)
      }),
    )
    safe(() =>
      bridge.onProposal((event) => {
        if (!snapshot.state) {
          void refresh()
          return
        }
        set({ state: applyProposalEvent(snapshot.state, event) })
      }),
    )
    safe(() =>
      bridge.onDetection((detection) => {
        set({ detections: { ...snapshot.detections, [detection.sessionId]: detection } })
      }),
    )
  }

  const applyMutation = (result: AccountChainMutationResult): AccountChainActionResult => {
    if (result.ok) {
      loadToken += 1
      setState(result.state)
      return { ok: true }
    }
    if (result.code === 'REVISION_CONFLICT' && 'current' in result && result.current) {
      loadToken += 1
      setState(result.current, CHAIN_CONFLICT_MESSAGE)
      return { ok: false, message: CHAIN_CONFLICT_MESSAGE, conflict: true }
    }
    const message = result.message ?? 'O processo principal recusou a mudança.'
    set({ message })
    return { ok: false, message }
  }

  const mutate = async (
    run: (api: AccountChainBridge, revision: number) => Promise<AccountChainMutationResult>,
  ): Promise<AccountChainActionResult> => {
    if (!bridge) return { ok: false, message: CHAIN_UNAVAILABLE_MESSAGE }
    const revision = snapshot.state?.revision
    if (revision === undefined) {
      return { ok: false, message: 'A cadeia ainda não carregou.' }
    }
    try {
      return applyMutation(await run(bridge, revision))
    } catch {
      set({ message: MAIN_UNREACHABLE_MESSAGE })
      return { ok: false, message: MAIN_UNREACHABLE_MESSAGE }
    }
  }

  return {
    bridge,
    subscribe(listener: Listener): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot(): AccountChainSnapshot {
      return snapshot
    },
    /**
     * Liga o store enquanto houver alguém montado: assina os pushes e busca o
     * estado (é assim que uma proposta vista com a janela fechada volta).
     */
    retain(): () => void {
      retainCount += 1
      if (retainCount === 1 && bridge) {
        subscribePushes()
        void refresh()
      }
      let released = false
      return () => {
        if (released) return
        released = true
        retainCount -= 1
        if (retainCount === 0) {
          unsubscribers.forEach((unsubscribe) => {
            try {
              unsubscribe()
            } catch {
              // Cancelar a assinatura nunca pode quebrar a desmontagem.
            }
          })
          unsubscribers = []
        }
      }
    },
    refresh,
    updateSettings(patch: Omit<AccountChainSettingsUpdate, 'expectedRevision'>) {
      return mutate((api, revision) => api.updateSettings({ ...patch, expectedRevision: revision }))
    },
    /** Regrava a lista inteira, na ordem dada, sob a revisão atual. */
    updateMembers(members: readonly AccountChainMember[]) {
      return mutate((api, revision) =>
        api.updateMembers({ members: toMemberUpdates(members), expectedRevision: revision }),
      )
    },
    /** "Conferir agora": a checagem roda no main; o estado volta pelo get-state. */
    async checkLogin(accountIds: readonly string[]): Promise<AccountChainActionResult> {
      if (!bridge) return { ok: false, message: CHAIN_UNAVAILABLE_MESSAGE }
      try {
        const result = await bridge.checkLogin({ accountIds: accountIds.slice(0, 5) })
        await refresh()
        return result.ok
          ? { ok: true }
          : { ok: false, message: result.message ?? 'Não foi possível conferir o login.' }
      } catch {
        return { ok: false, message: MAIN_UNREACHABLE_MESSAGE }
      }
    },
    /** "Não era limite" / "Já recarreguei" na lista da cadeia. */
    async releaseCooldown(
      accountId: string,
      reason: AccountChainReleaseReason,
    ): Promise<AccountChainActionResult & { requiresCheck?: boolean }> {
      if (!bridge) return { ok: false, message: CHAIN_UNAVAILABLE_MESSAGE }
      try {
        const result = await bridge.releaseCooldown({ accountId, reason })
        await refresh()
        return result.ok
          ? { ok: true, requiresCheck: result.requiresCheck }
          : { ok: false, message: result.message ?? 'Não foi possível liberar a espera.' }
      } catch {
        return { ok: false, message: MAIN_UNREACHABLE_MESSAGE }
      }
    },
    /** Some a faixa da detecção de uma sessão (a pessoa já agiu sobre ela). */
    clearDetection(sessionId: string) {
      if (!(sessionId in snapshot.detections)) return
      const next = { ...snapshot.detections }
      delete next[sessionId]
      set({ detections: next })
    },
    clearMessage() {
      if (snapshot.message && snapshot.status === 'ready') set({ message: null })
    },
  }
}

let sharedStore: AccountChainStore | null = null

/** O store da janela, criado na primeira leitura. */
export function getSharedAccountChainStore(): AccountChainStore {
  if (!sharedStore) {
    sharedStore = createAccountChainStore(getAccountChainBridge())
  }
  return sharedStore
}

/**
 * Prévia de "Automática (cadeia)" ao abrir um bloco (§8.5): o main cria uma
 * proposta `launch` e diz qual conta usaria. Nunca cai no Login do sistema —
 * sem conta apta a abertura é recusada com os motivos.
 */
export type ChainLaunchPreview =
  | { status: 'ready'; proposal: AccountSwitchProposal; summary: string }
  | { status: 'refused'; message: string }

export async function previewChainLaunch(
  bridge: AccountChainBridge | null,
  providerId: AccountChainProviderId,
): Promise<ChainLaunchPreview> {
  if (!bridge) return { status: 'refused', message: CHAIN_UNAVAILABLE_MESSAGE }
  try {
    const result = await bridge.previewLaunch({ providerId })
    if (result.ok) {
      const summary = chainLaunchSummary(result.proposal)
      return summary
        ? { status: 'ready', proposal: result.proposal, summary }
        : { status: 'refused', message: 'A cadeia não indicou nenhuma conta apta.' }
    }
    if ('reasons' in result && result.code === 'CHAIN_DISABLED') {
      return { status: 'refused', message: 'A cadeia está desligada. Escolha uma conta.' }
    }
    if ('reasons' in result) {
      return {
        status: 'refused',
        message: `Nenhuma conta apta agora; o bloco não vai abrir no Login do sistema. ${exclusionsText(result.reasons)}`,
      }
    }
    return { status: 'refused', message: result.message ?? 'A cadeia não respondeu à prévia.' }
  } catch {
    return { status: 'refused', message: MAIN_UNREACHABLE_MESSAGE }
  }
}

/** Conta decidida pelo `confirm`, com o ticket de uso único para o spawn. */
export type ChainLaunchTicket = {
  ticket: string
  accountId: string
  providerId: AccountChainProviderId
  label: string | null
  proposalId: string
}

export type ChainLaunchConfirmation =
  | { ok: true; launch: ChainLaunchTicket }
  | {
      ok: false
      message: string
      /** A proposta recalculada pelo main (destino mudou): a UI mostra e pede de novo. */
      preview?: ChainLaunchPreview
    }

/**
 * O clique em Abrir é a confirmação: `confirm` com o destino que a prévia
 * mostrou. Se o main recusar, nada abre e a pessoa vê por quê; um destino
 * novo nunca é aceito sem ela ver.
 */
export async function confirmChainLaunch(
  bridge: AccountChainBridge | null,
  proposal: AccountSwitchProposal,
): Promise<ChainLaunchConfirmation> {
  if (!bridge) return { ok: false, message: CHAIN_UNAVAILABLE_MESSAGE }
  const destinationAccountId = proposal.recommendedAccountId
  if (!destinationAccountId) {
    return { ok: false, message: 'Nenhuma conta apta agora; o bloco não vai abrir.' }
  }
  try {
    const result = await bridge.confirm({ proposalId: proposal.id, destinationAccountId })
    if (result.ok) {
      return {
        ok: true,
        launch: {
          ticket: result.ticket,
          accountId: result.destination.accountId,
          providerId: result.destination.providerId,
          label: result.destination.label,
          proposalId: proposal.id,
        },
      }
    }
    const message = confirmErrorText(result.code, result.message)
    if ('proposal' in result && result.proposal) {
      const summary = chainLaunchSummary(result.proposal)
      return {
        ok: false,
        message,
        preview: summary
          ? { status: 'ready', proposal: result.proposal, summary }
          : { status: 'refused', message: 'Nenhuma conta apta agora; o bloco não vai abrir.' },
      }
    }
    return { ok: false, message }
  } catch {
    return { ok: false, message: MAIN_UNREACHABLE_MESSAGE }
  }
}

export type AccountModeChange = {
  /** Gravar o modo no bloco? Fixar sempre grava (é o lado seguro). */
  persist: boolean
  message: string | null
}

/**
 * [Fixar nesta conta] / [Voltar para a cadeia] no painel de detalhes. O main
 * fica sabendo pela sessão viva (fixar expira as propostas abertas dela); o
 * bloco grava o modo para o próximo spawn. Voltar para a cadeia só grava se o
 * main aceitou — sem ele, nada de cadeia; fixar grava mesmo com o main fora,
 * porque ficar fixo nunca troca nada.
 */
export async function changeSessionAccountMode(
  bridge: AccountChainBridge | null,
  sessionId: string,
  mode: 'pinned' | 'chain',
): Promise<AccountModeChange> {
  if (!bridge) {
    return mode === 'pinned'
      ? { persist: true, message: null }
      : { persist: false, message: CHAIN_UNAVAILABLE_MESSAGE }
  }
  try {
    const result = await bridge.setSessionMode({ sessionId, mode })
    if (result.ok) return { persist: true, message: null }
    return {
      persist: mode === 'pinned',
      message: result.message ?? 'O processo principal recusou a mudança de modo.',
    }
  } catch {
    return { persist: mode === 'pinned', message: MAIN_UNREACHABLE_MESSAGE }
  }
}
