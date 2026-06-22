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

  ipcMain.handle('canvas:list-edges', () => {
    try {
      return { ok: true, edges: repository.listEdges() }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel carregar as conexoes.')
    }
  })

  ipcMain.handle('canvas:save-edge', (_event, edge) => {
    try {
      return { ok: true, edge: repository.saveEdge(edge) }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel salvar a conexao.')
    }
  })

  ipcMain.handle('canvas:delete-edge', (_event, edgeId) => {
    try {
      return { ok: true, deleted: repository.deleteEdge(edgeId) }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel excluir a conexao.')
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
