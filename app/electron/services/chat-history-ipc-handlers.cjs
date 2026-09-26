const { toErrorResult } = require('./ipc-result.cjs')
const {
  createChatHistoryRepository,
} = require('./storage/chat-history-repository.cjs')

/**
 * O renderer carrega as sessões inteiras por `chats:list`; não há leitura
 * avulsa de um chat pela ponte de IPC.
 *
 * @param {object} [options]
 * @param {object} options.database - Conexão SQLite do armazenamento.
 * @param {object} [options.ipcMain] - Injetável para testes.
 */
function registerChatHistoryIpcHandlers(options = {}) {
  const { ipcMain = require('electron').ipcMain } = options
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

module.exports = {
  registerChatHistoryIpcHandlers,
}
