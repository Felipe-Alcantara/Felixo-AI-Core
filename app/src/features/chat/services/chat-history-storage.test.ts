import { afterEach, describe, expect, it, vi } from 'vitest'

import { deleteChatSessionFromBackend } from './chat-history-storage'

function installChatsBridge(deleteChat: (chatId: string) => Promise<unknown>) {
  vi.stubGlobal('window', { felixo: { chats: { delete: deleteChat } } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('deleteChatSessionFromBackend', () => {
  it('pede ao backend para arquivar a conversa pelo id', async () => {
    const deleteChat = vi.fn(async () => ({ ok: true, deleted: true }))
    installChatsBridge(deleteChat)

    await expect(deleteChatSessionFromBackend('chat-1')).resolves.toEqual({
      status: 'archived',
    })
    expect(deleteChat).toHaveBeenCalledWith('chat-1')
  })

  it('trata conversa que o backend já não lista como excluída', async () => {
    // `deleted: false` com `ok: true` quer dizer que não havia o que arquivar:
    // outra janela já arquivou, ou a conversa nunca chegou a ser salva.
    installChatsBridge(async () => ({ ok: true, deleted: false }))

    await expect(deleteChatSessionFromBackend('chat-1')).resolves.toEqual({
      status: 'archived',
    })
  })

  it('devolve o motivo quando o backend recusa', async () => {
    installChatsBridge(async () => ({ ok: false, message: 'Banco somente leitura.' }))

    await expect(deleteChatSessionFromBackend('chat-1')).resolves.toEqual({
      status: 'failed',
      message: 'Banco somente leitura.',
    })
  })

  it('usa uma mensagem padrão quando o backend recusa sem motivo', async () => {
    installChatsBridge(async () => ({ ok: false }))

    await expect(deleteChatSessionFromBackend('chat-1')).resolves.toEqual({
      status: 'failed',
      message: 'Não foi possível excluir a conversa.',
    })
  })

  it('não deixa a falha da ponte IPC escapar como exceção', async () => {
    installChatsBridge(async () => {
      throw new Error('IPC fechado.')
    })

    await expect(deleteChatSessionFromBackend('chat-1')).resolves.toEqual({
      status: 'failed',
      message: 'IPC fechado.',
    })
  })

  it('sem backend (modo web) a exclusão é só local', async () => {
    vi.stubGlobal('window', {})

    await expect(deleteChatSessionFromBackend('chat-1')).resolves.toEqual({
      status: 'local-only',
    })
  })
})
