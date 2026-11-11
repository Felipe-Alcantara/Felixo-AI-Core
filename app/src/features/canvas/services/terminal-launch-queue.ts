import type { AccountChainProviderId, AccountSwitchProposal } from '../../shared/types/account-chain'
import type { ChainLaunchConfirmation, ChainLaunchPreview } from './account-chain-client'
import type { NewTerminalOptions } from './new-terminal-options'

/**
 * Um item da fila do botão Agente. Com "Automática (cadeia)", a fila guarda a
 * proposta que a pessoa viu ao enfileirar (vale 30 min), e não um ticket: o
 * ticket vence em 2 min, e confirmar ao enfileirar fazia a fila iniciada
 * depois disso abrir blocos em erro (decisão do Felipe, 11/11/2026: confirmar
 * ao iniciar).
 */
export type QueuedLaunch = {
  options: NewTerminalOptions
  chain?: {
    proposal: AccountSwitchProposal
    /** A frase da prévia ("Vai abrir na conta …"), mostrada na fila. */
    summary: string
    /** Por que o item não abriu na última tentativa de iniciar. */
    message?: string
  }
}

type QueueChainBridge = {
  confirm: (proposal: AccountSwitchProposal) => Promise<ChainLaunchConfirmation>
  preview: (providerId: AccountChainProviderId) => Promise<ChainLaunchPreview>
}

/**
 * O clique em "Iniciar fila" é a confirmação de cada item da cadeia, na conta
 * que a fila mostrava. Um item cuja conta deixou de ser apta não abre noutra:
 * fica na fila com o motivo e a nova conta sugerida, para outro clique.
 */
export async function startLaunchQueue(
  queue: readonly QueuedLaunch[],
  bridge: QueueChainBridge,
): Promise<{ toOpen: NewTerminalOptions[]; remaining: QueuedLaunch[] }> {
  const toOpen: NewTerminalOptions[] = []
  const remaining: QueuedLaunch[] = []

  for (const item of queue) {
    if (!item.chain) {
      toOpen.push(item.options)
      continue
    }
    const result = await bridge.confirm(item.chain.proposal)
    if (result.ok) {
      toOpen.push({
        ...item.options,
        accountId: result.launch.accountId,
        accountMode: 'chain',
        chainTicket: result.launch.ticket,
      })
      continue
    }
    // A prévia recalculada vem com a recusa quando o destino mudou; proposta
    // vencida volta sem ela, e o item pede uma nova para mostrar a conta atual.
    const next =
      result.preview ??
      (item.options.providerId
        ? await bridge.preview(item.options.providerId as AccountChainProviderId)
        : undefined)
    remaining.push({
      ...item,
      chain:
        next?.status === 'ready'
          ? { proposal: next.proposal, summary: next.summary, message: result.message }
          : { ...item.chain, message: result.message },
    })
  }

  return { toOpen, remaining }
}
