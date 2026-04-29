const { app, BrowserWindow } = require('electron')
const { createMainWindow } = require('./windows/main-window.cjs')
const { registerCliIpcHandlers } = require('./services/ipc-handlers.cjs')

let mainWindow = null

app.whenReady().then(() => {
  mainWindow = createMainWindow()
  registerCliIpcHandlers(() => mainWindow ?? BrowserWindow.getAllWindows()[0])

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
