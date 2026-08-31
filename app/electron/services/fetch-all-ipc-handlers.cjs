/**
 * @module fetch-all-ipc-handlers
 * Ponte de IPC da ferramenta Fetch All.
 *
 * Valida o que chega do renderer e devolve sempre `{ ok, … }`, no mesmo
 * contrato dos outros handlers do app: falha esperada vira mensagem legível,
 * nunca uma exceção atravessando o IPC.
 */

const fs = require('node:fs')

const { ipcMain } = require('electron')
const { createFetchAllService } = require('./fetch-all-service.cjs')
const { criarRepositorioDePedidos } = require('./fetch-all/agent-requests.cjs')

const PROGRESS_CHANNEL = 'fetch-all:progress'

/** Avisa a interface que um agente deixou um pedido esperando confirmação. */
const REQUESTS_CHANNEL = 'fetch-all:agent-requests'

/**
 * Registra os handlers e devolve o serviço criado.
 *
 * @param {() => import('electron').BrowserWindow | undefined} getMainWindow
 * @param {{ config: string, cache: string, reports: string, agentRequests: string }} appPaths
 * @param {{ createService?: typeof createFetchAllService, createRequests?: typeof criarRepositorioDePedidos }} [dependencias]
 * @returns {object} O serviço, para os testes e o encerramento do app.
 */
function registerFetchAllIpcHandlers(getMainWindow, appPaths, dependencias = {}) {
  const service = (dependencias.createService ?? createFetchAllService)({
    appPaths,
    sendEvent: (event) => {
      const window = getMainWindow?.()

      if (window && !window.isDestroyed()) {
        window.webContents.send(PROGRESS_CHANNEL, event)
      }
    },
  })

  const pedidos = (dependencias.createRequests ?? criarRepositorioDePedidos)({
    pasta: appPaths.agentRequests,
  })

  // A pasta é observada em vez de consultada de tempos em tempos: um pedido é
  // raro, e uma varredura periódica gastaria disco o dia inteiro para descobrir
  // que continua vazia. Se o sistema não suportar observação, o painel ainda
  // lista os pedidos ao abrir — só não acende sozinho.
  const observador = observarPedidos(appPaths.agentRequests, () => {
    const window = getMainWindow?.()

    if (window && !window.isDestroyed()) {
      window.webContents.send(REQUESTS_CHANNEL, { requests: pedidos.listarPendentes() })
    }
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
    service.scan({
      useCache: params?.useCache === true,
      confirmUnconfiguredScope: params?.confirmUnconfiguredScope === true,
      scopeKey: typeof params?.scopeKey === 'string' ? params.scopeKey : undefined,
    }),
  )

  ipcMain.handle('fetch-all:execute', (_event, params) =>
    service.execute({ autoCommit: params?.autoCommit === true }),
  )

  ipcMain.handle('fetch-all:cancel', () => service.cancel())

  ipcMain.handle('fetch-all:list-requests', () =>
    guard('Falha ao ler os pedidos dos agentes.', async () => ({
      requests: pedidos.listarPendentes(),
    })),
  )

  ipcMain.handle('fetch-all:resolve-request', (_event, params) =>
    guard('Falha ao responder o pedido do agente.', async () => {
      const id = readPath(params?.id)
      const pedido = id ? pedidos.ler(id) : null

      if (!pedido || pedido.estado !== 'pendente') {
        return { resolved: null, message: 'Esse pedido não está mais pendente.' }
      }

      if (params?.aceito !== true) {
        return { resolved: pedidos.resolver(id, { aceito: false }) }
      }

      // A escrita é a mesma do botão do painel, com o mesmo plano que está na
      // tela: o pedido do agente não traz plano nenhum: o dele veio de outro
      // processo e já está velho. Quem executa é o app, sobre o que a pessoa viu.
      const resultado = await service.execute({ autoCommit: pedido.comCommit === true })

      // `execute` devolve falhas esperadas como resultado, em vez de lançar.
      // Só tirar o pedido da fila depois de uma execução confirmadamente bem-
      // sucedida evita anunciar como aceito algo que não aconteceu e mantém a
      // pessoa capaz de corrigir o plano ou tentar novamente.
      if (resultado?.ok !== true) {
        return {
          ok: false,
          resolved: null,
          resultado: resultado ?? {
            ok: false,
            message: 'A execução não foi concluída.',
          },
          message:
            resultado?.message ??
            'A execução não foi concluída; o pedido continua pendente.',
        }
      }

      return {
        resolved: pedidos.resolver(id, { aceito: true, resultado }),
        resultado,
      }
    }),
  )

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

  return { ...service, pedidos, pararDeObservarPedidos: () => observador?.close() }
}

/**
 * Observa a pasta de pedidos e avisa a cada mudança.
 *
 * @param {string} pasta
 * @param {() => void} aoMudar
 * @returns {import('node:fs').FSWatcher|null}
 */
function observarPedidos(pasta, aoMudar) {
  try {
    fs.mkdirSync(pasta, { recursive: true })
    const observador = fs.watch(pasta, { persistent: false }, () => aoMudar())

    // Um erro do observador (pasta removida, limite do sistema) não pode
    // derrubar o processo principal por causa de um recurso opcional.
    observador.on('error', () => {})
    return observador
  } catch {
    return null
  }
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
