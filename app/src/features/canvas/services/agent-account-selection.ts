import type { CliAccount } from '../../shared/types/cli-accounts'

/**
 * Identifica uma resposta de listagem que ainda pertence à configuração
 * visível. O token torna a decisão determinística mesmo quando a API resolve
 * as promessas fora da ordem em que foram iniciadas.
 */
export function shouldApplyAccountListResult({
  requestProviderId,
  currentProviderId,
  requestId,
  latestRequestId,
}: {
  requestProviderId: string
  currentProviderId: string
  requestId: number
  latestRequestId: number
}): boolean {
  return requestProviderId === currentProviderId && requestId === latestRequestId
}

/** Escolhe uma conta ainda pertencente à lista do provedor atual. */
export function selectAccountFromList(
  accounts: readonly CliAccount[],
  currentAccountId: string,
  savedAccountId: string,
): string {
  if (accounts.some((account) => account.id === currentAccountId)) {
    return currentAccountId
  }

  return accounts.some((account) => account.id === savedAccountId) ? savedAccountId : ''
}
