const { ipcMain } = require('electron')
const {
  createChatHistoryRepository,
} = require('./storage/chat-history-repository.cjs')

function registerChatHistoryIpcHandlers(options = {}) {
  const repository = createChatHistoryRepository(options.database)

  ipcMain.handle('chats:list', (_event, params = {}) => {
    try {
      return {
        ok: true,
        sessions: repository.list({
          limit: params?.limit,
        }),
      }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel carregar o historico de chats.')
    }
  })

  ipcMain.handle('chats:get', (_event, chatId) => {
    try {
      return {
        ok: true,
        session: repository.get(chatId),
      }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel carregar o chat.')
    }
  })

  ipcMain.handle('chats:save', (_event, session) => {
    try {
      return {
        ok: true,
        session: repository.save(session),
      }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel salvar o chat.')
    }
  })

  ipcMain.handle('chats:delete', (_event, chatId) => {
    try {
      return {
        ok: true,
        deleted: repository.delete(chatId),
      }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel remover o chat.')
    }
  })
}

function toErrorResult(error, fallbackMessage) {
  return {
    ok: false,
    message: error instanceof Error ? error.message : fallbackMessage,
  }
}

module.exports = {
  registerChatHistoryIpcHandlers,
}
