const { BrowserWindow, dialog, ipcMain } = require('electron')
const fs = require('fs/promises')
const path = require('path')

/**
 * @param {Function|object} getMainWindow
 * @param {{ saveDialog?: Pick<import('electron').Dialog, 'showSaveDialog'> }} [options] - só a automação troca o diálogo nativo
 */
function registerFileExportIpcHandlers(getMainWindow, { saveDialog = dialog } = {}) {
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
      ? await saveDialog.showSaveDialog(win, dialogOptions)
      : await saveDialog.showSaveDialog(dialogOptions)

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

  // Vários arquivos de texto numa pasta que a pessoa escolhe (um .md por prompt).
  ipcMain.handle('files:save-text-folder', async (_event, params) => {
    const files = normalizeFolderFiles(params?.files)
    if (!files) {
      return { ok: false, message: 'Arquivos invalidos para exportacao.' }
    }

    const win =
      BrowserWindow.getFocusedWindow() ??
      (typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow)
    const dialogOptions = {
      title: 'Escolha a pasta para salvar os arquivos',
      properties: ['openDirectory', 'createDirectory'],
    }
    const result = win && !win.isDestroyed()
      ? await dialog.showOpenDialog(win, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    if (result.canceled || !result.filePaths?.[0]) {
      return { ok: false, canceled: true }
    }

    try {
      return await writeTextFilesToFolder(result.filePaths[0], files)
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : 'Falha ao salvar arquivos exportados.',
      }
    }
  })
}

function normalizeFolderFiles(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return null
  }

  const files = value.map((file) =>
    typeof file?.name === 'string' && typeof file?.content === 'string'
      ? { name: file.name, content: file.content }
      : null,
  )

  return files.every(Boolean) ? files : null
}

// Nunca sobrescreve: se o nome ja existe na pasta, grava `nome-2.ext`, `nome-3.ext`...
// O nome vem do renderer, entao so o ultimo trecho conta (sem `..` nem separador).
async function writeTextFilesToFolder(folderPath, files) {
  const saved = []

  for (const file of files) {
    const baseName = path
      .basename(file.name.replace(/\\/g, '/'))
      .replace(/[<>:"|?*\u0000-\u001f]/g, '-')
      .replace(/^\.+/, '')
      .trim() || 'felixo-export.md'
    const extension = path.extname(baseName)
    const stem = baseName.slice(0, baseName.length - extension.length)

    for (let attempt = 1; ; attempt += 1) {
      const fileName = attempt === 1 ? baseName : `${stem}-${attempt}${extension}`
      try {
        await fs.writeFile(path.join(folderPath, fileName), file.content, {
          encoding: 'utf8',
          flag: 'wx',
        })
        saved.push(fileName)
        break
      } catch (error) {
        if (error?.code !== 'EEXIST') {
          throw error
        }
      }
    }
  }

  return { ok: true, folderPath, fileNames: saved }
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
  writeTextFilesToFolder,
}
