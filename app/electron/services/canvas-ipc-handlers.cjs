/**
 * @module canvas-ipc-handlers
 * IPC bridge for canvas node persistence.
 *
 * Follows the project's `register*IpcHandlers` + repository convention. The
 * renderer owns the live canvas state; these handlers just persist node
 * type/position/size/data so the layout survives across sessions.
 */

const { ipcMain } = require('electron')
const {
  createCanvasRepository,
} = require('./storage/canvas-repository.cjs')

function registerCanvasIpcHandlers(options = {}) {
  const repository = createCanvasRepository(options.database)

  ipcMain.handle('canvas:list', () => {
    try {
      return { ok: true, nodes: repository.list() }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel carregar o canvas.')
    }
  })

  ipcMain.handle('canvas:save', (_event, node) => {
    try {
      return { ok: true, node: repository.save(node) }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel salvar o no do canvas.')
    }
  })

  ipcMain.handle('canvas:delete', (_event, nodeId) => {
    try {
      return { ok: true, deleted: repository.delete(nodeId) }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel excluir o no do canvas.')
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
  registerCanvasIpcHandlers,
}
