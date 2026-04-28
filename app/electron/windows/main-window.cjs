const { BrowserWindow } = require('electron')
const { rendererBuildPath } = require('../core/paths.cjs')
const { mainWindowOptions } = require('../core/window-options.cjs')
const { denyExternalWindowOpen } = require('../services/external-links.cjs')

function createMainWindow() {
  const mainWindow = new BrowserWindow(mainWindowOptions)

  mainWindow.webContents.setWindowOpenHandler(denyExternalWindowOpen)

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
