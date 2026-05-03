const { app, BrowserWindow } = require('electron')
const { createMainWindow } = require('./windows/main-window.cjs')
const { registerCliIpcHandlers } = require('./services/ipc-handlers.cjs')
const { registerFileExportIpcHandlers } = require('./services/file-export-ipc-handlers.cjs')
const { registerQaLoggerIpcHandlers, logQaEvent } = require('./services/qa-logger.cjs')
const { registerProjectsIpcHandlers } = require('./services/projects-ipc-handlers.cjs')
const { registerGitIpcHandlers } = require('./services/git-ipc-handlers.cjs')
const { registerAutoUpdateHandlers } = require('./services/auto-updater.cjs')
const { initAppPaths } = require('./core/app-paths.cjs')
const { detectAllClis, formatDetectionSummary } = require('./core/cli-detector.cjs')

let mainWindow = null

app.whenReady().then(() => {
  const appPaths = initAppPaths()

  mainWindow = createMainWindow()
  const getMainWindow = () => mainWindow ?? BrowserWindow.getAllWindows()[0]

  registerQaLoggerIpcHandlers(getMainWindow)
  registerCliIpcHandlers(getMainWindow)
  registerFileExportIpcHandlers(getMainWindow)
  registerProjectsIpcHandlers(getMainWindow)
  registerGitIpcHandlers()
  registerAutoUpdateHandlers(getMainWindow)

  detectAllClis().then((results) => {
    logQaEvent({
      level: 'info',
      scope: 'app:startup',
      message: 'CLI detection completed.',
      details: {
        summary: formatDetectionSummary(results),
        detected: results.filter((r) => r.detected).map((r) => r.name),
        missing: results.filter((r) => !r.detected).map((r) => r.name),
        userData: appPaths.userData,
        isPackaged: appPaths.isPackaged,
        platform: appPaths.platform,
      },
    })
  })

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
