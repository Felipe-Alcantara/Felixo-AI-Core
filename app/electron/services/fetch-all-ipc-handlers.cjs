/**
 * @module fetch-all-ipc-handlers
 * Ponte de IPC da ferramenta Fetch All.
 *
 * Valida o que chega do renderer e devolve sempre `{ ok, … }`, no mesmo
 * contrato dos outros handlers do app: falha esperada vira mensagem legível,
 * nunca uma exceção atravessando o IPC.
 */

const { ipcMain } = require('electron')
const { createFetchAllService } = require('./fetch-all-service.cjs')

const PROGRESS_CHANNEL = 'fetch-all:progress'

/**
 * Registra os handlers e devolve o serviço criado.
 *
 * @param {() => import('electron').BrowserWindow | undefined} getMainWindow
 * @param {{ config: string, cache: string, reports: string }} appPaths
 * @returns {object} O serviço, para os testes e o encerramento do app.
 */
function registerFetchAllIpcHandlers(getMainWindow, appPaths) {
  const service = createFetchAllService({
    appPaths,
    sendEvent: (event) => {
      const window = getMainWindow?.()

      if (window && !window.isDestroyed()) {
        window.webContents.send(PROGRESS_CHANNEL, event)
      }
    },
  })

  ipcMain.handle('fetch-all:get-state', () => ({ ok: true, ...service.getState() }))

  ipcMain.handle('fetch-all:get-settings', () =>
    guard('Falha ao ler as configurações do Fetch All.', async () => ({
      settings: await service.getSettings(),
    })),
  )

  ipcMain.handle('fetch-all:save-settings', (_event, params) =>
    guard('Falha ao salvar as configurações do Fetch All.', async () => ({
      settings: await service.saveSettings(params?.settings),
    })),
  )

  ipcMain.handle('fetch-all:get-scope', () =>
    guard('Falha ao listar os discos locais.', async () => ({
      scope: await service.describeScanScope(),
    })),
  )

  ipcMain.handle('fetch-all:scan', (_event, params) =>
    service.scan({ useCache: params?.useCache === true }),
  )

  ipcMain.handle('fetch-all:execute', (_event, params) =>
    service.execute({ autoCommit: params?.autoCommit === true }),
  )

  ipcMain.handle('fetch-all:cancel', () => service.cancel())

  ipcMain.handle('fetch-all:ignore-path', (_event, params) => {
    const targetPath = readPath(params?.path)

    if (!targetPath) {
      return { ok: false, message: 'Informe a pasta a ignorar.' }
    }

    return guard('Falha ao ignorar a pasta.', () => service.ignorePath(targetPath))
  })

  ipcMain.handle('fetch-all:unignore-path', (_event, params) => {
    const targetPath = readPath(params?.path)

    if (!targetPath) {
      return { ok: false, message: 'Informe a pasta a deixar de ignorar.' }
    }

    return guard('Falha ao remover a pasta da lista de ignoradas.', async () => ({
      settings: await service.unignorePath(targetPath),
    }))
  })

  return service
}

/**
 * Executa a ação e transforma qualquer falha numa resposta legível.
 *
 * @param {string} fallbackMessage
 * @param {() => Promise<object>} run
 * @returns {Promise<object>}
 */
async function guard(fallbackMessage, run) {
  try {
    return { ok: true, ...(await run()) }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.message ? error.message : fallbackMessage,
    }
  }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function readPath(value) {
  return typeof value === 'string' ? value.trim() : ''
}

module.exports = {
  PROGRESS_CHANNEL,
  registerFetchAllIpcHandlers,
}
