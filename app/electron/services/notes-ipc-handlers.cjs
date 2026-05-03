const { ipcMain } = require('electron')
const {
  createNotesRepository,
} = require('./storage/notes-repository.cjs')

function registerNotesIpcHandlers(options = {}) {
  const repository = createNotesRepository(options.database)

  ipcMain.handle('notes:list', () => {
    try {
      return {
        ok: true,
        notes: repository.list(),
      }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel carregar as notas.')
    }
  })

  ipcMain.handle('notes:save', (_event, note) => {
    try {
      return {
        ok: true,
        note: repository.save(note),
      }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel salvar a nota.')
    }
  })

  ipcMain.handle('notes:delete', (_event, noteId) => {
    try {
      return {
        ok: true,
        deleted: repository.delete(noteId),
      }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel excluir a nota.')
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
  registerNotesIpcHandlers,
}
