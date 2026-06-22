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
const {
  createSettingsRepository,
} = require('./storage/settings-repository.cjs')

/** Settings key for the instruction injected when a file links to a terminal. */
const FILE_LINK_PROMPT_KEY = 'canvas.file-link-prompt'

function registerCanvasIpcHandlers(options = {}) {
  const repository = createCanvasRepository(options.database)
  const settings = createSettingsRepository(options.database)

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

  ipcMain.handle('canvas:get-file-link-prompt', () => {
    try {
      const value = settings.get(FILE_LINK_PROMPT_KEY)
      return { ok: true, prompt: typeof value === 'string' ? value : null }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel carregar o prompt.')
    }
  })

  ipcMain.handle('canvas:set-file-link-prompt', (_event, prompt) => {
    try {
      settings.set(FILE_LINK_PROMPT_KEY, String(prompt ?? ''))
      return { ok: true }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel salvar o prompt.')
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
