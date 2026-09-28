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

/** Resultado da listagem de contas do provedor, como a ponte devolve. */
export type AccountListing =
  | { ok: true; accounts: readonly CliAccount[] }
  | { ok: false; message?: string }

/**
 * Como a conta do configurador foi resolvida depois de listar:
 * - `ok`: a conta (ou o login do sistema) existe e pode abrir;
 * - `saved-missing`: a conta pedida não está mais na lista;
 * - `list-failed`: a lista não pôde ser lida.
 * Nos dois últimos a seleção é mantida e a abertura fica bloqueada até uma
 * escolha explícita: cair em "Login do sistema" em silêncio abria o bloco na
 * conta errada (e cobrava de quem não foi escolhido).
 */
export type AccountSelection =
  | { status: 'ok'; accountId: string }
  | { status: 'saved-missing'; accountId: string }
  | { status: 'list-failed'; accountId: string; message?: string }

/**
 * Escolhe a conta do provedor atual a partir da listagem.
 *
 * @param currentAccountId - Seleção visível ('' = login do sistema).
 * @param savedAccountId - Conta salva nas preferências, só quando ela é deste
 *   provedor (a de outro provedor não é "ausente", só não se aplica).
 */
export function selectAccountFromList(
  listing: AccountListing,
  currentAccountId: string,
  savedAccountId: string,
): AccountSelection {
  const wanted = currentAccountId.trim() || savedAccountId.trim()

  if (!listing.ok) {
    return { status: 'list-failed', accountId: wanted, message: listing.message }
  }

  if (!wanted) {
    return { status: 'ok', accountId: '' }
  }

  return listing.accounts.some((account) => account.id === wanted)
    ? { status: 'ok', accountId: wanted }
    : { status: 'saved-missing', accountId: wanted }
}

/** Problema de conta que bloqueia a abertura, com o texto que a interface mostra. */
export type AccountSelectionIssue = {
  status: 'saved-missing' | 'list-failed'
  message: string
}

/**
 * Texto do aviso para uma seleção que não pode abrir. `savedLabel` é o nome
 * guardado da conta salva (a lista não tem mais o nome de quem sumiu).
 */
export function describeAccountSelectionIssue(
  selection: AccountSelection,
  savedLabel = '',
): AccountSelectionIssue | null {
  if (selection.status === 'ok') {
    return null
  }

  if (selection.status === 'list-failed') {
    const detail = selection.message?.trim()
    return {
      status: 'list-failed',
      message: [
        'Não foi possível carregar as contas; o bloco não vai abrir no login do sistema por engano.',
        detail,
      ]
        .filter(Boolean)
        .join(' '),
    }
  }

  const label = savedLabel.trim()
  return {
    status: 'saved-missing',
    message: label
      ? `A conta salva "${label}" não existe mais. Escolha outra conta ou o login do sistema.`
      : 'A conta salva não existe mais. Escolha outra conta ou o login do sistema.',
  }
}

/**
 * Uma escolha explícita no campo resolve o aviso? Conta ausente: qualquer
 * escolha resolve. Lista ilegível: só escolher o login do sistema resolve
 * (nenhuma conta pode ser conferida); o resto espera "Tentar de novo".
 */
export function resolveIssueAfterExplicitChoice(
  issue: AccountSelectionIssue | null,
  chosenAccountId: string,
): AccountSelectionIssue | null {
  if (!issue) return null
  if (issue.status === 'saved-missing') return null
  return chosenAccountId.trim() === '' ? null : issue
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
