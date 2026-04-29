const { BrowserWindow } = require('electron')
const { rendererBuildPath } = require('../core/paths.cjs')
const { mainWindowOptions } = require('../core/window-options.cjs')
const { denyExternalWindowOpen } = require('../services/external-links.cjs')
const { registerWindowZoomShortcuts } = require('../services/window-zoom-shortcuts.cjs')

function createMainWindow() {
  const mainWindow = new BrowserWindow(mainWindowOptions)

  mainWindow.webContents.setWindowOpenHandler(denyExternalWindowOpen)
  registerWindowZoomShortcuts(mainWindow)

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    return mainWindow
  }

  mainWindow.loadFile(rendererBuildPath)
  return mainWindow
}

module.exports = {
  createMainWindow,
}
