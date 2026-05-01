const { BrowserWindow, dialog, ipcMain } = require('electron')
const fs = require('fs/promises')

function registerFileExportIpcHandlers(getMainWindow) {
  ipcMain.handle('files:save-text', async (_event, params) => {
    const content = typeof params?.content === 'string' ? params.content : null
    const defaultPath =
      typeof params?.defaultPath === 'string' && params.defaultPath.trim()
        ? params.defaultPath.trim()
        : 'felixo-export.txt'
    const filters = normalizeFilters(params?.filters)

    if (content === null) {
      return { ok: false, message: 'Conteudo invalido para exportacao.' }
    }

    const win =
      BrowserWindow.getFocusedWindow() ??
      (typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow)
    const dialogOptions = {
      defaultPath,
      filters,
    }
    const result = win && !win.isDestroyed()
      ? await dialog.showSaveDialog(win, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions)

    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true }
    }

    try {
      await fs.writeFile(result.filePath, content, 'utf8')

      return { ok: true, filePath: result.filePath }
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : 'Falha ao salvar arquivo exportado.',
      }
    }
  })
}

function normalizeFilters(value) {
  if (!Array.isArray(value)) {
    return [{ name: 'Texto', extensions: ['txt'] }]
  }

  const filters = value
    .map((filter) => {
      const name =
        typeof filter?.name === 'string' && filter.name.trim()
          ? filter.name.trim()
          : null
      const extensions = Array.isArray(filter?.extensions)
        ? filter.extensions
            .filter((extension) => typeof extension === 'string')
            .map((extension) => extension.trim().replace(/^\./, ''))
            .filter(Boolean)
        : []

      if (!name || extensions.length === 0) {
        return null
      }

      return { name, extensions }
    })
    .filter(Boolean)

  return filters.length > 0 ? filters : [{ name: 'Texto', extensions: ['txt'] }]
}

module.exports = {
  registerFileExportIpcHandlers,
}
