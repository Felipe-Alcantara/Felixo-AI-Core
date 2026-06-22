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
/** Settings key for the bootstrap instruction (empty .md in a repo). */
const FILE_BOOTSTRAP_PROMPT_KEY = 'canvas.file-bootstrap-prompt'
/** Settings for the standing "follow the quality standard" instruction. */
const QUALITY_STANDARD_PROMPT_KEY = 'canvas.quality-standard-prompt'
const QUALITY_STANDARD_ENABLED_KEY = 'canvas.quality-standard-enabled'

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

  ipcMain.handle('canvas:get-file-bootstrap-prompt', () => {
    try {
      const value = settings.get(FILE_BOOTSTRAP_PROMPT_KEY)
      return { ok: true, prompt: typeof value === 'string' ? value : null }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel carregar o prompt.')
    }
  })

  ipcMain.handle('canvas:set-file-bootstrap-prompt', (_event, prompt) => {
    try {
      settings.set(FILE_BOOTSTRAP_PROMPT_KEY, String(prompt ?? ''))
      return { ok: true }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel salvar o prompt.')
    }
  })

  ipcMain.handle('canvas:get-quality-standard', () => {
    try {
      const prompt = settings.get(QUALITY_STANDARD_PROMPT_KEY)
      const enabled = settings.get(QUALITY_STANDARD_ENABLED_KEY)
      return {
        ok: true,
        prompt: typeof prompt === 'string' ? prompt : null,
        // Default ON when never set.
        enabled: enabled === null || enabled === undefined ? true : enabled === true,
      }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel carregar a configuracao.')
    }
  })

  ipcMain.handle('canvas:set-quality-standard', (_event, params = {}) => {
    try {
      if (typeof params.prompt === 'string') {
        settings.set(QUALITY_STANDARD_PROMPT_KEY, params.prompt)
      }
      if (typeof params.enabled === 'boolean') {
        settings.set(QUALITY_STANDARD_ENABLED_KEY, params.enabled)
      }
      return { ok: true }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel salvar a configuracao.')
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
