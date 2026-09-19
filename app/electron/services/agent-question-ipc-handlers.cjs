'use strict'

const { ipcMain } = require('electron')

const { observeAgentRequests } = require('./agent-request-watcher.cjs')
const { criarRepositorioDePedidos } = require('./fetch-all/agent-requests.cjs')

const PERGUNTAR_ACTION = 'perguntar'

/** Avisa a interface que um agente deixou uma pergunta esperando resposta. */
const QUESTIONS_CHANNEL = 'canvas:agent-questions'

/**
 * Perguntas com opções que um agente faz pela mesma fila de intenções
 * (`felixo perguntar`). Ao contrário de leitura, NUNCA se resolve sozinha:
 * fica pendente até a pessoa clicar numa opção (ou dispensar) no diálogo.
 *
 * A resposta que volta ao agente é sempre uma das opções que o próprio pedido
 * carregava: o renderer manda só o ÍNDICE, e o texto vem do pedido gravado
 * aqui — o que chega do renderer nunca vira o conteúdo devolvido ao agente.
 *
 * @param {{ getMainWindow: () => import('electron').BrowserWindow | undefined, appPaths: { agentRequests: string }, dependencies?: object }} options
 */
function registerAgentQuestionIpcHandlers({ getMainWindow, appPaths, dependencies = {} }) {
  const pedidos = (dependencies.createRequests ?? criarRepositorioDePedidos)({ pasta: appPaths.agentRequests })

  const watcher = observeAgentRequests(appPaths.agentRequests, () => {
    const window = getMainWindow?.()
    if (window && !window.isDestroyed()) {
      window.webContents.send(QUESTIONS_CHANNEL, { requests: pedidos.listarPendentes({ acao: PERGUNTAR_ACTION }) })
    }
  })

  ipcMain.handle('canvas:list-questions', () =>
    guard('Falha ao ler as perguntas dos agentes.', () => ({
      requests: pedidos.listarPendentes({ acao: PERGUNTAR_ACTION }),
    })),
  )

  ipcMain.handle('canvas:answer-question', (_event, params) =>
    guard('Falha ao responder a pergunta do agente.', () => {
      const id = typeof params?.id === 'string' ? params.id.trim() : ''
      const pedido = id ? pedidos.ler(id) : null

      if (!pedido || pedido.estado !== 'pendente' || pedido.acao !== PERGUNTAR_ACTION) {
        return { resolved: null, message: 'Essa pergunta não está mais pendente.' }
      }

      // Índice nulo/ausente = a pessoa dispensou a pergunta.
      if (params?.indice === null || params?.indice === undefined) {
        return { resolved: pedidos.resolver(id, { aceito: false }) }
      }

      const opcao = Number.isInteger(params.indice) ? pedido.opcoes?.[params.indice] : undefined
      if (!opcao) {
        return { resolved: null, message: 'Opção inválida para essa pergunta.' }
      }

      const resultado = { ok: true, indice: params.indice, label: opcao.label }
      return { resolved: pedidos.resolver(id, { aceito: true, resultado }), resultado }
    }),
  )

  return { pedidos, pararDeObservarPedidos: () => watcher?.close() }
}

function guard(fallbackMessage, run) {
  try {
    return { ok: true, ...run() }
  } catch (error) {
    return { ok: false, message: error instanceof Error && error.message ? error.message : fallbackMessage }
  }
}

module.exports = { PERGUNTAR_ACTION, QUESTIONS_CHANNEL, registerAgentQuestionIpcHandlers }
