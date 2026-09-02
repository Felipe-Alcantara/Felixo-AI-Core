/**
 * @module cli-auto-install
 * Deixa as CLIs oficiais prontas sozinho, logo depois que o app abre.
 *
 * O app orquestra CLIs de IA, mas quem chega pelo instalador de release
 * costuma não usar terminal — e sem `claude`, `codex` ou `gemini` instalados
 * o app abre sem nada para orquestrar. Aqui a instalação acontece em segundo
 * plano, na pasta gerenciada do app (ver `managed-cli-paths`), com o Node e o
 * npm que o app carrega consigo (ver `node-runtime`).
 *
 * O que já estiver instalado na máquina é preservado: essas CLIs nem entram
 * na fila. A decisão de o que instalar vive em `cli-auto-install-plan`; aqui
 * ficam o efeito colateral (processo, disco, IPC) e o status para a interface.
 */

const fs = require('node:fs')
const path = require('node:path')
const { ipcMain } = require('electron')
const { detectCli } = require('../core/cli-detector.cjs')
const { listOfficialAiClis } = require('../core/official-cli-catalog.cjs')
const { getManagedCliLayout } = require('../core/managed-cli-paths.cjs')
const { getNodeExecutable, resolveNpmCliPath } = require('../core/node-runtime.cjs')
const { createCliEnv } = require('./cli-process-manager.cjs')
const { ensureManagedCliRuntime } = require('./managed-cli-runtime.cjs')
const { installManagedPackage } = require('./managed-cli-installer.cjs')
const {
  allDetected,
  getAutoInstallableClis,
  isAutoInstallEnabled,
  planAutoInstall,
  summarizeAutoInstall,
} = require('./cli-auto-install-plan.cjs')
const { logQaEvent } = require('./qa-logger.cjs')

const STATE_FILE_NAME = 'cli-auto-install.json'
const STARTUP_DELAY_MS = 4000

/**
 * @param {() => import('electron').BrowserWindow | null} getMainWindow
 * @param {object} options
 * @param {ReturnType<typeof import('../core/app-paths.cjs').getAppPaths>} options.appPaths
 * @param {string} options.appVersion
 * @param {boolean} options.isPackaged
 * @param {Function} [options.installPackage] - Injetável nos testes.
 * @param {Function} [options.detect] - Injetável nos testes.
 * @returns {{ getStatus: () => object, run: (reason?: string) => Promise<object>, stop: () => void }}
 */
function registerCliAutoInstallHandlers(getMainWindow, options) {
  const {
    appPaths,
    appVersion,
    isPackaged,
    installPackage = installManagedPackage,
    detect = detectCli,
  } = options

  const layout = getManagedCliLayout({ userData: appPaths.userData })
  const stateFilePath = path.join(appPaths.config, STATE_FILE_NAME)
  const enabled = isAutoInstallEnabled(isPackaged)

  let status = createStatus({
    state: enabled ? 'idle' : 'disabled',
    message: enabled
      ? 'Verificando as CLIs de IA.'
      : 'A instalacao automatica das CLIs roda apenas no app instalado.',
  })
  let running = null
  let startupTimer = null

  function setStatus(next) {
    status = { ...status, ...next, updatedAt: new Date().toISOString() }
    sendStatus(getMainWindow, status)
    return status
  }

  /**
   * Instala o que faltar.
   *
   * `reason` separa a rodada automática da nova tentativa pedida pela pessoa:
   * só a segunda ignora o registro de falhas desta versão. Chamadas
   * concorrentes compartilham a mesma execução — duas instalações do mesmo
   * pacote no mesmo prefixo se atropelariam.
   */
  function run(reason = 'startup') {
    if (running) {
      return running
    }

    running = installMissingClis(reason)
      .catch((error) =>
        setStatus({
          state: 'error',
          message: getErrorMessage(
            error,
            'Falha na instalacao automatica das CLIs.',
          ),
        }),
      )
      .finally(() => {
        running = null
      })

    return running
  }

  async function installMissingClis(reason) {
    const npmCliPath = resolveNpmCliPath()

    if (!npmCliPath) {
      return setStatus({
        state: 'error',
        message:
          'O instalador de CLIs nao veio junto com esta versao do app. Instale as CLIs pelo gerenciador de modelos.',
        clis: [],
      })
    }

    setStatus({ state: 'checking', message: 'Verificando as CLIs de IA.', clis: [] })

    const catalog = getAutoInstallableClis(listOfficialAiClis())
    const detections = await detectWithSecondChance(catalog, detect)
    const { pending, progress } = planAutoInstall({
      catalog,
      detections,
      managedPresent: catalog.map((cli) => hasManagedBinary(layout, cli)),
      previousState: readState(stateFilePath),
      appVersion,
      reason,
    })

    if (pending.length === 0) {
      return setStatus({
        state: 'idle',
        message: allDetected(detections)
          ? 'Todas as CLIs de IA estao prontas.'
          : 'Faltam CLIs de IA, e a instalacao automatica ja tentou nesta versao.',
        clis: progress,
      })
    }

    // Os atalhos `node`/`npm` precisam existir antes do primeiro pacote: é o
    // npm que vai usá-los para rodar os scripts de instalação.
    ensureManagedCliRuntime({
      layout,
      nodeExecutable: getNodeExecutable(),
      npmCliPath,
    })

    const attempts = readState(stateFilePath)

    for (const [index, cli] of pending.entries()) {
      updateCliProgress(progress, cli.id, { state: 'installing' })
      setStatus({
        state: 'installing',
        message: `Instalando ${cli.name} (${index + 1} de ${pending.length}).`,
        clis: progress,
      })

      const result = await installPackage({
        npmPackage: cli.install.npmPackage,
        npmCliPath,
        nodeExecutable: getNodeExecutable(),
        layout,
      })

      updateCliProgress(progress, cli.id, {
        state: result.ok ? 'installed' : 'failed',
        message: result.message,
      })
      attempts[cli.id] = {
        version: appVersion,
        ok: result.ok,
        message: result.message,
        at: new Date().toISOString(),
      }

      logQaEvent({
        level: result.ok ? 'info' : 'warn',
        scope: 'cli:auto-install',
        message: result.message,
        details: { id: cli.id, reason, output: result.output },
      })
    }

    writeState(stateFilePath, attempts)

    return setStatus({ ...summarizeAutoInstall(progress), clis: progress })
  }

  ipcMain.handle('clis:get-setup-status', () => ({ ok: true, status }))
  ipcMain.handle('clis:retry-setup', async () => {
    if (!enabled) {
      return { ok: false, message: status.message, status }
    }

    return { ok: true, status: await run('manual') }
  })

  if (enabled) {
    // O atraso deixa a janela desenhar antes: a instalação é longa e não pode
    // disputar com a abertura do app o mesmo instante de CPU.
    startupTimer = setTimeout(() => run('startup'), STARTUP_DELAY_MS)
  }

  return {
    getStatus: () => status,
    run,
    stop: () => clearTimeout(startupTimer),
  }
}

function updateCliProgress(progress, id, patch) {
  const item = progress.find((candidate) => candidate.id === id)
  if (item) Object.assign(item, patch)
}

function createStatus({ state, message }) {
  return { state, message, clis: [], updatedAt: new Date().toISOString() }
}

/**
 * Detecta, e tenta de novo só o que pareceu faltar.
 *
 * A detecção roda logo depois da abertura, quando a máquina está mais
 * ocupada, e uma CLI lenta pode estourar o tempo limite e passar por
 * ausente — o que faz o app reinstalar algo que já estava lá. A segunda
 * chamada acontece com o app já assentado e custa nada quando tudo foi
 * detectado de primeira.
 */
async function detectWithSecondChance(catalog, detect) {
  const env = createCliEnv()
  const first = await Promise.all(catalog.map((cli) => detect(cli, env)))

  if (first.every((detection) => detection.detected)) {
    return first
  }

  return Promise.all(
    first.map((detection, index) =>
      detection.detected ? detection : detect(catalog[index], env),
    ),
  )
}

/**
 * O executável que instalamos continua no disco?
 *
 * No Windows o nome no disco não é o `command` puro: o catálogo declara em
 * `windowsAliases` as extensões que aquela CLI realmente usa (`.cmd`, `.exe`
 * e, para a Codex/openia, `.ps1`). Ignorar isso faria o app achar que o
 * binário sumiu e reinstalar uma CLI que já está lá.
 */
function hasManagedBinary(layout, cli) {
  if (!cli.command) {
    return false
  }

  const candidatos =
    cli.windowsAliases?.length > 0
      ? [cli.command, ...cli.windowsAliases]
      : [cli.command, `${cli.command}.cmd`, `${cli.command}.exe`]

  return candidatos.some((candidate) =>
    fs.existsSync(path.join(layout.packagesBin, candidate)),
  )
}

function readState(stateFilePath) {
  try {
    return JSON.parse(fs.readFileSync(stateFilePath, 'utf8'))
  } catch {
    return {}
  }
}

function writeState(stateFilePath, state) {
  try {
    fs.mkdirSync(path.dirname(stateFilePath), { recursive: true })
    fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf8')
  } catch (error) {
    logQaEvent({
      level: 'warn',
      scope: 'cli:auto-install',
      message: getErrorMessage(
        error,
        'Nao foi possivel registrar as tentativas de instalacao.',
      ),
    })
  }
}

function sendStatus(getMainWindow, status) {
  const mainWindow =
    typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow

  if (!mainWindow?.webContents || mainWindow.webContents.isDestroyed()) {
    return
  }

  mainWindow.webContents.send('clis:setup-status', status)
}

function getErrorMessage(error, fallback) {
  return error?.message ? String(error.message) : fallback
}

module.exports = {
  registerCliAutoInstallHandlers,
  hasManagedBinary,
}
