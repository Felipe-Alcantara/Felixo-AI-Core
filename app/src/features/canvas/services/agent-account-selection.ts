import type { CliAccount } from '../../shared/types/cli-accounts'
import { CHAIN_ACCOUNT_VALUE } from './agent-launch-preferences'

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

  // "Automática (cadeia)" não é uma conta da lista: quem decide se ela vale
  // (cadeia ligada, conta apta) é o main, na prévia da abertura.
  if (wanted === CHAIN_ACCOUNT_VALUE) {
    return { status: 'ok', accountId: wanted }
  }

  return listing.accounts.some((account) => account.id === wanted)
    ? { status: 'ok', accountId: wanted }
    : { status: 'saved-missing', accountId: wanted }
}

/** Problema de conta que bloqueia a abertura, com o texto que a interface mostra. */
export type AccountSelectionIssue = {
  /** `chain-blocked`: "Automática (cadeia)" escolhida, mas a cadeia não pode abrir agora. */
  status: 'saved-missing' | 'list-failed' | 'chain-blocked'
  message: string
}

/** O que o campo Conta sabe da cadeia para decidir se "Automática" pode abrir. */
export type ChainSelectionContext = {
  chainStatus: 'loading' | 'unavailable' | 'ready' | 'error'
  enabled: boolean
  /** Há conta deste provedor que a cadeia consegue conferir (não travada). */
  providerHasLoginCheck: boolean
  /** Prévia do main; `pending` enquanto ela não chegou. */
  preview: { status: 'pending' } | { status: 'ready' } | { status: 'refused'; message: string }
}

/**
 * Bloqueio de "Automática (cadeia)". Qualquer coisa que impeça a cadeia de
 * escolher uma conta bloqueia a abertura com o motivo: cair no Login do
 * sistema em silêncio seria a mesma queda que a seleção de conta já recusa.
 */
export function describeChainSelectionIssue(
  accountId: string,
  context: ChainSelectionContext,
): AccountSelectionIssue | null {
  if (accountId !== CHAIN_ACCOUNT_VALUE) return null
  const blocked = (message: string): AccountSelectionIssue => ({ status: 'chain-blocked', message })
  if (context.chainStatus === 'loading') {
    return blocked('A cadeia de contas ainda está carregando.')
  }
  if (context.chainStatus !== 'ready') {
    return blocked(
      'A cadeia de contas não está disponível; escolha uma conta. O bloco não vai abrir no Login do sistema.',
    )
  }
  if (!context.enabled) {
    return blocked('A cadeia está desligada. Escolha uma conta ou ligue a cadeia em Limites e uso.')
  }
  if (!context.providerHasLoginCheck) {
    return blocked('A cadeia não confere o login deste provedor. Escolha uma conta.')
  }
  if (context.preview.status === 'refused') return blocked(context.preview.message)
  return null
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

/**
 * Seleção depois de remover uma conta pelo configurador.
 *
 * Remover a conta que estava escolhida não é escolher o login do sistema
 * (§11: nenhum caminho grava o login do sistema sem escolha explícita). A
 * seleção fica na conta removida — o campo mostra "Selecionar…" e a
 * preferência salva não vira '' — e a abertura fica bloqueada até uma escolha
 * explícita, como no caso da conta salva que sumiu. Remover outra conta não
 * muda nada (`null`).
 */
export function selectionAfterAccountRemoved(
  currentAccountId: string,
  removedAccountId: string,
  removedLabel = '',
): { accountId: string; issue: AccountSelectionIssue } | null {
  const removed = removedAccountId.trim()
  if (!removed || currentAccountId.trim() !== removed) {
    return null
  }

  const label = removedLabel.trim()
  return {
    accountId: removed,
    issue: {
      status: 'saved-missing',
      message: label
        ? `A conta "${label}" foi removida. Escolha outra conta ou o login do sistema.`
        : 'A conta escolhida foi removida. Escolha outra conta ou o login do sistema.',
    },
  }
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
