const { app, BrowserWindow, Menu, ipcMain, safeStorage } = require('electron')
const path = require('node:path')
const vm = require('node:vm')
const { createMainWindow } = require('./windows/main-window.cjs')
const { instalarMenuDoApp } = require('./windows/app-menu.cjs')
const { registerCliIpcHandlers } = require('./services/ipc-handlers.cjs')
const {
  registerOfficialCliAccountIpcHandlers,
} = require('./services/official-cli-account-ipc-handlers.cjs')
const { registerPtyIpcHandlers } = require('./services/pty-ipc-handlers.cjs')
const { PtyProcessManager } = require('./services/pty-process-manager.cjs')
const { createCliAccountStore } = require('./services/cli-account-store.cjs')
const {
  registerCliAccountIpcHandlers,
} = require('./services/cli-account-ipc-handlers.cjs')
const { registerOpeniaIpcHandlers } = require('./services/openia-service.cjs')
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
  registerContextFilesIpcHandlers,
} = require('./services/context-files-ipc-handlers.cjs')
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
const {
  instalarComandoDoAgente: installAgentCommand,
} = require('./services/agent-command-install.cjs')
const { registerAutoUpdateHandlers } = require('./services/auto-updater.cjs')
const {
  registerCliAutoInstallHandlers,
} = require('./services/cli-auto-install.cjs')
const {
  registerOrchestratorSettingsIpcHandlers,
} = require('./services/orchestrator-settings-ipc-handlers.cjs')
const { createAgentUsageService } = require('./services/agent-usage-service.cjs')
const { queryClaudeUsage } = require('./services/claude-usage-query.cjs')
const {
  registerAgentUsageIpcHandlers,
} = require('./services/agent-usage-ipc-handlers.cjs')
const { createCliEnv } = require('./services/cli-process-manager.cjs')
const { createStorageDatabase } = require('./services/storage/sqlite-database.cjs')
const { createSettingsRepository } = require('./services/storage/settings-repository.cjs')
const { createTerminalLogStore } = require('./services/terminal-log-store.cjs')
const { initAppPaths, resolveDevUserDataOverride } = require('./core/app-paths.cjs')
const { shouldQuitWhenAllWindowsClosed } = require('./core/app-lifecycle.cjs')
const { isReleaseSmokeProcess } = require('./core/release-smoke-mode.cjs')
const { detectAllClis, formatDetectionSummary } = require('./core/cli-detector.cjs')
const platform = require('./core/platform/index.cjs')
const { runPackagedReleaseSmoke } = require('./release-smoke.cjs')

let mainWindow = null
let ptyHandlers = null
let canvasFilesHandlers = null
let contextFilesHandlers = null
let textFileHandlers = null
let storageDatabase = null
let settingsRepository = null
let terminalLogStore = null
let cliAutoInstall = null
let agentUsageWatching = null

const SUPPORTED_EXTENSIONS = new Set(['.fxai', '.fxchat', '.fxworkflow'])
let pendingFilePath = null
// Em apps empacotados no Windows, switches desconhecidos podem ser consumidos
// pelo bootstrap do Chromium e não chegar a `process.argv`. O runner mantém o
// argumento para compatibilidade e usa esta flag de ambiente como sinal
// autoritativo, antes de qualquer acesso ao perfil normal da pessoa.
const isReleaseSmoke = isReleaseSmokeProcess()
const devtoolsPort = Number.parseInt(process.env.FELIXO_DEVTOOLS_PORT ?? '', 10)

// O Chromium só aceita a porta de depuração antes de ficar pronto. A flag é
// exclusiva da instância que o `felixo devtools` criou; o app normal não abre
// nenhuma porta adicional.
if (Number.isInteger(devtoolsPort) && devtoolsPort > 0 && devtoolsPort <= 65535) {
  app.commandLine.appendSwitch('remote-debugging-port', String(devtoolsPort))
  // Em alguns desktops Windows a janela oculta não chega a pintar pelo GPU e
  // `Page.captureScreenshot` fica esperando indefinidamente. Esta instância é
  // só de automação, então rasterização por software é o fallback seguro.
  app.commandLine.appendSwitch('disable-gpu')
}

if (isReleaseSmoke && process.env.FELIXO_RELEASE_SMOKE_USER_DATA) {
  app.setPath('userData', process.env.FELIXO_RELEASE_SMOKE_USER_DATA)
}

// Sem isto, `npm run dev` e o app instalado escrevem no mesmo `felixo.sqlite`
// — ver o porquê em `resolveDevUserDataOverride`.
const devUserDataOverride = resolveDevUserDataOverride({
  isPackaged: app.isPackaged,
  isReleaseSmoke,
  defaultUserData: app.getPath('userData'),
})
if (devUserDataOverride) {
  app.setPath('userData', devUserDataOverride)
}

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

app.whenReady().then(async () => {
  if (isReleaseSmoke) {
    try {
      await runPackagedReleaseSmoke({ app })
      app.exit(0)
    } catch (error) {
      console.error('[felixo] release smoke falhou:', error)
      app.exit(1)
    }
    return
  }

  const appPaths = initAppPaths()
  storageDatabase = createStorageDatabase({
    databaseDir: appPaths.database,
  })
  settingsRepository = createSettingsRepository(storageDatabase)
  terminalLogStore = createTerminalLogStore({
    directory: path.join(appPaths.logs, 'terminal-output'),
  })
  // A loja vem antes do serviço de uso: é ela que diz quais contas têm login
  // próprio, e é da pasta de cada uma que a quota é lida.
  const cliAccounts = createCliAccountStore({
    userData: appPaths.userData,
    safeStorage,
  })
  const agentUsageService = createAgentUsageService({
    database: storageDatabase,
    queryLiveUsage: queryClaudeUsage,
    listProfiles: () =>
      cliAccounts.list().map((conta) => ({
        id: conta.id,
        providerId: conta.providerId,
        label: conta.label,
        probeOptions: cliAccounts.buildProbeOptions(conta.id),
        profileEnv: cliAccounts.buildEnv(conta.id),
      })),
  })

  // Menu próprio ANTES da janela: sem ele vale o menu padrão do Electron, que
  // no macOS entrega ⌘+W para fechar a janela — atalho que ninguém escolheu e
  // que quem vem do Windows acerta sem querer, matando os terminais junto.
  instalarMenuDoApp({ Menu })

  // Função, não número: `ptyHandlers` só é criado algumas linhas abaixo. Lido
  // agora daria sempre zero, e a guarda nunca perguntaria nada.
  const contarSessoesVivas = () => ptyHandlers?.manager?.contarSessoesVivas?.() ?? 0

  mainWindow = createMainWindow({ contarSessoesVivas, settingsRepository })
  const getMainWindow = () => mainWindow ?? BrowserWindow.getAllWindows()[0]

  // CDP alcança o renderer, não o processo main. A ponte abaixo só nasce na
  // instância DevTools, que usa userData isolado e porta local aleatória. Ela
  // fornece captura nativa (que funciona mesmo quando a janela não pinta pelo
  // compositor Windows) e uma avaliação limitada, sem `require`/`process`.
  if (Number.isInteger(devtoolsPort) && devtoolsPort > 0) {
    ipcMain.handle('devtools:capture-page', async () => {
      const target = getMainWindow()
      if (!target || target.isDestroyed()) throw new Error('Janela DevTools indisponível.')
      return (await target.webContents.capturePage()).toDataURL()
    })
    ipcMain.handle('devtools:main-eval', (_event, expression) => {
      if (typeof expression !== 'string' || expression.length > 20_000) {
        throw new Error('Expressão DevTools inválida.')
      }
      return vm.runInNewContext(expression, { app, BrowserWindow, mainWindow }, { timeout: 1_000 })
    })
  }

  registerQaLoggerIpcHandlers(getMainWindow)
  registerCliIpcHandlers(getMainWindow, { terminalLogStore })
  registerOfficialCliAccountIpcHandlers({
    getPtyManager: () => ptyHandlers?.manager ?? null,
  })
  registerOpeniaIpcHandlers()
  registerCliAccountIpcHandlers({ store: cliAccounts })
  ptyHandlers = registerPtyIpcHandlers(getMainWindow, {
    validateAccount: (accountId, providerId) =>
      cliAccounts.validateAccount(accountId, providerId),
    manager: new PtyProcessManager({
      validateAccount: (accountId, providerId) =>
        cliAccounts.validateAccount(accountId, providerId),
      buildAccountEnv: (accountId, providerId) =>
        cliAccounts.buildEnv(accountId, providerId),
    }),
  })
  registerFileAttachmentIpcHandlers(appPaths, { getMainWindow })
  registerFileExportIpcHandlers(getMainWindow)
  const projectsHandlers = registerProjectsIpcHandlers(getMainWindow, {
    database: storageDatabase,
  })
  registerNotesIpcHandlers({ database: storageDatabase })
  canvasFilesHandlers = registerCanvasFilesIpcHandlers(getMainWindow, appPaths)
  contextFilesHandlers = registerContextFilesIpcHandlers(appPaths)
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

  // O comando `felixo` vive numa pasta propria que entra no PATH dos terminais
  // do canvas. E o que permite um agente qualquer usar as ferramentas do app
  // sem saber nada da nossa arquitetura: ele roda um comando e le texto.
  try {
    installAgentCommand({
      binDir: appPaths.bin,
      execPath: process.execPath,
      entrypoint: path.join(__dirname, 'cli', 'felixo.cjs'),
      userData: appPaths.userData,
    })
  } catch (error) {
    console.error('[felixo] nao foi possivel instalar o comando do agente:', error)
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
  agentUsageWatching = registerAgentUsageIpcHandlers({
    service: agentUsageService,
    getMainWindow,
  })

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
      // A janela recriada precisa da MESMA guarda: no macOS este é o caminho
      // normal de voltar ao app depois de fechar, e uma janela sem guarda
      // desfaria a proteção na segunda vez.
      mainWindow = createMainWindow({ contarSessoesVivas, settingsRepository })
    }
  })
})

app.on('before-quit', () => {
  if (agentUsageWatching) {
    try {
      agentUsageWatching.stopWatching()
    } catch {
      // Best effort during app shutdown.
    }
    agentUsageWatching = null
  }

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

  if (contextFilesHandlers) {
    void contextFilesHandlers.dispose().catch(() => {})
    contextFilesHandlers = null
  }

  if (textFileHandlers) {
    try {
      textFileHandlers.dispose()
    } catch {
      // Best effort during app shutdown.
    }
    textFileHandlers = null
  }

  const terminalLogStoreToClose = terminalLogStore
  terminalLogStore = null

  if (terminalLogStoreToClose) {
    void terminalLogStoreToClose.dispose().catch(() => {})
  }

  const databaseToClose = storageDatabase
  storageDatabase = null
  settingsRepository = null

  if (databaseToClose) {
    try {
      databaseToClose.close()
    } catch {
      // Best effort during app shutdown.
    }
  }
})

app.on('window-all-closed', () => {
  // O macOS mantém o app empacotado no Dock, mas o modo dev pertence à
  // sessão do dev-runner: sair aqui libera Electron e a porta do Vite juntos.
  if (
    shouldQuitWhenAllWindowsClosed({
      platformName: platform.name,
      isDevelopment: Boolean(process.env.VITE_DEV_SERVER_URL),
    })
  ) {
    app.quit()
  }
})
