/**
 * Conta em que o chat roda: Login do sistema, uma conta fixa ou "Automática
 * (cadeia)". A pessoa troca a qualquer momento no compositor, e a escolha vale
 * a partir da próxima mensagem; o processo principal resolve a conta de cada
 * pedido (inclusive dos sub-agentes do orquestrador) — ver
 * `electron/services/chat-account.cjs`.
 */

export type ChatAccountSelection =
  | { mode: 'system' }
  | { mode: 'chain' }
  | { mode: 'pinned'; accountId: string }

export type ChatAccountOption = { id: string; label: string }

export const CHAT_ACCOUNT_STORAGE_KEY = 'felixo:chat-account'
export const CHAT_SYSTEM_VALUE = ''
export const CHAT_CHAIN_VALUE = '__cadeia__'

const SYSTEM: ChatAccountSelection = { mode: 'system' }

/** cliType do chat → provedor das contas (o transporte não conta: codex-app-server é Codex). */
export function chatProviderForCliType(cliType: string | null | undefined): 'claude' | 'codex' | 'gemini' | null {
  if (cliType === 'claude') return 'claude'
  if (cliType === 'codex' || cliType === 'codex-app-server') return 'codex'
  if (cliType === 'gemini' || cliType === 'gemini-acp') return 'gemini'
  return null
}

/** O que está guardado vira uma escolha válida; lixo é o Login do sistema. */
export function readChatAccountSelection(raw: string | null | undefined): ChatAccountSelection {
  if (!raw) return SYSTEM
  try {
    const value = JSON.parse(raw) as { mode?: unknown; accountId?: unknown }
    if (value?.mode === 'chain') return { mode: 'chain' }
    if (value?.mode === 'pinned' && typeof value.accountId === 'string' && value.accountId.trim()) {
      return { mode: 'pinned', accountId: value.accountId.trim() }
    }
  } catch {
    // Registro ilegível: Login do sistema.
  }
  return SYSTEM
}

/**
 * A escolha que vale para a conversa com o provedor atual. Uma conta fixa de
 * outro provedor (a pessoa trocou de CLI) ou removida vale como Login do
 * sistema; a escolha guardada não muda, e volta a valer quando a CLI volta.
 */
export function effectiveChatAccount(
  selection: ChatAccountSelection,
  accounts: readonly ChatAccountOption[],
): ChatAccountSelection {
  if (selection.mode !== 'pinned') return selection
  return accounts.some((account) => account.id === selection.accountId) ? selection : SYSTEM
}

export function chatAccountToValue(selection: ChatAccountSelection): string {
  if (selection.mode === 'chain') return CHAT_CHAIN_VALUE
  if (selection.mode === 'pinned') return selection.accountId
  return CHAT_SYSTEM_VALUE
}

export function chatAccountFromValue(value: string): ChatAccountSelection {
  if (value === CHAT_CHAIN_VALUE) return { mode: 'chain' }
  return value ? { mode: 'pinned', accountId: value } : SYSTEM
}
