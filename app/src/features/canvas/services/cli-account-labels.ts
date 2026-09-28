/**
 * Rótulos das contas com login próprio, para o selo do bloco ("Pessoal ·
 * fixa"). O bloco só guarda o id da conta; o nome vem da lista do main.
 *
 * Um store por janela, carregado sob demanda: a primeira leitura busca a
 * lista inteira e um id desconhecido (conta criada depois) pede uma nova
 * carga, uma vez por id. Sem a ponte, nada é carregado e o selo diz "conta
 * sem nome" — nunca "Login do sistema", que seria afirmar outra conta.
 */
import type { CliAccount } from '../../shared/types/cli-accounts'

type ListAccounts = () => Promise<{ ok: boolean; accounts?: CliAccount[] } | undefined>

export type CliAccountLabelStore = ReturnType<typeof createCliAccountLabelStore>

export function createCliAccountLabelStore(listAccounts: ListAccounts | null) {
  let labels: ReadonlyMap<string, string> = new Map()
  let inFlight: Promise<void> | null = null
  const missesRequested = new Set<string>()
  const listeners = new Set<() => void>()

  const load = (): Promise<void> => {
    if (!listAccounts) return Promise.resolve()
    if (inFlight) return inFlight
    inFlight = listAccounts()
      .then((result) => {
        if (!result?.ok) return
        labels = new Map((result.accounts ?? []).map((account) => [account.id, account.label]))
        listeners.forEach((listener) => listener())
      })
      .catch(() => {
        // Sem lista, o selo mostra "conta sem nome"; nada é inventado.
      })
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getLabels(): ReadonlyMap<string, string> {
      return labels
    },
    /** Garante o rótulo de `accountId`: recarrega uma vez se o id é novo. */
    request(accountId: string | undefined): void {
      if (!accountId || labels.has(accountId) || missesRequested.has(accountId)) return
      missesRequested.add(accountId)
      void load()
    },
  }
}

let sharedLabels: CliAccountLabelStore | null = null

export function getSharedCliAccountLabelStore(): CliAccountLabelStore {
  if (!sharedLabels) {
    const bridge = typeof window === 'undefined' ? undefined : window.felixo?.cliAccounts
    sharedLabels = createCliAccountLabelStore(bridge ? () => bridge.list() : null)
  }
  return sharedLabels
}
