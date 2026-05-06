const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const { createMainWindow } = require('./windows/main-window.cjs')
const { registerCliIpcHandlers } = require('./services/ipc-handlers.cjs')
const {
  registerFileAttachmentIpcHandlers,
} = require('./services/file-attachments-ipc-handlers.cjs')
const { registerFileExportIpcHandlers } = require('./services/file-export-ipc-handlers.cjs')
const { registerQaLoggerIpcHandlers, logQaEvent } = require('./services/qa-logger.cjs')
const { registerProjectsIpcHandlers } = require('./services/projects-ipc-handlers.cjs')
const { registerNotesIpcHandlers } = require('./services/notes-ipc-handlers.cjs')
const { registerChatHistoryIpcHandlers } = require('./services/chat-history-ipc-handlers.cjs')
const { registerGitIpcHandlers } = require('./services/git-ipc-handlers.cjs')
const { registerAutoUpdateHandlers } = require('./services/auto-updater.cjs')
const {
  registerOrchestratorSettingsIpcHandlers,
} = require('./services/orchestrator-settings-ipc-handlers.cjs')
const { createCliEnv } = require('./services/cli-process-manager.cjs')
const { createStorageDatabase } = require('./services/storage/sqlite-database.cjs')
const { initAppPaths } = require('./core/app-paths.cjs')
const { detectAllClis, formatDetectionSummary } = require('./core/cli-detector.cjs')
const platform = require('./core/platform/index.cjs')

let mainWindow = null
let storageDatabase = null

const SUPPORTED_EXTENSIONS = new Set(['.fxai', '.fxchat', '.fxworkflow'])
let pendingFilePath = null

function handleFileOpen(filePath) {
  if (!filePath || typeof filePath !== 'string') return
  const ext = path.extname(filePath).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.has(ext)) return

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('file:opened', { filePath, ext })
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  } else {
    pendingFilePath = filePath
  }
}

// macOS: file opened via Finder or drag-and-drop
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  handleFileOpen(filePath)
})

// Windows/Linux: file path passed as CLI argument
const cliArg = process.argv.find((arg) => SUPPORTED_EXTENSIONS.has(path.extname(arg).toLowerCase()))
if (cliArg) pendingFilePath = cliArg

app.whenReady().then(() => {
  const appPaths = initAppPaths()
  storageDatabase = createStorageDatabase({
    databaseDir: appPaths.database,
  })

  mainWindow = createMainWindow()
  const getMainWindow = () => mainWindow ?? BrowserWindow.getAllWindows()[0]

  registerQaLoggerIpcHandlers(getMainWindow)
  registerCliIpcHandlers(getMainWindow)
  registerFileAttachmentIpcHandlers(appPaths)
  registerFileExportIpcHandlers(getMainWindow)
  registerProjectsIpcHandlers(getMainWindow, { database: storageDatabase })
  registerNotesIpcHandlers({ database: storageDatabase })
  registerChatHistoryIpcHandlers({ database: storageDatabase })
  registerGitIpcHandlers()
  registerAutoUpdateHandlers(getMainWindow)
  registerOrchestratorSettingsIpcHandlers(appPaths, { database: storageDatabase })

  ipcMain.handle('file:get-pending', () => {
    const filePath = pendingFilePath
    pendingFilePath = null
    if (!filePath) return null
    return { filePath, ext: path.extname(filePath).toLowerCase() }
  })

  mainWindow.webContents.once('did-finish-load', () => {
    if (pendingFilePath) {
      handleFileOpen(pendingFilePath)
      pendingFilePath = null
    }
  })

  detectAllClis(createCliEnv()).then((results) => {
    logQaEvent({
      level: 'info',
      scope: 'app:startup',
      message: 'CLI detection completed.',
      details: {
        summary: formatDetectionSummary(results),
        detected: results.filter((r) => r.detected).map((r) => r.name),
        missing: results.filter((r) => !r.detected).map((r) => r.name),
        userData: appPaths.userData,
        database: storageDatabase.path,
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

app.on('before-quit', () => {
  const databaseToClose = storageDatabase
  storageDatabase = null

  if (databaseToClose) {
    try {
      databaseToClose.close()
    } catch {
      // Best effort during app shutdown.
    }
  }
})

app.on('window-all-closed', () => {
  if (platform.name !== 'darwin') {
    app.quit()
  }
})
