'use strict'

const { ipcMain } = require('electron')

const { observeAgentRequests } = require('./agent-request-watcher.cjs')
const { AGENTES_LOTE_MAX, criarRepositorioDePedidos, pedidoAindaVale } = require('./fetch-all/agent-requests.cjs')
const { DEFAULT_LIMITS } = require('./orchestration/orchestration-store.cjs')
const { createOrchestratorSettingsStore } = require('./orchestrator-settings-store.cjs')

const LAUNCH_ACTION = 'abrir-agentes'

/** Avisa a interface que um coordenador pediu agentes e espera a pessoa. */
const LAUNCHES_CHANNEL = 'canvas:agent-launches'

const NAO_PENDENTE = 'Esse pedido não está mais pendente.'
const EXPIROU = 'O pedido expirou sem resposta da pessoa.'
const SOMENTE_LEITURA = 'O orquestrador está em "Somente leitura": nenhum agente é aberto.'

/**
 * Decide quantas tasks do pedido viram terminal, pelos tetos do orquestrador:
 * "Agentes por rodada" limita o pedido e "Agentes no total" limita a soma do
 * que o app já abriu. O que passa do teto é recusado, com o motivo, e o
 * coordenador lê isso para pedir de novo na rodada seguinte. Função pura.
 *
 * @param {{ titulo: string }[]} tarefas
 * @param {{ maxAgentsPerTurn?: number, maxTotalAgents?: number, mode?: string }} settings
 * @param {number} jaAbertos - Agentes que o app já abriu por pedido nesta sessão.
 * @returns {{ abrir: number, recusadas: { titulo: string, motivo: string }[] }}
 */
function planLaunch(tarefas, settings, jaAbertos) {
  if (settings?.mode === 'read_only') {
    return { abrir: 0, recusadas: tarefas.map(({ titulo }) => ({ titulo, motivo: SOMENTE_LEITURA })) }
  }

  const porRodada = positivo(settings?.maxAgentsPerTurn) ?? DEFAULT_LIMITS.maxAgentsPerTurn
  const noTotal = positivo(settings?.maxTotalAgents) ?? DEFAULT_LIMITS.maxTotalAgents
  const restanteNoTotal = Math.max(0, noTotal - jaAbertos)
  const abrir = Math.min(tarefas.length, porRodada, restanteNoTotal)
  // O teto que mais restringe é o que explica o corte.
  const motivo =
    restanteNoTotal < porRodada
      ? `Teto "Agentes no total" (${noTotal}) atingido: ${jaAbertos} já abertos.`
      : `Teto "Agentes por rodada" (${porRodada}) atingido.`

  return {
    abrir,
    recusadas: tarefas.slice(abrir).map(({ titulo }) => ({ titulo, motivo })),
  }
}

function positivo(valor) {
  const numero = Number(valor)
  return Number.isInteger(numero) && numero > 0 ? numero : undefined
}

/**
 * Pedidos de um coordenador para abrir um agente por task
 * (`felixo canvas abrir-agentes`). Nunca se resolve sozinho: espera a pessoa
 * aceitar no painel de aprovações, e o orquestrador não executa nada — só
 * propõe as tasks.
 *
 * O que chega do renderer é o id e a escolha. As tasks que viram terminal são
 * relidas do pedido gravado aqui, e o corte pelos tetos acontece aqui, com as
 * configurações salvas: o renderer nunca escolhe o que abre nem quantos.
 *
 * @param {{ getMainWindow: () => import('electron').BrowserWindow | undefined, appPaths: { agentRequests: string, config?: string }, database?: object, dependencies?: object }} options
 */
function registerAgentLaunchIpcHandlers({ getMainWindow, appPaths, database, dependencies = {} }) {
  const pedidos = (dependencies.createRequests ?? criarRepositorioDePedidos)({ pasta: appPaths.agentRequests })
  const agora = dependencies.agora ?? (() => Date.now())
  const ipc = dependencies.ipcMain ?? ipcMain
  const loadSettings =
    dependencies.loadSettings ??
    (() => createOrchestratorSettingsStore({ configDir: appPaths.config, database }).load())
  /** Soma dos agentes abertos por pedido desde que o app abriu (teto "Agentes no total"). */
  let abertos = 0
  /** Ids com uma decisão em curso: um clique duplo não abre duas vezes. */
  const emAndamento = new Set()

  const pendentes = () => pedidos.listarPendentes({ acao: LAUNCH_ACTION })

  const watcher = (dependencies.observeRequests ?? observeAgentRequests)(appPaths.agentRequests, () => {
    const window = getMainWindow?.()
    if (window && !window.isDestroyed()) {
      window.webContents.send(LAUNCHES_CHANNEL, { requests: pendentes() })
    }
  })

  ipc.handle('canvas:list-agent-launches', () => guard('Falha ao ler os pedidos de agentes.', () => ({ requests: pendentes() })))

  ipc.handle('canvas:decide-agent-launch', (_event, params) =>
    guard('Falha ao decidir o pedido de agentes.', async () => {
      const id = typeof params?.id === 'string' ? params.id.trim() : ''
      const pedido = id ? pedidos.ler(id) : null
      if (!pedido || pedido.estado !== 'pendente' || pedido.acao !== LAUNCH_ACTION) {
        return { resolved: null, abrir: [], message: NAO_PENDENTE }
      }
      if (emAndamento.has(id)) return { resolved: null, abrir: [], message: 'Esse pedido já está sendo atendido.' }
      emAndamento.add(id)

      try {
        if (!pedidoAindaVale(pedido, agora())) {
          const resolved = pedidos.resolver(id, {
            aceito: false,
            resultado: { ok: false, recusadoPor: 'app', expirou: true, message: EXPIROU },
          })
          return { resolved, abrir: [], message: EXPIROU }
        }

        if (params?.aceitar !== true) {
          const resolved = pedidos.resolver(id, {
            aceito: false,
            resultado: { ok: false, recusadoPor: 'pessoa', message: 'A pessoa recusou abrir os agentes.' },
          })
          return { resolved, abrir: [] }
        }

        const settings = await loadSettings().catch(() => null)
        const plano = planLaunch(pedido.tarefas, settings, abertos)
        if (plano.abrir === 0) {
          const message = plano.recusadas[0]?.motivo ?? 'Nenhum agente pôde ser aberto.'
          const resolved = pedidos.resolver(id, {
            aceito: false,
            resultado: { ok: false, recusadoPor: 'app', message, recusadas: plano.recusadas },
          })
          return { resolved, abrir: [], recusadas: plano.recusadas, message }
        }

        abertos += plano.abrir
        const resolved = pedidos.resolver(id, {
          aceito: true,
          resultado: { ok: true, abertas: plano.abrir, recusadas: plano.recusadas },
        })
        return { resolved, abrir: pedido.tarefas.slice(0, plano.abrir), recusadas: plano.recusadas }
      } finally {
        emAndamento.delete(id)
      }
    }),
  )

  // Lote que a própria pessoa escreveu no painel Orquestrador: o clique dela já é o aceite, mas os
  // tetos valem do mesmo jeito e somam no mesmo contador do pedido de um coordenador. Só quantidade:
  // o texto das tasks nunca passa por aqui.
  ipc.handle('canvas:plan-agent-launch', (_event, params) =>
    guard('Falha ao planejar a abertura dos agentes.', async () => {
      const count = Number(params?.count)
      if (!Number.isInteger(count) || count < 1 || count > AGENTES_LOTE_MAX) {
        return { abrir: 0, message: 'Quantidade de tasks inválida.' }
      }
      const settings = await loadSettings().catch(() => null)
      const plano = planLaunch(Array.from({ length: count }, () => ({ titulo: '' })), settings, abertos)
      abertos += plano.abrir
      return { abrir: plano.abrir, ...(plano.recusadas[0] ? { message: plano.recusadas[0].motivo } : {}) }
    }),
  )

  return { pedidos, pararDeObservarPedidos: () => watcher?.close() }
}

async function guard(fallbackMessage, run) {
  try {
    return { ok: true, ...(await run()) }
  } catch (error) {
    return { ok: false, message: error instanceof Error && error.message ? error.message : fallbackMessage }
  }
}

module.exports = { LAUNCH_ACTION, LAUNCHES_CHANNEL, planLaunch, registerAgentLaunchIpcHandlers }
