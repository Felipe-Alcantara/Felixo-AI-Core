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

export type OpeniaKeyStatus = {
  source: 'account' | 'system'
  accountId?: string
  configured: boolean
}

/**
 * Escolhe a fonte de verdade da chave sem permitir fallback silencioso.
 *
 * Uma conta Openia selecionada só pode usar a chave guardada nela; a chave
 * global do Openia vale exclusivamente quando a pessoa escolhe o login do
 * sistema. Assim, conta sem chave não herda credencial de outra origem.
 */
export function resolveOpeniaKeyStatus(
  accounts: readonly CliAccount[],
  accountId: string,
  systemConfigured: boolean,
): OpeniaKeyStatus {
  const normalizedAccountId = accountId.trim()
  if (!normalizedAccountId) {
    return { source: 'system', configured: systemConfigured === true }
  }

  const account = accounts.find((item) => item.id === normalizedAccountId)
  return {
    source: 'account',
    accountId: normalizedAccountId,
    configured: account?.providerId === 'openia' && account.secretConfigured === true,
  }
}
