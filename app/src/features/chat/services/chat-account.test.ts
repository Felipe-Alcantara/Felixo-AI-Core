import { describe, expect, it } from 'vitest'
import {
  CHAT_CHAIN_VALUE,
  chatAccountFromValue,
  chatAccountToValue,
  chatProviderForCliType,
  effectiveChatAccount,
  readChatAccountSelection,
} from './chat-account'

const CLAUDE = [{ id: 'claude-max', label: 'Claude Max' }]

describe('conta do chat', () => {
  it('lê a escolha guardada e trata lixo como Login do sistema', () => {
    expect(readChatAccountSelection(null)).toEqual({ mode: 'system' })
    expect(readChatAccountSelection('{"mode":"chain"}')).toEqual({ mode: 'chain' })
    expect(readChatAccountSelection('{"mode":"pinned","accountId":" claude-max "}')).toEqual({
      mode: 'pinned',
      accountId: 'claude-max',
    })
    expect(readChatAccountSelection('{"mode":"pinned"}')).toEqual({ mode: 'system' })
    expect(readChatAccountSelection('não é json')).toEqual({ mode: 'system' })
  })

  it('conta fixa de outro provedor ou removida vale como Login do sistema, sem apagar a escolha', () => {
    const pinned = { mode: 'pinned' as const, accountId: 'claude-max' }
    expect(effectiveChatAccount(pinned, CLAUDE)).toBe(pinned)
    expect(effectiveChatAccount(pinned, [])).toEqual({ mode: 'system' })
    expect(effectiveChatAccount({ mode: 'chain' }, [])).toEqual({ mode: 'chain' })
  })

  it('o valor do seletor vai e volta sem perder a escolha', () => {
    for (const selection of [
      { mode: 'system' as const },
      { mode: 'chain' as const },
      { mode: 'pinned' as const, accountId: 'claude-max' },
    ]) {
      expect(chatAccountFromValue(chatAccountToValue(selection))).toEqual(selection)
    }
    expect(chatAccountToValue({ mode: 'chain' })).toBe(CHAT_CHAIN_VALUE)
  })

  it('o transporte não muda o provedor da conta', () => {
    expect(['claude', 'codex', 'codex-app-server', 'gemini-acp', 'openia', null].map(chatProviderForCliType)).toEqual([
      'claude',
      'codex',
      'codex',
      'gemini',
      null,
      null,
    ])
  })
})
