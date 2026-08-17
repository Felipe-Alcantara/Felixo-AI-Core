const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const { createMainWindow } = require('./windows/main-window.cjs')
const { registerCliIpcHandlers } = require('./services/ipc-handlers.cjs')
const {
  registerOfficialCliAccountIpcHandlers,
} = require('./services/official-cli-account-ipc-handlers.cjs')
const { registerPtyIpcHandlers } = require('./services/pty-ipc-handlers.cjs')
const {
  registerFileAttachmentIpcHandlers,
} = require('./services/file-attachments-ipc-handlers.cjs')
const { registerFileExportIpcHandlers } = require('./services/file-export-ipc-handlers.cjs')
const { registerQaLoggerIpcHandlers, logQaEvent } = require('./services/qa-logger.cjs')
const { registerProjectsIpcHandlers } = require('./services/projects-ipc-handlers.cjs')
const { registerNotesIpcHandlers } = require('./services/notes-ipc-handlers.cjs')
const { registerCanvasIpcHandlers } = require('./services/canvas-ipc-handlers.cjs')
const {
  getBundledSkillsDir,
  installBuiltinSkills,
} = require('./services/skills/skills-library.cjs')
const {
  registerCanvasFilesIpcHandlers,
} = require('./services/canvas-files-ipc-handlers.cjs')
const {
  registerTextFileIpcHandlers,
} = require('./services/text-file-ipc-handlers.cjs')
const {
  registerAutomationsIpcHandlers,
} = require('./services/automations-ipc-handlers.cjs')
const {
  registerModelsIpcHandlers,
} = require('./services/models-ipc-handlers.cjs')
const {
  registerAgentModelsIpcHandlers,
} = require('./services/agent-models-ipc-handlers.cjs')
const {
  registerSystemDesignIpcHandlers,
} = require('./services/system-design-ipc-handlers.cjs')
const { registerChatHistoryIpcHandlers } = require('./services/chat-history-ipc-handlers.cjs')
const { registerGitIpcHandlers } = require('./services/git-ipc-handlers.cjs')
const {
  registerFetchAllIpcHandlers,
} = require('./services/fetch-all-ipc-handlers.cjs')
const { registerAutoUpdateHandlers } = require('./services/auto-updater.cjs')
const {
  registerCliAutoInstallHandlers,
} = require('./services/cli-auto-install.cjs')
const {
  registerOrchestratorSettingsIpcHandlers,
} = require('./services/orchestrator-settings-ipc-handlers.cjs')
const { createCliEnv } = require('./services/cli-process-manager.cjs')
const { createStorageDatabase } = require('./services/storage/sqlite-database.cjs')
const { initAppPaths } = require('./core/app-paths.cjs')
const { detectAllClis, formatDetectionSummary } = require('./core/cli-detector.cjs')
const platform = require('./core/platform/index.cjs')

let mainWindow = null
let ptyHandlers = null
let canvasFilesHandlers = null
let textFileHandlers = null
let storageDatabase = null
let cliAutoInstall = null

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
  registerOfficialCliAccountIpcHandlers()
  ptyHandlers = registerPtyIpcHandlers(getMainWindow)
  registerFileAttachmentIpcHandlers(appPaths)
  registerFileExportIpcHandlers(getMainWindow)
  const projectsHandlers = registerProjectsIpcHandlers(getMainWindow, {
    database: storageDatabase,
  })
  registerNotesIpcHandlers({ database: storageDatabase })
  canvasFilesHandlers = registerCanvasFilesIpcHandlers(getMainWindow, appPaths)
  textFileHandlers = registerTextFileIpcHandlers(getMainWindow, {
    listProjectRoots: projectsHandlers.listProjectRoots,
  })
  // A biblioteca de skills e materializada a cada inicio: instala o que falta,
  // atualiza o que a pessoa nao editou e preserva o que ela editou.
  try {
    installBuiltinSkills({
      bundledDir: getBundledSkillsDir({ isPackaged: app.isPackaged }),
      targetDir: appPaths.skills,
    })
  } catch (error) {
    console.error('[felixo] nao foi possivel instalar as skills:', error)
  }

  registerCanvasIpcHandlers({
    database: storageDatabase,
    skillsDir: appPaths.skills,
    clearFiles: () => canvasFilesHandlers.clear(),
    exportFiles: () => canvasFilesHandlers.exportFiles(),
    replaceFiles: (files) => canvasFilesHandlers.replaceFiles(files),
    // Limpar o canvas apaga os blocos que carregavam as permissoes de arquivo;
    // manter as concessoes vivas depois disso seria guardar acesso sem dono.
    revokeTextFiles: () => textFileHandlers?.revokeAll(),
  })
  registerAutomationsIpcHandlers({ database: storageDatabase })
  registerModelsIpcHandlers({ database: storageDatabase })
  registerAgentModelsIpcHandlers(appPaths)
  registerSystemDesignIpcHandlers(appPaths, { database: storageDatabase })
  registerChatHistoryIpcHandlers({ database: storageDatabase })
  registerGitIpcHandlers()
  registerFetchAllIpcHandlers(getMainWindow, appPaths)
  registerAutoUpdateHandlers(getMainWindow)
  cliAutoInstall = registerCliAutoInstallHandlers(getMainWindow, {
    appPaths,
    appVersion: app.getVersion(),
    isPackaged: app.isPackaged,
  })
  registerOrchestratorSettingsIpcHandlers(appPaths, { database: storageDatabase })

  // Expõe a versão empacotada (definida pelo CI no release, não no
  // package.json versionado) para a interface conseguir mostrá-la.
  ipcMain.handle('app:get-version', () => app.getVersion())

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
  if (cliAutoInstall) {
    try {
      cliAutoInstall.stop()
    } catch {
      // Best effort during app shutdown.
    }
    cliAutoInstall = null
  }

  if (ptyHandlers) {
    try {
      ptyHandlers.dispose()
    } catch {
      // Best effort during app shutdown.
    }
    ptyHandlers = null
  }

  if (canvasFilesHandlers) {
    try {
      canvasFilesHandlers.dispose()
    } catch {
      // Best effort during app shutdown.
    }
    canvasFilesHandlers = null
  }

  if (textFileHandlers) {
    try {
      textFileHandlers.dispose()
    } catch {
      // Best effort during app shutdown.
    }
    textFileHandlers = null
  }

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
