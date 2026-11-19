'use strict'

const electron = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const { observeAgentRequests } = require('./agent-request-watcher.cjs')
const { NAO_E_BLOCO, guestValido, inspecionarPagina } = require('./agent-webpage-inspect.cjs')
const { TIPOS_INSPECAO_PAGINA, criarRepositorioDePedidos, pedidoAindaVale } = require('./fetch-all/agent-requests.cjs')

const INSPECIONAR_ACTION = 'pagina-inspecionar'
/** Avisa a interface que a fila de pedidos de inspeção mudou. */
const REQUESTS_CHANNEL = 'agent-webpage:requests'

const NAO_PENDENTE = 'Esse pedido não está mais pendente.'
const EM_ANDAMENTO = 'Esse pedido já está sendo atendido.'
const MUDOU = 'O pedido mudou depois de aparecer no cartão. Confira de novo.'
const EXPIROU = 'O pedido expirou sem resposta da pessoa.'

/**
 * Pedidos de agente para olhar um bloco Página Web (`felixo browser capture` e
 * `felixo browser read`), pela mesma fila de intenções.
 *
 * Nunca atende sozinho: a página pode estar logada como a pessoa, e o que ela
 * mostra (mensagens, dados pessoais) iria ao provedor do agente. O pedido
 * fica pendente até a pessoa permitir no cartão; permitir vale para esse
 * pedido, uma vez. O renderer manda o id do webContents do bloco (só ele sabe
 * qual bloco é qual), e o main confere que é um <webview> da janela principal
 * antes de olhar. O resultado fica no arquivo do pedido: é também o registro
 * de quem pediu o quê, em qual bloco e quando.
 *
 * @param {{ getMainWindow: () => import('electron').BrowserWindow | undefined, appPaths: { agentRequests: string, userData?: string }, dependencies?: object }} options
 */
function registerAgentWebpageInspectIpcHandlers({ getMainWindow, appPaths, dependencies = {} }) {
  const agora = dependencies.agora ?? (() => Date.now())
  const pedidos = (dependencies.createRequests ?? criarRepositorioDePedidos)({ pasta: appPaths.agentRequests, agora })
  const ipcMain = dependencies.ipcMain ?? electron.ipcMain
  const fromId = dependencies.fromId ?? ((id) => electron.webContents.fromId(id))
  const inspecionar = dependencies.inspecionarPagina ?? inspecionarPagina
  const pastaCapturas = dependencies.pastaCapturas ?? path.join(path.dirname(appPaths.agentRequests), 'agent-captures')
  const emAndamento = new Set()
  varrerCapturasVelhas(pastaCapturas, agora())

  /** O que o cartão mostra: só pedido de formato bom e que ainda vale. */
  function listRequests() {
    return pedidos
      .listarPendentes({ acao: INSPECIONAR_ACTION })
      .filter((pedido) => pedidoAindaVale(pedido, agora()) && formatoBom(pedido))
      .map(paraOCartao)
  }

  function avisar() {
    const window = getMainWindow?.()
    if (window && !window.isDestroyed?.()) window.webContents.send(REQUESTS_CHANNEL, { requests: listRequests() })
  }

  /**
   * A escolha da pessoa. `aprovar: false` recusa. `idDoElemento` e `tipo` são o
   * que o cartão mostrou: só provam que a pessoa viu o que está gravado agora.
   *
   * @param {{ id?: unknown, aprovar?: unknown, idDoElemento?: unknown, tipo?: unknown, webContentsId?: unknown }} params
   */
  async function decide(params) {
    const id = typeof params?.id === 'string' ? params.id.trim() : ''
    if (!id) return { resolved: null, message: NAO_PENDENTE }
    if (emAndamento.has(id)) return { resolved: null, message: EM_ANDAMENTO }
    emAndamento.add(id)
    try {
      return await atender(id, params)
    } finally {
      emAndamento.delete(id)
      avisar()
    }
  }

  async function atender(id, params) {
    const pedido = pedidos.ler(id)
    if (!pedido || pedido.id !== id || pedido.estado !== 'pendente' || pedido.acao !== INSPECIONAR_ACTION) {
      return { resolved: null, message: NAO_PENDENTE }
    }
    if (!formatoBom(pedido)) {
      return { resolved: recusar(pedido, { message: 'Pedido malformado.' }), message: MUDOU }
    }
    if (params?.idDoElemento !== pedido.idDoElemento || params?.tipo !== pedido.tipo) {
      return { resolved: null, message: MUDOU }
    }
    if (!pedidoAindaVale(pedido, agora())) {
      return { resolved: recusar(pedido, { expirou: true, message: EXPIROU }), message: EXPIROU }
    }

    if (params?.aprovar !== true) {
      return {
        resolved: recusar(pedido, { recusadoPor: 'pessoa', message: 'A pessoa recusou o pedido.' }),
      }
    }

    const guest = typeof params?.webContentsId === 'number' ? fromId(params.webContentsId) : null
    if (!guestValido(guest, getMainWindow?.())) {
      // Não resolve: a pessoa pode abrir o bloco e tentar de novo, ou recusar.
      return { ok: false, message: NAO_E_BLOCO }
    }

    let resultado
    try {
      resultado = await inspecionar({ guest, tipo: pedido.tipo, pastaCapturas, idDoPedido: pedido.id, seletor: pedido.seletor, profundidade: pedido.profundidade })
    } catch (error) {
      return { ok: false, message: error instanceof Error && error.message ? error.message : 'Não foi possível olhar a página.' }
    }
    return { resolved: pedidos.resolver(pedido.id, { aceito: true, resultado }) }
  }

  function recusar(pedido, resultado) {
    return pedidos.resolver(pedido.id, { aceito: false, resultado: { ok: false, ...resultado } })
  }

  ipcMain?.handle?.('agent-webpage:list-requests', () => guard(() => ({ requests: listRequests() })))
  ipcMain?.handle?.('agent-webpage:decide', (_event, params) => guardAsync(() => decide(params)))

  const watcher = (dependencies.observeRequests ?? observeAgentRequests)(appPaths.agentRequests, avisar)
  return { pedidos, listRequests, decide, pararDeObservarPedidos: () => watcher?.close() }
}

/**
 * A captura de uma página logada não fica no disco além do dia: some o que
 * passa de 24 h. `unlinkSync`, não `rmSync` (que falha mudo em caminho com acento).
 */
function varrerCapturasVelhas(pasta, instante) {
  try {
    for (const nome of fs.readdirSync(pasta)) {
      const arquivo = path.join(pasta, nome)
      if (instante - fs.statSync(arquivo).mtimeMs > 24 * 60 * 60 * 1000) fs.unlinkSync(arquivo)
    }
  } catch {
    // Pasta que ainda não existe: nada a varrer.
  }
}

function formatoBom(pedido) {
  return (
    typeof pedido.idDoElemento === 'string' &&
    pedido.idDoElemento !== '' &&
    TIPOS_INSPECAO_PAGINA.includes(pedido.tipo) &&
    typeof pedido.pedidoEm === 'string'
  )
}

function paraOCartao(pedido) {
  return {
    id: pedido.id,
    idDoElemento: pedido.idDoElemento,
    tipo: pedido.tipo,
    origem: typeof pedido.origem === 'string' ? pedido.origem : '',
    pedidoEm: pedido.pedidoEm,
  }
}

function guard(run) {
  try {
    return { ok: true, ...run() }
  } catch (error) {
    return { ok: false, message: error instanceof Error && error.message ? error.message : 'Falha ao ler os pedidos.' }
  }
}

async function guardAsync(run) {
  try {
    const resultado = await run()
    return { ok: true, ...resultado }
  } catch (error) {
    return { ok: false, message: error instanceof Error && error.message ? error.message : 'Falha ao atender o pedido.' }
  }
}

module.exports = { INSPECIONAR_ACTION, REQUESTS_CHANNEL, registerAgentWebpageInspectIpcHandlers }
