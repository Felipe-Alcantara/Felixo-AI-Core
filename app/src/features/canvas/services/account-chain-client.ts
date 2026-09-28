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
  AccountChainProposalEvent,
  AccountChainReleaseReason,
  AccountChainSettingsUpdate,
  AccountChainState,
  AccountSwitchProposal,
} from '../../shared/types/account-chain'
import { toMemberUpdates } from './account-chain-view'

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
