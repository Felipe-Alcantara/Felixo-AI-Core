const { app, BrowserWindow, Menu, ipcMain, safeStorage, session } = require('electron')
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
const { createAccountChainRepository } = require('./services/storage/account-chain-repository.cjs')
const { listPresentInheritedCredentialNames } = require('./services/cli-account-profiles.cjs')
const { createAccountChainRuntime } = require('./services/accounts/account-chain-runtime.cjs')
const { createAccountOutputWatcher } = require('./services/accounts/account-output-watcher.cjs')
const {
  registerAccountChainIpcHandlers,
} = require('./services/account-chain-ipc-handlers.cjs')
const {
  registerCliAccountIpcHandlers,
} = require('./services/cli-account-ipc-handlers.cjs')
const { registerOpeniaIpcHandlers } = require('./services/openia-service.cjs')
const {
  createOpeniaImageService,
  registerOpeniaImageIpcHandlers,
} = require('./services/openia-image-service.cjs')
const {
  registerFileAttachmentIpcHandlers,
  saveGeneratedImage,
} = require('./services/file-attachments-ipc-handlers.cjs')
const { registerFileExportIpcHandlers } = require('./services/file-export-ipc-handlers.cjs')
const { registerQaLoggerIpcHandlers, logQaEvent, initQaDiskStore } = require('./services/qa-logger.cjs')
const { createQaLogDiskStore } = require('./services/qa-log-disk-store.cjs')
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
  registerSpeechIpcHandlers,
} = require('./services/speech/speech-ipc-handlers.cjs')
const {
  registerWebviewProfilesIpcHandlers,
} = require('./services/webview-profiles-ipc-handlers.cjs')
const {
  registerAgentPresetsIpcHandlers,
} = require('./services/agent-presets-ipc-handlers.cjs')
const { registerNotionIpcHandlers } = require('./services/notion-ipc-handlers.cjs')
const {
  registerAgentBrowserIpcHandlers,
} = require('./services/agent-browser-ipc-handlers.cjs')
const {
  registerAgentCanvasReadIpcHandlers,
} = require('./services/agent-canvas-read-ipc-handlers.cjs')
const {
  registerAgentCanvasWriteIpcHandlers,
} = require('./services/agent-canvas-write-ipc-handlers.cjs')
const {
  registerAgentQuestionIpcHandlers,
} = require('./services/agent-question-ipc-handlers.cjs')
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
const { registerOnboardingIpcHandlers } = require('./services/onboarding-ipc-handlers.cjs')
const { resolveOnboardingAutomation } = require('./core/onboarding-automation.cjs')
const { installIpcInvokeProbe } = require('./core/ipc-invoke-probe.cjs')
const { loadDevtoolsFakeCliPty } = require('./core/devtools-fake-cli-pty-guard.cjs')
const { loadAutomationShellOpen } = require('./core/devtools-shell-open-guard.cjs')
const { createAgentUsageService } = require('./services/agent-usage-service.cjs')
const { queryClaudeUsage } = require('./services/claude-usage-query.cjs')
const {
  consumeCodexRateLimitReset,
  queryCodexRateLimits,
} = require('./services/codex-account-rate-limits.cjs')
const { queryCodexStatus } = require('./services/codex-status-query.cjs')
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
const {
  persistGraphicsMode,
  resolveGraphicsProfile,
  shouldUseSoftwareRendering,
} = require('./core/graphics-mode.cjs')
const {
  clearGraphicsRecommendation,
  dismissGraphicsRecommendation,
  evaluateGpuAfterReady,
  readGraphicsRecommendation,
} = require('./core/graphics-recommendation.cjs')
const { startGpuPreference } = require('./core/gpu-launch.cjs')
const { createGpuInfoWatcher } = require('./core/gpu-info-watcher.cjs')
const { createGpuPreferenceSession } = require('./services/gpu-preference-session.cjs')
const { describeHardwareProfile } = require('./core/hardware-profile.cjs')
const { getAutoStartStatus, setAutoStartEnabled } = require('./core/autostart.cjs')
const { detectAllClis, formatDetectionSummary } = require('./core/cli-detector.cjs')
const { createAgentCliVersions, detectAgentCliVersion } = require('./services/agent-cli-versions.cjs')
const platform = require('./core/platform/index.cjs')
const { runPackagedReleaseSmoke } = require('./release-smoke.cjs')
const { registerGlobalErrorHandlers, wrapIpcHandleWithLogging } = require('./services/global-error-handlers.cjs')
const { registerSessionSecurity } = require('./services/session-security.cjs')

// O mais cedo possível — antes de qualquer `ipcMain.handle` de outro módulo
// registrar, e antes de `app.whenReady()`. Task "Observabilidade": nenhum
// destes quatro era tratado, então a maioria dos travamentos relatados não
// deixava rastro. `logQaEvent` já funciona neste ponto (o buffer em memória
// do módulo existe desde o `require`); só a persistência em disco depende de
// `appPaths`, ligada depois dentro de `whenReady` (ver `initQaDiskStore`).
registerGlobalErrorHandlers({ log: logQaEvent, processObj: process, electronApp: app })
wrapIpcHandleWithLogging(ipcMain, logQaEvent)
// Antes de qualquer sessão existir: a permissão `openExternal` de toda sessão
// (padrão e partições do navegador interno) passa pela política de URL.
registerSessionSecurity(app, session)

let mainWindow = null
let ptyHandlers = null
let openiaImageService = null
let canvasFilesHandlers = null
let contextFilesHandlers = null
let textFileHandlers = null
let storageDatabase = null
let settingsRepository = null
let terminalLogStore = null
let cliAutoInstall = null
let agentUsageWatching = null
let notionHandlers = null
let agentBrowserWatching = null
let agentCanvasReadWatching = null
let agentCanvasWriteWatching = null
let agentQuestionWatching = null
let stopAccountChainSweeper = null

const SUPPORTED_EXTENSIONS = new Set(['.fxai', '.fxchat', '.fxworkflow'])
let pendingFilePath = null
// Em apps empacotados no Windows, switches desconhecidos podem ser consumidos
// pelo bootstrap do Chromium e não chegar a `process.argv`. O runner mantém o
// argumento para compatibilidade e usa esta flag de ambiente como sinal
// autoritativo, antes de qualquer acesso ao perfil normal da pessoa.
const isReleaseSmoke = isReleaseSmokeProcess()
const devtoolsPort = Number.parseInt(process.env.FELIXO_DEVTOOLS_PORT ?? '', 10)

// Sonda de invocações IPC, só na instância de automação e antes de qualquer
// módulo registrar canais: o smoke do tutorial prova com ela que percorrer o
// tour não chama PTY, CLI, rede nem crédito. O app normal nunca a instala.
const ipcProbe =
  Number.isInteger(devtoolsPort) && devtoolsPort > 0 && devtoolsPort <= 65535
    ? installIpcInvokeProbe(ipcMain)
    : null

// PTY roteirizado no lugar do node-pty, só na instância de automação que pediu
// (FELIXO_DEVTOOLS_FAKE_CLI_PTY=1, mesma guarda do hardware:get-profile): o
// smoke da cadeia de contas passa pelo onData real do main sem abrir CLI
// nenhuma. O app normal recebe null aqui e nunca carrega o módulo.
const devtoolsFakeCliPty = loadDevtoolsFakeCliPty({ env: process.env, devtoolsPort })

// `shell.openExternal` que sempre falha, só na instância de automação que
// pediu (FELIXO_DEVTOOLS_SHELL_OPEN=falha): o smoke prova o aviso de "não foi
// possível abrir no navegador" sem abrir navegador nenhum. O app normal
// recebe null e usa o shell do Electron.
const automationShell = loadAutomationShellOpen({ env: process.env, devtoolsPort })

// O Chromium só aceita a porta de depuração antes de ficar pronto. A flag é
// exclusiva da instância que o `felixo devtools` criou; o app normal não abre
// nenhuma porta adicional.
if (Number.isInteger(devtoolsPort) && devtoolsPort > 0 && devtoolsPort <= 65535) {
  app.commandLine.appendSwitch('remote-debugging-port', String(devtoolsPort))
  // Medido no CI (runs 34827616284/34828636528): sob Xvfb em runner Linux do
  // GitHub Actions (contêiner sem CAP_SYS_ADMIN), o Chromium nunca chega a
  // abrir a porta CDP — o sandbox de SO do próprio Chromium exige o helper
  // SUID, que o contêiner não concede. Os outros scripts de benchmark que já
  // abrem Electron no mesmo CI (terminal-scrollback-benchmark.cjs,
  // bundle-load-benchmark.cjs) evitam o problema abrindo BrowserWindows
  // próprias com `sandbox: false` em vez de subir o app inteiro; a instância
  // de automação do DevTools sobe o `main.cjs` real, então o switch precisa
  // vir daqui. Exclusivo desta instância — o app normal do usuário nunca
  // recebe FELIXO_DEVTOOLS_PORT e mantém o sandbox do Chromium ativo.
  app.commandLine.appendSwitch('no-sandbox')
  // ATENÇÃO: este switch chega TARDE para a checagem do sandbox SUID, que roda ao
  // iniciar o processo do navegador, antes deste arquivo (log real do CI em 20/09:
  // "SUID sandbox helper binary was found, but is not configured correctly").
  // Por isso `felixo devtools launch` também passa `--no-sandbox` na linha de
  // comando no Linux; sem isso o Electron aborta e o CDP nunca abre.
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

// A aceleração precisa ser decidida antes de `app.whenReady()`. O modo padrão
// preserva o GPU; só o heurístico explícito de Windows com pouca memória ou a
// escolha manual de modo compatível ativa rasterização por software. DevTools
// continua seguro para captura de janela oculta, salvo pedido explícito de
// hardware no lançamento (ver `shouldUseSoftwareRendering`).
const graphicsProfile = resolveGraphicsProfile({
  userDataPath: app.getPath('userData'),
})
const useSoftwareRendering = shouldUseSoftwareRendering({
  devtoolsActive: Number.isInteger(devtoolsPort) && devtoolsPort > 0 && devtoolsPort <= 65535,
  graphicsProfile,
})
if (useSoftwareRendering) {
  app.commandLine.appendSwitch('disable-gpu')
}

// Placa de vídeo (Automático / Integrada / Dedicada), decidida aqui pelo mesmo
// motivo: o processo de GPU só lê a linha de comando quando é lançado. Um
// início anterior com a escolha que não terminou saudável volta para
// Automático antes de aplicar (ver `electron/core/gpu-start-guard.cjs`). Quando
// o plano pede um relançamento com o ambiente limpo e ele começa, o
// `app.exit(0)` lá dentro encerra este processo na hora (medido em 26/09/2026
// no Electron 41.10.7): nada abaixo roda, nem o whenReady.
const { gpuStart, gpuLaunch } = startGpuPreference({
  app,
  userDataPath: isReleaseSmoke ? '' : app.getPath('userData'),
  environment: process.env,
  softwareRendering: useSoftwareRendering,
  isDevelopment: Boolean(process.env.VITE_DEV_SERVER_URL),
})
// Antes do whenReady, para não perder o primeiro `gpu-info-update`: só depois
// dele `app.getGPUFeatureStatus()` deixa de ser o padrão `disabled_software`.
const gpuInfoWatcher = createGpuInfoWatcher(app)

function graphicsStatus() {
  return {
    mode: graphicsProfile.mode,
    softwareRenderingActive: useSoftwareRendering,
    automatic: graphicsProfile.automatic,
    automaticLowEnd: graphicsProfile.automaticLowEnd,
    reason: graphicsProfile.reason,
    source: graphicsProfile.source,
    platform: graphicsProfile.platform,
    totalMemoryBytes: graphicsProfile.totalMemoryBytes,
    cpuCount: graphicsProfile.cpuCount,
    persistedMode: graphicsProfile.persistedMode,
    // Sugestão baseada em sinal real de GPU (detectada num boot anterior,
    // depois de app.whenReady() — não dá pra saber isso antes). Só uma
    // recomendação pendente de aceite; nunca é o modo já aplicado.
    recommendation: readGraphicsRecommendation(app.getPath('userData')),
  }
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

function resolveRuntimeAppVersion() {
  const developmentVersion = process.env.FELIXO_APP_VERSION?.trim()
  return !app.isPackaged && developmentVersion ? developmentVersion : app.getVersion()
}

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

  // Só agora (depois de whenReady) app.getGPUFeatureStatus() existe de
  // verdade. Não bloqueia o boot (sem await aqui) nem afeta a sessão
  // corrente — só persiste uma recomendação pra próxima abertura mostrar,
  // se houver sinal real de driver/GPU recusado pelo Chromium. Quando este
  // início trocou a placa de vídeo, uma GPU desligada é culpa da troca, e
  // quem responde é a volta automática para Automático, não o modo compatível.
  if (!gpuStart.guarded) {
    evaluateGpuAfterReady({
      userDataPath: app.getPath('userData'),
      getGPUFeatureStatus: () => app.getGPUFeatureStatus(),
      // No whenReady o status ainda é o padrão `disabled_software`: sem esta
      // espera, toda abertura podia recomendar o modo compatível à toa.
      waitForGpuInfo: () => gpuInfoWatcher.wait(),
      // E o primeiro evento não é o veredito: a GPU pode cair para software
      // logo depois (41 ms, medido), então os seguintes, numa janela curta,
      // também contam.
      onGpuInfoUpdate: (listener) => gpuInfoWatcher.onUpdate(listener),
      alreadyUsingSoftwareRendering: useSoftwareRendering,
    }).catch(() => {})
  }

  const appPaths = initAppPaths()
  // Antes de qualquer outra coisa: sem isso, um crash no boot (ex.: banco
  // corrompido, path inválido) ficava só em memória e sumia no restart que a
  // própria falha ia forçar. Não bloqueia o boot no erro — log em disco é
  // melhor esforço (ver initQaDiskStore).
  initQaDiskStore(createQaLogDiskStore({ directory: path.join(appPaths.logs, 'qa') })).catch((error) => {
    console.error('[felixo] falha ao inicializar o QA log em disco:', error)
  })
  storageDatabase = createStorageDatabase({
    databaseDir: appPaths.database,
  })
  settingsRepository = createSettingsRepository(storageDatabase)
  terminalLogStore = createTerminalLogStore({
    directory: path.join(appPaths.logs, 'terminal-output'),
  })
  // Remover uma conta também a tira da cadeia (membro, espera e checagem).
  const accountChainRepository = createAccountChainRepository(storageDatabase)
  // A loja vem antes do serviço de uso: é ela que diz quais contas têm login
  // próprio, e é da pasta de cada uma que a quota é lida. Os terminais vivos
  // entram por getter porque o gerenciador de PTY nasce depois.
  const cliAccounts = createCliAccountStore({
    userData: appPaths.userData,
    safeStorage,
    listLiveSessions: () => ptyHandlers?.manager?.listarSessoesVivas?.() ?? [],
    forgetChainAccount: (accountId) =>
      accountChainRepository.forgetAccount(accountId, new Date().toISOString()),
  })
  // Na instância de automação com a CLI roteirizada nenhuma CLI real roda:
  // nem a detecção do catálogo, nem as consultas de uso, nem a checagem de
  // login da cadeia. O executor falso responde só ao `codex login status`.
  const fakeAuthCommandRunner = devtoolsFakeCliPty?.createFakeAuthCommandRunner() ?? null
  const usageCliOptions = fakeAuthCommandRunner
    ? {
        runCommand: fakeAuthCommandRunner,
        listCatalog: async () => [],
        queryLiveUsage: {},
        queryResetCredits: null,
        consumeResetCreditQuery: null,
      }
    : {
        queryLiveUsage: {
          'claude-status': queryClaudeUsage,
          // O `/status` inteiro: limites, conta, configuração e histórico pelo
          // app-server, mais o texto da tela (codex-status-query.cjs).
          'codex-rate-limits': queryCodexStatus,
        },
        queryResetCredits: queryCodexRateLimits,
        consumeResetCreditQuery: consumeCodexRateLimitReset,
      }
  const agentUsageService = createAgentUsageService({
    database: storageDatabase,
    ...usageCliOptions,
    // Task Limites (mais reportado no Mac): "às vezes falha, sem motivo
    // aparente" não tinha nenhum log — sem isso, a próxima falha real
    // continua sem evidência pra fechar a causa raiz.
    onLiveQueryFailure: ({ providerId, targetAccountId, platform: platformName, message }) => {
      logQaEvent({
        level: 'warn',
        scope: 'agent-usage:live-query',
        message: message ?? 'A consulta ao uso ao vivo falhou sem mensagem.',
        details: { providerId, targetAccountId, platform: platformName },
      })
    },
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

  mainWindow = createMainWindow({ contarSessoesVivas, settingsRepository, electronShell: automationShell ?? undefined })
  const getMainWindow = () => mainWindow ?? BrowserWindow.getAllWindows()[0]

  const gpuSession = createGpuPreferenceSession({
    app,
    ipcMain,
    userDataPath: app.getPath('userData'),
    gpuStart,
    gpuInfoWatcher,
    getMainWindow,
    log: logQaEvent,
  })
  gpuSession.register()
  // "App pronto + janela carregada + GPU saudável" apaga o marcador do início.
  gpuSession.watchWindow(mainWindow)
  const relaunchInProgress = gpuStart.notApplied === 'relaunch-in-progress'
  if (
    gpuStart.revertedFromPreviousStart ||
    gpuStart.relaunchFailure ||
    relaunchInProgress ||
    gpuLaunch.switches.length > 0 ||
    gpuLaunch.unsetEnv.length > 0
  ) {
    const reverted = Boolean(gpuStart.revertedFromPreviousStart || gpuStart.relaunchFailure)
    logQaEvent({
      level: reverted ? 'warn' : 'info',
      scope: 'graphics:gpu-preference',
      message: gpuStart.relaunchFailure
        ? 'relaunch-failed'
        : reverted
          ? 'reverted-before-start'
          : relaunchInProgress
            ? 'relaunch-in-progress'
            : 'applied',
      details: {
        requested: gpuStart.requested,
        applied: gpuStart.applied,
        notApplied: gpuStart.notApplied,
        switches: gpuLaunch.switches,
        unsetEnv: gpuLaunch.unsetEnv,
        restoredEnv: gpuLaunch.restoredEnv ?? [],
        notes: gpuStart.plan?.notes ?? [],
        revertedFromPreviousStart: gpuStart.revertedFromPreviousStart,
        relaunchFailure: gpuStart.relaunchFailure,
      },
    })
  }

  // CPUs lógicas: a interface sugere o Modo Performance em máquina com poucas.
  // Na instância de automação a sugestão só aparece com pedido explícito
  // (FELIXO_DEVTOOLS_HARDWARE_NOTICES=1), para não cobrir botões nem entrar nas
  // capturas da matriz visual.
  ipcMain.handle('hardware:get-profile', () =>
    describeHardwareProfile({
      automation:
        Number.isInteger(devtoolsPort) &&
        devtoolsPort > 0 &&
        process.env.FELIXO_DEVTOOLS_HARDWARE_NOTICES !== '1',
    }),
  )

  ipcMain.handle('graphics:get-config', async () => ({
    ok: true,
    config: { ...graphicsStatus(), gpu: await gpuSession.describe() },
  }))
  ipcMain.handle('graphics:set-mode', (_event, mode) => {
    try {
      const userDataPath = app.getPath('userData')
      const hadRecommendation = Boolean(readGraphicsRecommendation(userDataPath))
      const savedMode = persistGraphicsMode({ userDataPath, mode })
      // Uma escolha explícita de modo — seja aceitando o compatível ou
      // mantendo/trocando pra outro — resolve qualquer recomendação
      // pendente. Sem isto ela continuaria aparecendo depois de já decidida.
      clearGraphicsRecommendation(userDataPath)
      logQaEvent({
        level: 'info',
        scope: 'graphics:recommendation',
        message: hadRecommendation
          ? savedMode === 'software'
            ? 'accepted'
            : 'overridden-with-other-mode'
          : 'manual-mode-change',
        details: { mode: savedMode },
      })

      return {
        ok: true,
        mode: savedMode,
        requiresRestart: true,
        message:
          'Modo gráfico salvo. Ele será aplicado na próxima abertura do Felixo.',
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Não foi possível salvar o modo gráfico.',
      }
    }
  })
  ipcMain.handle('graphics:dismiss-recommendation', () => {
    const userDataPath = app.getPath('userData')
    const hadRecommendation = Boolean(readGraphicsRecommendation(userDataPath))
    // Não só limpa — lembra qual sinal foi recusado, pra um boot seguinte
    // com o MESMO problema não voltar a incomodar (só um sinal diferente
    // justifica perguntar de novo).
    dismissGraphicsRecommendation(userDataPath)
    if (hadRecommendation) {
      logQaEvent({
        level: 'info',
        scope: 'graphics:recommendation',
        message: 'dismissed',
      })
    }
    return { ok: true }
  })

  ipcMain.handle('autostart:get-config', () => ({
    ok: true,
    config: getAutoStartStatus({
      getLoginItemSettings: () => app.getLoginItemSettings(),
      // Avisa quando este exe mora em %TEMP% (ver isInsideTemporaryDirectory).
      execPath: app.isPackaged ? app.getPath('exe') : undefined,
    }),
  }))
  ipcMain.handle('autostart:set-enabled', (_event, enabled) => {
    const result = setAutoStartEnabled({
      enabled: Boolean(enabled),
      setLoginItemSettings: (settings) => app.setLoginItemSettings(settings),
      // No Linux vira o Exec= do .desktop; nos três SOs é o que permite
      // recusar ligar o autostart a partir de uma cópia em pasta temporária.
      execPath: app.getPath('exe'),
    })
    logQaEvent({
      level: result.ok ? 'info' : 'warn',
      scope: 'autostart:set-enabled',
      message: result.ok ? (result.enabled ? 'enabled' : 'disabled') : result.message,
    })
    return result
  })

  // CDP alcança o renderer, não o processo main. A ponte abaixo só nasce na
  // instância DevTools, que usa userData isolado e porta local aleatória. Ela
  // fornece captura nativa (que funciona mesmo quando a janela não pinta pelo
  // compositor Windows) e uma avaliação limitada, sem `require`/`process`.
  // `ipcProbe` entra no contexto só com `snapshot()` (leitura dos contadores).
  if (Number.isInteger(devtoolsPort) && devtoolsPort > 0) {
    const probeView = ipcProbe ? Object.freeze({ snapshot: () => ipcProbe.snapshot() }) : null
    ipcMain.handle('devtools:capture-page', async () => {
      const target = getMainWindow()
      if (!target || target.isDestroyed()) throw new Error('Janela DevTools indisponível.')
      return (await target.webContents.capturePage()).toDataURL()
    })
    ipcMain.handle('devtools:main-eval', (_event, expression) => {
      if (typeof expression !== 'string' || expression.length > 20_000) {
        throw new Error('Expressão DevTools inválida.')
      }
      return vm.runInNewContext(
        expression,
        { app, BrowserWindow, mainWindow, ipcProbe: probeView },
        { timeout: 1_000 },
      )
    })
  }

  registerQaLoggerIpcHandlers(getMainWindow, {
    getReportContext: async () => ({
      appVersion: resolveRuntimeAppVersion(),
      platformName: process.platform,
      arch: process.arch,
      cliDetectionResults: await detectAllClis(),
      reportsDirectory: appPaths.reports,
    }),
  })
  registerCliIpcHandlers(getMainWindow, { terminalLogStore, database: storageDatabase })
  registerOfficialCliAccountIpcHandlers({
    getPtyManager: () => ptyHandlers?.manager ?? null,
  })
  registerOpeniaIpcHandlers()
  registerCliAccountIpcHandlers({ store: cliAccounts })
  // Cadeia de contas: nasce desligada (sem linha no banco). O serviço lê os
  // terminais vivos do PTY, que é montado logo abaixo, por isso o acesso é
  // preguiçoso; os pushes passam pelos canais registrados em seguida.
  let accountChainIpc = null
  const accountChain = createAccountChainRuntime({
    database: storageDatabase,
    repository: accountChainRepository,
    cliAccounts,
    listLiveSessions: () => ptyHandlers?.manager?.listarSessoesVivas?.() ?? [],
    setSessionAccountMode: (sessionId, mode) => ptyHandlers?.manager?.setAccountMode?.(sessionId, mode) === true,
    emit: (channel, payload) => accountChainIpc?.emit(channel, payload),
    // Só a transição (sem texto cru da CLI): o serviço já redige a mensagem.
    log: ({ scope, transition, ...details }) =>
      logQaEvent({ level: 'info', scope, message: transition ?? 'account-chain', details }),
    ...(fakeAuthCommandRunner ? { runCommand: fakeAuthCommandRunner } : {}),
  })
  accountChainIpc = registerAccountChainIpcHandlers({
    getService: () => accountChain.service,
    view: accountChain.view,
    getMainWindow,
    listEnvCredentialNames: () => listPresentInheritedCredentialNames(process.env),
  })
  // Limitação conhecida: sem trava de instância única, uma segunda instância
  // no MESMO perfil invalida as propostas e tickets abertos pela primeira
  // (fail-closed: vencem, nada é executado). A instância de automação usa
  // perfil isolado.
  try {
    accountChain.service.recoverOnStartup()
  } catch (error) {
    logQaEvent({
      level: 'warn',
      scope: 'account-chain',
      message: 'recover-failed',
      details: { message: error instanceof Error ? error.message.slice(0, 200) : 'erro' },
    })
  }
  stopAccountChainSweeper = accountChain.service.startExpirySweeper()
  // Versão de cada CLI de agente, para a retomada de conversa: o canvas decide
  // o método por ela e o PTY a grava junto da conversa descoberta. Reaproveita
  // a detecção da abertura (`seed`, mais abaixo); a instância roteirizada não
  // roda CLI nenhuma, então ali nenhuma versão é conhecida.
  const agentCliVersions = createAgentCliVersions({
    detect: fakeAuthCommandRunner
      ? async () => null
      : (provider) => detectAgentCliVersion(provider, createCliEnv()),
  })
  ptyHandlers = registerPtyIpcHandlers(getMainWindow, {
    validateAccount: (accountId, providerId) =>
      cliAccounts.validateAccount(accountId, providerId),
    onSessionExit: (sessionId) => accountChain.service.onSessionExit(sessionId),
    // A troca só abre o bloco novo com o ticket confirmado, uma vez, na conta
    // confirmada; o bloco que reabre sem ticket mantém a linhagem da troca.
    chainTickets: {
      begin: (request) => accountChain.service.beginTicketSpawn(request),
      finish: (request) => accountChain.service.finishTicketSpawn(request),
      lineage: (request) => accountChain.service.lineageForSession(request),
    },
    cliVersions: agentCliVersions,
    manager: new PtyProcessManager({
      spawnPty: devtoolsFakeCliPty?.createFakeCliPtyFactory(),
      getCliVersion: (provider) => agentCliVersions.peek(provider),
      validateAccount: (accountId, providerId) =>
        cliAccounts.validateAccount(accountId, providerId),
      buildAccountEnv: (accountId, providerId) =>
        cliAccounts.buildEnv(accountId, providerId),
      // Vigia de falha por conta no onData: limite, login e crédito da CLI
      // viram detecção para o serviço da cadeia (que nunca troca sozinho).
      createOutputWatcher: createAccountOutputWatcher,
      onOutputFailure: (detection) => {
        void accountChain.service.onOutputFailure(detection)
      },
    }),
  })
  registerFileAttachmentIpcHandlers(appPaths, { getMainWindow })
  // Geração de imagem: filho do Openia + arquivo de saída. Grava no MESMO diretório e pelo mesmo
  // caminho seguro das outras imagens geradas, e só depois avisa o canvas.
  openiaImageService = createOpeniaImageService({
    userData: appPaths.userData,
    saveImage: (params) =>
      saveGeneratedImage(params, path.join(appPaths.userData, 'generated-images')),
    notify: (artifact) => getMainWindow()?.webContents?.send('canvas:image-generated', artifact),
  })
  registerOpeniaImageIpcHandlers({ service: openiaImageService })
  void openiaImageService.sweepOrphans()
  registerFileExportIpcHandlers(getMainWindow)
  const projectsHandlers = registerProjectsIpcHandlers(getMainWindow, {
    database: storageDatabase,
  })
  registerNotesIpcHandlers({ database: storageDatabase })
  canvasFilesHandlers = registerCanvasFilesIpcHandlers(getMainWindow, appPaths)
  contextFilesHandlers = registerContextFilesIpcHandlers(appPaths, {
    logDelivery: (entry) => logQaEvent(entry),
  })
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
  registerAgentPresetsIpcHandlers({ database: storageDatabase })
  registerSpeechIpcHandlers({ userData: appPaths.userData })
  registerAgentModelsIpcHandlers(appPaths)
  registerSystemDesignIpcHandlers(appPaths, { database: storageDatabase })
  registerChatHistoryIpcHandlers({ database: storageDatabase })
  registerGitIpcHandlers()
  registerFetchAllIpcHandlers(getMainWindow, appPaths)
  notionHandlers = registerNotionIpcHandlers({
    appPaths,
    database: storageDatabase,
  })
  const webviewProfiles = registerWebviewProfilesIpcHandlers({ database: storageDatabase })
  agentBrowserWatching = registerAgentBrowserIpcHandlers(getMainWindow, appPaths, {
    // A mesma troca da janela: com FELIXO_DEVTOOLS_SHELL_OPEN=falha, o
    // "Abrir no navegador" do cartão de pedido também não abre nada.
    shell: automationShell ?? undefined,
    findProfileByName: (name) => webviewProfiles.repository.findByName(name),
  })
  agentCanvasReadWatching = registerAgentCanvasReadIpcHandlers({
    database: storageDatabase,
    appPaths,
    getTerminalLogStore: () => terminalLogStore,
  })
  agentCanvasWriteWatching = registerAgentCanvasWriteIpcHandlers({
    getMainWindow,
    database: storageDatabase,
    appPaths,
  })
  agentQuestionWatching = registerAgentQuestionIpcHandlers({ getMainWindow, appPaths })
  registerAutoUpdateHandlers(getMainWindow)
  cliAutoInstall = registerCliAutoInstallHandlers(getMainWindow, {
    appPaths,
    appVersion: resolveRuntimeAppVersion(),
    isPackaged: app.isPackaged,
  })
  registerOrchestratorSettingsIpcHandlers(appPaths, { database: storageDatabase })
  // Tutorial do canvas: estado no SQLite com compare-and-set. A instância de
  // automação (com porta de depuração) não abre nem grava nada sozinha, salvo
  // FELIXO_DEVTOOLS_ONBOARDING=1 (mesmo molde do hardware:get-profile).
  registerOnboardingIpcHandlers({
    ipcMain,
    database: storageDatabase,
    getAppVersion: resolveRuntimeAppVersion,
    automation: resolveOnboardingAutomation({ env: process.env, devtoolsPort }),
  })
  agentUsageWatching = registerAgentUsageIpcHandlers({
    service: agentUsageService,
    getMainWindow,
  })

  // Expõe a versão empacotada (definida pelo CI no release, não no
  // package.json versionado) para a interface conseguir mostrá-la.
  ipcMain.handle('app:get-version', () => resolveRuntimeAppVersion())

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

  // A detecção roda `--version` de cada CLI: a instância roteirizada não roda nenhuma.
  // A versão das CLIs de agente sai daqui mesmo, sem um segundo `--version`.
  const startupCliDetection = fakeAuthCommandRunner ? Promise.resolve([]) : detectAllClis(createCliEnv())
  agentCliVersions.seed(startupCliDetection)
  startupCliDetection.then((results) => {
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
        graphics: graphicsStatus(),
      },
    })
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // A janela recriada precisa da MESMA guarda: no macOS este é o caminho
      // normal de voltar ao app depois de fechar, e uma janela sem guarda
      // desfaria a proteção na segunda vez.
      mainWindow = createMainWindow({ contarSessoesVivas, settingsRepository, electronShell: automationShell ?? undefined })
    }
  })
})

app.on('before-quit', () => {
  // Interrompe gerações de imagem em andamento (mata o filho do Openia e a pasta temporária).
  openiaImageService?.shutdown()
  if (agentBrowserWatching) {
    try {
      agentBrowserWatching.pararDeObservarPedidos()
    } catch {
      // Best effort during app shutdown.
    }
    agentBrowserWatching = null
  }

  if (agentCanvasReadWatching) {
    try {
      agentCanvasReadWatching.pararDeObservarPedidos()
    } catch {
      // Best effort during app shutdown.
    }
    agentCanvasReadWatching = null
  }

  if (agentCanvasWriteWatching) {
    try {
      agentCanvasWriteWatching.pararDeObservarPedidos()
    } catch {
      // Best effort during app shutdown.
    }
    agentCanvasWriteWatching = null
  }

  if (agentQuestionWatching) {
    try {
      agentQuestionWatching.pararDeObservarPedidos()
    } catch {
      // Best effort during app shutdown.
    }
    agentQuestionWatching = null
  }

  if (agentUsageWatching) {
    try {
      agentUsageWatching.stopWatching()
    } catch {
      // Best effort during app shutdown.
    }
    agentUsageWatching = null
  }

  notionHandlers = null

  if (stopAccountChainSweeper) {
    stopAccountChainSweeper()
    stopAccountChainSweeper = null
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
