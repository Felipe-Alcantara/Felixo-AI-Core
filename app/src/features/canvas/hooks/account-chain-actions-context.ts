import { createContext, useContext } from 'react'
import type { AccountFailureClass } from '../../shared/types/account-chain'
import type { TerminalChainBanner } from '../services/account-chain-view'

/**
 * O que um bloco pode pedir a partir das faixas da cadeia. Quem implementa é
 * `useAccountContinuation`, montado uma vez no canvas; o bloco só repassa o
 * clique (e o elemento que o disparou, para o foco voltar a ele).
 */
export type AccountChainCanvasActions = {
  onBannerAction: (params: {
    nodeId: string
    banner: TerminalChainBanner
    action: TerminalChainBanner['actions'][number]
    trigger: HTMLElement | null
  }) => void
  /** Rótulo e origem de um bloco, para "continuado em ‹bloco› às HH:MM". */
  nodeSummary: (nodeId: string) => {
    label: string
    decidedAt: string | null
    reasonClass: AccountFailureClass | null
  } | null
  /** Falha da última ação pedida pela faixa deste bloco (mostrada como alerta). */
  errorFor: (nodeId: string) => string | null
}

export const AccountChainActionsContext = createContext<AccountChainCanvasActions | null>(null)

/** Ações da cadeia no canvas; `null` fora dele (as faixas ficam sem botões). */
export function useAccountChainActions(): AccountChainCanvasActions | null {
  return useContext(AccountChainActionsContext)
}
