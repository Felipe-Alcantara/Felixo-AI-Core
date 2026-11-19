'use strict'

const electron = require('electron')

const { observeAgentRequests } = require('./agent-request-watcher.cjs')
const { agirNaPagina } = require('./agent-webpage-act.cjs')
const { NAO_E_BLOCO, guestValido } = require('./agent-webpage-inspect.cjs')
const { TECLAS_PAGINA, criarRepositorioDePedidos, pedidoAindaVale } = require('./fetch-all/agent-requests.cjs')

const AGIR_ACTION = 'pagina-agir'
/** Avisa a interface que a fila de pedidos de ação mudou. */
const REQUESTS_CHANNEL = 'agent-webpage-act:requests'
/** Avisa a interface que as sessões curtas mudaram (abriu, acabou ou a pessoa encerrou). */
const SESSIONS_CHANNEL = 'agent-webpage-act:sessions'
/** Quanto dura a sessão que a pessoa abre: depois disso o agente precisa pedir de novo. */
const SESSAO_DURACAO_MS = 5 * 60 * 1000

const NAO_PENDENTE = 'Esse pedido não está mais pendente.'
const EM_ANDAMENTO = 'Esse pedido já está sendo atendido.'
const MUDOU = 'O pedido mudou depois de aparecer no cartão. Confira de novo.'
const EXPIROU = 'O pedido expirou sem resposta da pessoa.'
const SEM_CONFIRMACAO = 'Esse campo pede a sua confirmação para o agente digitar nele.'

/**
 * Pedidos de agente para clicar e digitar num bloco Página Web
 * (`felixo browser click` e `felixo browser type`).
 *
 * A pessoa libera um bloco por uma sessão curta: dentro dela o app atende
 * sozinho; fora dela, cada pedido espera o cartão. A sessão é por bloco, só
 * existe na memória do app (fechar o app a encerra) e a pessoa pode encerrar
 * na hora. Digitar em campo de senha, de pagamento ou em quadro interno não
 * entra na sessão: cada vez pede uma confirmação. O texto digitado nunca vai
 * para o cartão, o resultado nem o disco depois do desfecho.
 *
 * @param {{ getMainWindow: () => import('electron').BrowserWindow | undefined, appPaths: { agentRequests: string }, dependencies?: object }} options
 */
function registerAgentWebpageActIpcHandlers({ getMainWindow, appPaths, dependencies = {} }) {
  const agora = dependencies.agora ?? (() => Date.now())
  const pedidos = (dependencies.createRequests ?? criarRepositorioDePedidos)({ pasta: appPaths.agentRequests, agora })
  const ipcMain = dependencies.ipcMain ?? electron.ipcMain
  const fromId = dependencies.fromId ?? ((id) => electron.webContents.fromId(id))
  const agir = dependencies.agirNaPagina ?? agirNaPagina
  const duracaoMs = dependencies.sessaoDuracaoMs ?? SESSAO_DURACAO_MS
  const emAndamento = new Set()
  /** idDoElemento -> { guestId, expiraEm, timer } */
  const sessoes = new Map()
  /** id do pedido -> tipo de campo que espera a confirmação da pessoa. */
  const aguardandoCampo = new Map()

  function sessaoAtiva(idDoElemento) {
    const sessao = sessoes.get(idDoElemento)
    if (!sessao) return null
    if (agora() >= sessao.expiraEm) {
      encerrarSessao(idDoElemento)
      return null
    }
    return sessao
  }

  function iniciarSessao(idDoElemento, guestId) {
    const anterior = sessoes.get(idDoElemento)
    if (anterior) clearTimeout(anterior.timer)
    const timer = setTimeout(() => encerrarSessao(idDoElemento), duracaoMs)
    timer.unref?.()
    sessoes.set(idDoElemento, { guestId, expiraEm: agora() + duracaoMs, timer })
    avisarSessoes()
  }

  function encerrarSessao(idDoElemento) {
    const sessao = sessoes.get(idDoElemento)
    if (!sessao) return { encerrada: false }
    clearTimeout(sessao.timer)
    sessoes.delete(idDoElemento)
    avisarSessoes()
    avisar()
    return { encerrada: true }
  }

  function listSessions() {
    return [...sessoes.keys()]
      .map((idDoElemento) => sessaoAtiva(idDoElemento) && { idDoElemento, expiraEm: sessoes.get(idDoElemento).expiraEm })
      .filter(Boolean)
  }

  /** O que o cartão mostra: o que ainda precisa da pessoa (sem sessão, ou campo sensível). */
  function listRequests() {
    return pedidosPendentes()
      .filter((pedido) => aguardandoCampo.has(pedido.id) || !sessaoAtiva(pedido.idDoElemento))
      .map((pedido) => paraOCartao(pedido, aguardandoCampo.get(pedido.id)))
  }

  function pedidosPendentes() {
    return pedidos
      .listarPendentes({ acao: AGIR_ACTION })
      .filter((pedido) => pedidoAindaVale(pedido, agora()) && formatoBom(pedido))
  }

  function janelaViva() {
    const window = getMainWindow?.()
    return window && !window.isDestroyed?.() ? window : null
  }

  function avisar() {
    janelaViva()?.webContents.send(REQUESTS_CHANNEL, { requests: listRequests() })
  }

  function avisarSessoes() {
    janelaViva()?.webContents.send(SESSIONS_CHANNEL, { sessions: listSessions() })
  }

  /** Dentro da sessão, o pedido é atendido sem cartão. */
  async function atenderDaSessao() {
    for (const pedido of pedidosPendentes()) {
      const sessao = sessaoAtiva(pedido.idDoElemento)
      if (!sessao || aguardandoCampo.has(pedido.id) || emAndamento.has(pedido.id)) continue
      const guest = fromId(sessao.guestId)
      if (!guestValido(guest, getMainWindow?.())) {
        // O bloco recarregou ou fechou: a sessão não vale mais, e o pedido volta ao cartão.
        encerrarSessao(pedido.idDoElemento)
        continue
      }
      emAndamento.add(pedido.id)
      try {
        await executar(pedido, guest, false)
      } finally {
        emAndamento.delete(pedido.id)
      }
    }
    avisar()
  }

  /** Executa e dá o desfecho; só deixa o pedido pendente quando falta a confirmação do campo. */
  async function executar(pedido, guest, confirmouCampoSensivel) {
    let resultado
    try {
      resultado = await agir({
        guest,
        tipo: pedido.tipo,
        x: pedido.x,
        y: pedido.y,
        texto: pedido.texto,
        dy: pedido.dy,
        tecla: pedido.tecla,
        confirmouCampoSensivel,
      })
    } catch (error) {
      resultado = { ok: false, message: error instanceof Error && error.message ? error.message : 'Não foi possível agir na página.' }
    }
    if (resultado.precisaConfirmar) {
      aguardandoCampo.set(pedido.id, resultado.precisaConfirmar)
      return { resolved: null }
    }
    aguardandoCampo.delete(pedido.id)
    return { resolved: pedidos.resolver(pedido.id, { aceito: resultado.ok === true, resultado }) }
  }

  /**
   * A escolha da pessoa. `aprovar: false` recusa. Aprovar abre a sessão do
   * bloco (se não houver) e atende o pedido; num campo sensível, só digita
   * com `confirmarCampo: true`.
   *
   * @param {{ id?: unknown, aprovar?: unknown, idDoElemento?: unknown, tipo?: unknown, webContentsId?: unknown, confirmarCampo?: unknown }} params
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
    if (!pedido || pedido.id !== id || pedido.estado !== 'pendente' || pedido.acao !== AGIR_ACTION) {
      return { resolved: null, message: NAO_PENDENTE }
    }
    if (!formatoBom(pedido)) return { resolved: recusar(pedido, { message: 'Pedido malformado.' }), message: MUDOU }
    if (params?.idDoElemento !== pedido.idDoElemento || params?.tipo !== pedido.tipo) return { resolved: null, message: MUDOU }
    if (!pedidoAindaVale(pedido, agora())) {
      return { resolved: recusar(pedido, { expirou: true, message: EXPIROU }), message: EXPIROU }
    }
    if (params?.aprovar !== true) {
      return { resolved: recusar(pedido, { recusadoPor: 'pessoa', message: 'A pessoa recusou o pedido.' }) }
    }
    if (aguardandoCampo.has(pedido.id) && params?.confirmarCampo !== true) return { ok: false, message: SEM_CONFIRMACAO }

    const sessao = sessaoAtiva(pedido.idDoElemento)
    const guest = fromId(sessao?.guestId ?? (typeof params?.webContentsId === 'number' ? params.webContentsId : -1))
    if (!guestValido(guest, getMainWindow?.())) {
      // Não resolve: a pessoa pode abrir o bloco e tentar de novo, ou recusar.
      return { ok: false, message: NAO_E_BLOCO }
    }
    if (!sessao) iniciarSessao(pedido.idDoElemento, guest.id)
    return executar(pedido, guest, aguardandoCampo.has(pedido.id) && params?.confirmarCampo === true)
  }

  function recusar(pedido, resultado) {
    aguardandoCampo.delete(pedido.id)
    return pedidos.resolver(pedido.id, { aceito: false, resultado: { ok: false, ...resultado } })
  }

  function aoMudarAFila() {
    void atenderDaSessao().catch(() => avisar())
  }

  ipcMain?.handle?.('agent-webpage-act:list-requests', () => guard(() => ({ requests: listRequests() })))
  ipcMain?.handle?.('agent-webpage-act:decide', (_event, params) => guardAsync(() => decide(params)))
  ipcMain?.handle?.('agent-webpage-act:list-sessions', () => guard(() => ({ sessions: listSessions() })))
  ipcMain?.handle?.('agent-webpage-act:end-session', (_event, params) =>
    guard(() => encerrarSessao(typeof params?.idDoElemento === 'string' ? params.idDoElemento : '')),
  )

  const watcher = (dependencies.observeRequests ?? observeAgentRequests)(appPaths.agentRequests, () => {
    aoMudarAFila()
    avisar()
  })
  return {
    pedidos,
    listRequests,
    listSessions,
    decide,
    encerrarSessao,
    aoMudarAFila: atenderDaSessao,
    pararDeObservarPedidos: () => {
      for (const idDoElemento of [...sessoes.keys()]) encerrarSessao(idDoElemento)
      watcher?.close()
    },
  }
}

function formatoBom(pedido) {
  return (
    typeof pedido.idDoElemento === 'string' &&
    pedido.idDoElemento !== '' &&
    typeof pedido.pedidoEm === 'string' &&
    ((pedido.tipo === 'clicar' && Number.isFinite(pedido.x) && Number.isFinite(pedido.y)) ||
      (pedido.tipo === 'digitar' && typeof pedido.texto === 'string' && pedido.texto !== '') ||
      (pedido.tipo === 'rolar' && Number.isFinite(pedido.dy) && pedido.dy !== 0) ||
      (pedido.tipo === 'tecla' && TECLAS_PAGINA.includes(pedido.tecla)))
  )
}

/** O cartão nunca recebe o texto: só quantos caracteres. */
function paraOCartao(pedido, campoSensivel) {
  return {
    id: pedido.id,
    idDoElemento: pedido.idDoElemento,
    tipo: pedido.tipo,
    ...(pedido.tipo === 'clicar'
      ? { x: pedido.x, y: pedido.y }
      : pedido.tipo === 'rolar'
        ? { dy: pedido.dy }
        : pedido.tipo === 'tecla'
          ? { tecla: pedido.tecla }
          : { caracteres: pedido.texto.length }),
    ...(campoSensivel ? { campoSensivel } : {}),
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
    return { ok: true, ...(await run()) }
  } catch (error) {
    return { ok: false, message: error instanceof Error && error.message ? error.message : 'Falha ao atender o pedido.' }
  }
}

module.exports = {
  AGIR_ACTION,
  REQUESTS_CHANNEL,
  SESSAO_DURACAO_MS,
  SESSIONS_CHANNEL,
  registerAgentWebpageActIpcHandlers,
}
