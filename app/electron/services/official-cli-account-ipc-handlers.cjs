// Registra os handlers IPC de catálogo/conta das CLIs oficiais (listar,
// instalar, login, status e troca de conta). Extraído de ipc-handlers.cjs,
// que trata do ciclo de vida de execução/streaming das CLIs — um domínio
// diferente do gerenciamento de conta/instalação.
const { ipcMain } = require('electron')
const { logQaEvent } = require('./qa-logger.cjs')
const {
  getOfficialCliAccountStatus,
  installOfficialCli,
  listOfficialCliCatalog,
  openOfficialCliLogin,
  switchOfficialCliAccount,
} = require('./official-cli-service.cjs')
const { getRequiredString } = require('./cli-event-utils.cjs')

function registerOfficialCliAccountIpcHandlers() {
  ipcMain.handle('cli:list-official', async () => {
    try {
      const clis = await listOfficialCliCatalog()
      return { ok: true, clis }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Falha ao listar CLIs oficiais.'

      logQaEvent({
        level: 'error',
        scope: 'cli:list-official',
        message,
      })

      return { ok: false, message, clis: [] }
    }
  })

  ipcMain.handle('cli:install-official', async (_event, params) => {
    const id = getRequiredString(params?.id)

    if (!id) {
      return { ok: false, message: 'CLI oficial invalida.' }
    }

    logQaEvent({
      level: 'info',
      scope: 'cli:install-official',
      message: `Installing official CLI ${id}.`,
    })

    return installOfficialCli(id)
  })

  ipcMain.handle('cli:open-official-login', (_event, params) => {
    const id = getRequiredString(params?.id)

    if (!id) {
      return { ok: false, message: 'CLI oficial invalida.' }
    }

    const result = openOfficialCliLogin(id)
    logQaEvent({
      level: result.ok ? 'info' : 'warn',
      scope: 'cli:open-official-login',
      message: result.message ?? `Login command requested for ${id}.`,
      details: {
        id,
        command: result.command,
        args: result.args,
        manualCommand: result.manualCommand,
      },
    })

    return result
  })

  ipcMain.handle('cli:official-account-status', async (_event, params) => {
    const id = getRequiredString(params?.id)

    if (!id) {
      return { ok: false, message: 'CLI oficial invalida.' }
    }

    const result = await getOfficialCliAccountStatus(id)
    logQaEvent({
      level: result.ok ? 'info' : 'warn',
      scope: 'cli:official-account-status',
      message: result.message ?? `Account status requested for ${id}.`,
      details: {
        id,
        authStatus: result.authStatus,
      },
    })

    return result
  })

  ipcMain.handle('cli:switch-official-account', async (_event, params) => {
    const id = getRequiredString(params?.id)

    if (!id) {
      return { ok: false, message: 'CLI oficial invalida.' }
    }

    const result = await switchOfficialCliAccount(id)
    logQaEvent({
      level: result.ok ? 'info' : 'warn',
      scope: 'cli:switch-official-account',
      message: result.message ?? `Account switch requested for ${id}.`,
      details: {
        id,
        command: result.command,
        args: result.args,
      },
    })

    return result
  })
}

module.exports = {
  registerOfficialCliAccountIpcHandlers,
}
