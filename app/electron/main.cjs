const { app, BrowserWindow } = require('electron')
const { createMainWindow } = require('./windows/main-window.cjs')
const { registerCliIpcHandlers } = require('./services/ipc-handlers.cjs')
const { registerFileExportIpcHandlers } = require('./services/file-export-ipc-handlers.cjs')
const { registerQaLoggerIpcHandlers } = require('./services/qa-logger.cjs')
const { registerProjectsIpcHandlers } = require('./services/projects-ipc-handlers.cjs')
const { registerGitIpcHandlers } = require('./services/git-ipc-handlers.cjs')

let mainWindow = null

app.whenReady().then(() => {
  mainWindow = createMainWindow()
  const getMainWindow = () => mainWindow ?? BrowserWindow.getAllWindows()[0]

  registerQaLoggerIpcHandlers(getMainWindow)
  registerCliIpcHandlers(getMainWindow)
  registerFileExportIpcHandlers(getMainWindow)
  registerProjectsIpcHandlers(getMainWindow)
  registerGitIpcHandlers()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
