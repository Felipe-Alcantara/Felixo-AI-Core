const { ipcMain, dialog } = require('electron')
const fs = require('fs')
const path = require('path')

function registerProjectsIpcHandlers(getMainWindow) {
  ipcMain.handle('projects:pick-folder', async () => {
    const mainWindow = typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('projects:detect-repos', (_event, folderPath) => {
    if (!folderPath || typeof folderPath !== 'string') return []
    try {
      const entries = fs.readdirSync(folderPath, { withFileTypes: true })
      return entries
        .filter((e) => e.isDirectory() && hasGit(path.join(folderPath, e.name)))
        .map((e) => ({ name: e.name, path: path.join(folderPath, e.name) }))
    } catch {
      return []
    }
  })
}

function hasGit(dirPath) {
  try {
    return fs.existsSync(path.join(dirPath, '.git'))
  } catch {
    return false
  }
}

module.exports = { registerProjectsIpcHandlers }
