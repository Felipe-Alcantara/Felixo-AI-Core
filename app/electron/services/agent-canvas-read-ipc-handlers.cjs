'use strict'

const fsPromises = require('node:fs/promises')

const { observeAgentRequests } = require('./agent-request-watcher.cjs')
const { criarRepositorioDePedidos } = require('./fetch-all/agent-requests.cjs')
const { createCanvasRepository } = require('./storage/canvas-repository.cjs')
const { redactSensitiveText } = require('./git-secret-redaction.cjs')
const { lerElemento, listarElementos } = require('./canvas-agent-read.cjs')

const LISTAR_ACTION = 'canvas-listar'
const LER_ACTION = 'canvas-ler'

/**
 * Consome os pedidos de leitura do canvas pela mesma fila de intenções do
 * Fetch All/navegador (`agent-requests.cjs`) — mesmo canal, ação nova.
 *
 * Diferente de `executar-plano` (que espera um clique no painel) e igual a
 * `abrir-pagina`: leitura é resolvida sozinha, sem confirmação humana. O
 * ponto de atenção da task ("maior risco de segurança: prompt injection")
 * é sobre ESCREVER — uma fatia futura, ainda não implementada — não sobre
 * listar/ler, que não tem efeito nenhum no canvas ou fora dele.
 *
 * @param {{ database: unknown, appPaths: { agentRequests: string, canvasFiles: string }, getTerminalLogStore: () => { getSessions: () => Promise<unknown[]> } | null }} options
 * @returns {{ pedidos: object, processPending: () => Promise<void>, pararDeObservarPedidos: () => void }}
 */
function registerAgentCanvasReadIpcHandlers({ database, appPaths, getTerminalLogStore, dependencies = {} }) {
  const pedidos = (dependencies.createRequests ?? criarRepositorioDePedidos)({ pasta: appPaths.agentRequests })
  const canvasRepository = dependencies.canvasRepository ?? createCanvasRepository(database)
  const readFile = dependencies.readFile ?? ((filePath) => fsPromises.readFile(filePath, 'utf8'))
  const redact = dependencies.redact ?? redactSensitiveText

  let processing = false
  let queued = false

  function schedule() {
    if (processing) {
      queued = true
      return
    }
    processing = true
    void processPending()
      .catch(() => {})
      .finally(() => {
        processing = false
        if (queued) {
          queued = false
          schedule()
        }
      })
  }

  const watcher = observeAgentRequests(appPaths.agentRequests, schedule)
  schedule()

  async function processPending() {
    const pendentes = [
      ...pedidos.listarPendentes({ acao: LISTAR_ACTION }),
      ...pedidos.listarPendentes({ acao: LER_ACTION }),
    ]
    if (pendentes.length === 0) return

    const nodes = canvasRepository.list()

    for (const pedido of pendentes) {
      if (pedido.acao === LISTAR_ACTION) {
        pedidos.resolver(pedido.id, { aceito: true, resultado: { ok: true, elementos: listarElementos(nodes) } })
        continue
      }

      const sessions = await carregarSessoesDeTerminal(getTerminalLogStore)
      const resultado = await lerElemento({
        id: pedido.idDoElemento,
        nodes,
        terminalSessions: sessions,
        readFile,
        redact,
        canvasFilesDir: appPaths.canvasFiles,
      })
      pedidos.resolver(pedido.id, { aceito: true, resultado })
    }
  }

  return {
    pedidos,
    processPending,
    pararDeObservarPedidos: () => watcher?.close(),
  }
}

/** O log store nasce depois do primeiro `whenReady`; um pedido que chegar antes disso só vê sessões vazias, nunca quebra. */
async function carregarSessoesDeTerminal(getTerminalLogStore) {
  const store = typeof getTerminalLogStore === 'function' ? getTerminalLogStore() : null
  if (!store) return []
  try {
    return await store.getSessions()
  } catch {
    return []
  }
}

module.exports = { LER_ACTION, LISTAR_ACTION, registerAgentCanvasReadIpcHandlers }
