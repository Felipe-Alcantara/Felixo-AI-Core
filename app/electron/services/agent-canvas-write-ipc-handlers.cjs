'use strict'

const { ipcMain } = require('electron')

const { observeAgentRequests } = require('./agent-request-watcher.cjs')
const { criarRepositorioDePedidos } = require('./fetch-all/agent-requests.cjs')
const { createCanvasRepository } = require('./storage/canvas-repository.cjs')
const { prepararEscrita } = require('./canvas-agent-write.cjs')

const ESCREVER_ACTION = 'canvas-escrever'

/** Avisa o painel que um agente deixou um pedido de escrita esperando confirmação. */
const REQUESTS_CHANNEL = 'canvas:agent-write-requests'

/**
 * Empurra o novo `data` de um nó para o canvas já aberto, sem esperar reload.
 *
 * O renderer é dono do estado vivo (`useCanvasPersistence`); persistir no
 * SQLite não move um pixel na tela sozinho, e a próxima autosave do bloco
 * (debounce de posição/tamanho) poderia sobrescrever a escrita do agente com
 * a cópia velha que o renderer ainda tem em memória. Por isso a escrita só
 * conta como aplicada depois que o renderer confirma que atualizou o nó vivo.
 */
const NODE_UPDATED_CHANNEL = 'canvas:agent-node-updated'

/**
 * Consome os pedidos de escrita do canvas pela mesma fila de intenções do
 * Fetch All/navegador/leitura (`agent-requests.cjs`).
 *
 * Ao contrário de `canvas-listar`/`canvas-ler`, `canvas-escrever` NUNCA é
 * auto-resolvido: é exatamente o risco que a task original nomeia (prompt
 * injection vindo de um terminal ou página lido por outro agente mandando
 * escrever em outro lugar). Fica pendente até `canvas:resolve-write-request`
 * ser chamado por um clique real da pessoa no painel — o mesmo padrão que o
 * Fetch All já usa para `executar-plano`.
 *
 * A auditoria não ganhou um log separado: cada pedido já fica persistido como
 * arquivo em `userData/agent-requests` com pedidoEm/resolvidoEm/estado/
 * resultado — o mesmo arquivo que já serve de fila é o registro do que foi
 * pedido, quando, e o que a pessoa decidiu.
 *
 * @param {{ getMainWindow: () => import('electron').BrowserWindow | undefined, database: unknown, appPaths: { agentRequests: string }, dependencies?: object }} options
 */
function registerAgentCanvasWriteIpcHandlers({ getMainWindow, database, appPaths, dependencies = {} }) {
  const pedidos = (dependencies.createRequests ?? criarRepositorioDePedidos)({ pasta: appPaths.agentRequests })
  const canvasRepository = dependencies.canvasRepository ?? createCanvasRepository(database)

  function sendToWindow(channel, payload) {
    const window = getMainWindow?.()
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }

  const watcher = observeAgentRequests(appPaths.agentRequests, () => {
    sendToWindow(REQUESTS_CHANNEL, { requests: pedidos.listarPendentes({ acao: ESCREVER_ACTION }) })
  })

  ipcMain.handle('canvas:list-write-requests', () =>
    guard('Falha ao ler os pedidos de escrita dos agentes.', () => ({
      requests: pedidos.listarPendentes({ acao: ESCREVER_ACTION }),
    })),
  )

  ipcMain.handle('canvas:resolve-write-request', (_event, params) =>
    guard('Falha ao responder o pedido de escrita do agente.', () => {
      const id = typeof params?.id === 'string' ? params.id.trim() : ''
      const pedido = id ? pedidos.ler(id) : null

      if (!pedido || pedido.estado !== 'pendente' || pedido.acao !== ESCREVER_ACTION) {
        return { resolved: null, message: 'Esse pedido não está mais pendente.' }
      }

      if (params?.aceito !== true) {
        return { resolved: pedidos.resolver(id, { aceito: false }) }
      }

      // Canvas de verdade no momento do clique, não o que veio no pedido —
      // o nó pode ter sido apagado ou mudado de tipo desde que o agente pediu.
      const nodes = canvasRepository.list()
      const preparo = prepararEscrita({ id: pedido.idDoElemento, nodes, conteudo: pedido.conteudo })

      if (!preparo.ok) {
        return {
          resolved: pedidos.resolver(id, { aceito: false, resultado: { ok: false, message: preparo.message } }),
          resultado: { ok: false, message: preparo.message },
        }
      }

      const novoNo = { ...preparo.node, data: preparo.novaData, updatedAt: new Date().toISOString() }
      canvasRepository.save(novoNo)
      sendToWindow(NODE_UPDATED_CHANNEL, { id: novoNo.id, data: preparo.novaData })

      const resultado = { ok: true, id: novoNo.id, type: novoNo.type }
      return { resolved: pedidos.resolver(id, { aceito: true, resultado }), resultado }
    }),
  )

  return {
    pedidos,
    pararDeObservarPedidos: () => watcher?.close(),
  }
}

/**
 * @param {string} fallbackMessage
 * @param {() => object} run
 * @returns {object}
 */
function guard(fallbackMessage, run) {
  try {
    return { ok: true, ...run() }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.message ? error.message : fallbackMessage,
    }
  }
}

module.exports = {
  ESCREVER_ACTION,
  NODE_UPDATED_CHANNEL,
  REQUESTS_CHANNEL,
  registerAgentCanvasWriteIpcHandlers,
}
