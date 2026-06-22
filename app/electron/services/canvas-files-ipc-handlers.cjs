/**
 * @module canvas-files-ipc-handlers
 * Shared markdown files for canvas file-blocks.
 *
 * Canvas "file" nodes render a .md file living in the app's `canvas-files`
 * directory; agents running in terminals can edit those files (given their
 * absolute path) so multiple agents coordinate through them. A file watcher
 * pushes `canvas-file:changed` so the block re-renders live.
 *
 * Filenames coming from the renderer are sanitized and confined to the
 * canvas-files directory — no path traversal, no absolute paths.
 */

const { ipcMain } = require('electron')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

function registerCanvasFilesIpcHandlers(getMainWindow, appPaths) {
  const baseDir = appPaths.canvasFiles
  const watchers = new Map()

  const send = (channel, payload) => {
    const window = getMainWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }

  ipcMain.handle('canvas-file:list', async () => {
    try {
      const entries = await fsp.readdir(baseDir, { withFileTypes: true })
      const files = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => entry.name)
        .sort()
      return { ok: true, files }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel listar os arquivos.')
    }
  })

  ipcMain.handle('canvas-file:read', async (_event, params = {}) => {
    try {
      const filePath = resolveSafePath(baseDir, params.name)
      const content = await fsp.readFile(filePath, 'utf8')
      return { ok: true, name: path.basename(filePath), content }
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return { ok: true, name: params.name, content: '' }
      }
      return toErrorResult(error, 'Nao foi possivel ler o arquivo.')
    }
  })

  ipcMain.handle('canvas-file:write', async (_event, params = {}) => {
    try {
      const filePath = resolveSafePath(baseDir, params.name)
      await fsp.mkdir(path.dirname(filePath), { recursive: true })
      await fsp.writeFile(filePath, String(params.content ?? ''), 'utf8')
      return { ok: true, name: path.basename(filePath) }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel salvar o arquivo.')
    }
  })

  // Returns the absolute path so an agent can be told which file to edit.
  ipcMain.handle('canvas-file:resolve', (_event, params = {}) => {
    try {
      const filePath = resolveSafePath(baseDir, params.name)
      return { ok: true, name: path.basename(filePath), path: filePath }
    } catch (error) {
      return toErrorResult(error, 'Caminho de arquivo invalido.')
    }
  })

  // Start watching a file; pushes canvas-file:changed when it changes on disk.
  ipcMain.handle('canvas-file:watch', (_event, params = {}) => {
    try {
      const filePath = resolveSafePath(baseDir, params.name)
      const key = filePath

      if (!watchers.has(key)) {
        // watchFile polls (works reliably across editors/agents writing).
        const listener = () => send('canvas-file:changed', { name: path.basename(filePath) })
        fs.watchFile(filePath, { interval: 500 }, listener)
        watchers.set(key, listener)
      }

      return { ok: true }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel observar o arquivo.')
    }
  })

  ipcMain.handle('canvas-file:unwatch', (_event, params = {}) => {
    try {
      const filePath = resolveSafePath(baseDir, params.name)
      if (watchers.has(filePath)) {
        fs.unwatchFile(filePath)
        watchers.delete(filePath)
      }
      return { ok: true }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel parar de observar o arquivo.')
    }
  })

  const dispose = () => {
    for (const filePath of watchers.keys()) {
      fs.unwatchFile(filePath)
    }
    watchers.clear()
  }

  return { dispose }
}

/**
 * Confines a renderer-supplied name to the canvas-files dir. Strips any path
 * components, enforces a .md extension, and verifies the resolved path stays
 * inside baseDir.
 *
 * @param {string} baseDir
 * @param {unknown} rawName
 * @returns {string} absolute, safe file path
 */
function resolveSafePath(baseDir, rawName) {
  if (typeof rawName !== 'string' || rawName.trim() === '') {
    throw new Error('Nome de arquivo invalido.')
  }

  // Keep only the final segment; drop any directory parts a caller may inject.
  let name = path.basename(rawName.trim())
  if (!name.endsWith('.md')) {
    name = `${name}.md`
  }

  const resolved = path.resolve(baseDir, name)
  const normalizedBase = path.resolve(baseDir)
  if (resolved !== path.join(normalizedBase, name)) {
    throw new Error('Caminho de arquivo fora do diretorio permitido.')
  }

  return resolved
}

function toErrorResult(error, fallbackMessage) {
  return {
    ok: false,
    message: error instanceof Error ? error.message : fallbackMessage,
  }
}

module.exports = {
  registerCanvasFilesIpcHandlers,
  resolveSafePath,
}
