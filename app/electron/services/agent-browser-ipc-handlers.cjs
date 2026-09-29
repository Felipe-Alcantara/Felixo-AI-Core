'use strict'

const electron = require('electron')

const { observeAgentRequests } = require('./agent-request-watcher.cjs')
const { openExternalUrl } = require('./external-links.cjs')
const { EXTERNAL_WEB_SCHEMES, classifyExternalUrl } = require('./external-url-policy.cjs')
const {
  MODOS_ABERTURA_PAGINA,
  criarRepositorioDePedidos,
} = require('./fetch-all/agent-requests.cjs')

const BROWSER_REQUEST_ACTION = 'abrir-pagina'
/** Abre um bloco Página Web no canvas (o renderer cria o nó). */
const BROWSER_OPEN_CHANNEL = 'agent-browser:open-webpage'
/** Avisa a interface que a fila de pedidos de abertura mudou. */
const BROWSER_REQUESTS_CHANNEL = 'agent-browser:requests'
const DESTINOS = ['externo', 'embutido']

const URL_FORA_DA_WEB = 'A URL do pedido nao e http:// ou https://.'
const NAO_PENDENTE = 'Esse pedido não está mais pendente.'
const EM_ANDAMENTO = 'Esse pedido já está sendo atendido.'
const MUDOU = 'O pedido mudou depois de aparecer no cartão. Confira de novo.'

/**
 * Pedidos de agente para abrir uma página (`felixo browser open`), pela mesma
 * fila de intenções do Fetch All.
 *
 * Nenhum pedido abre sozinho: uma URL que um agente pede — talvez depois de
 * ler uma página que o enganou — iria direto para o navegador logado da
 * pessoa. O pedido válido fica pendente até a pessoa escolher no cartão do
 * canvas: navegador, Página Web ou recusar. O destino que o agente sugeriu
 * (`--embedded`) só vem marcado; quem decide é a pessoa.
 *
 * O que chega do renderer é o id, o destino e o que o cartão mostrou (URL e
 * perfil). A URL e o perfil abertos são relidos do pedido gravado e passam de
 * novo pela política: o renderer nunca escolhe o endereço, só confirma o que
 * viu — se o arquivo mudou depois de aparecer no cartão, nada abre.
 *
 * Pedido que não tem o que perguntar é recusado na hora, como antes: formato
 * que o `felixo browser open` não grava, URL fora da web e perfil que não
 * existe. Um arquivo torto na pasta nunca derruba o registro nem chega ao
 * renderer.
 *
 * @param {() => import('electron').BrowserWindow | undefined} getMainWindow
 * @param {{ agentRequests: string }} appPaths
 * @param {{ createRequests?: typeof criarRepositorioDePedidos, shell?: object, openExternal?: Function, findProfileByName?: Function, ipcMain?: { handle: Function }, logger?: { warn: (message: string) => void } }} [dependencies]
 */
function registerAgentBrowserIpcHandlers(getMainWindow, appPaths, dependencies = {}) {
  const pedidos = (dependencies.createRequests ?? criarRepositorioDePedidos)({
    pasta: appPaths.agentRequests,
  })
  const openExternal =
    dependencies.openExternal ??
    ((url) => openExternalUrl(url, dependencies.shell ?? electron.shell))
  const ipcMain = dependencies.ipcMain ?? electron.ipcMain
  const logger = dependencies.logger ?? console
  /** Ids com uma decisão em curso (ver `decide`). */
  const emAndamento = new Set()
  /**
   * Pedidos que já passaram pela chegada e estão no cartão. O perfil é
   * conferido uma vez, quando o pedido chega: depois disso a pessoa já o viu,
   * e um perfil apagado não o recusa pelas costas dela — a Página Web falha
   * explicada, e o navegador e recusar continuam valendo.
   */
  let admitidos = new Set()

  /**
   * Recusa o que não tem o que perguntar; o resto fica para a pessoa.
   *
   * Nunca lança: roda no registro, durante o boot do main, e a cada evento
   * da pasta. Um pedido que falha não impede os outros de serem vistos.
   */
  function processPending() {
    try {
      const vistos = new Set()
      for (const pedido of pedidos.listarPendentes({ acao: BROWSER_REQUEST_ACTION })) {
        try {
          if (triarNaChegada(pedido)) vistos.add(pedido.id)
        } catch (error) {
          avisarFalha(`o pedido ${pedido.id}`, error)
        }
      }
      admitidos = vistos
      notifyRenderer()
    } catch (error) {
      avisarFalha('a fila de pedidos', error)
    }
  }

  /** Recusa na hora o que não tem o que perguntar. `true` = fica para a pessoa. */
  function triarNaChegada(pedido) {
    const leitura = lerParaOCartao(pedido)
    if (!leitura.ok) {
      recusarPeloApp(pedido, leitura.recusa)
      return false
    }

    // Perfil pedido por NOME. Perfil que não existe falha explicitamente:
    // cair no Padrão abriria a página numa sessão logada que o agente não
    // escolheu — o oposto de isolar.
    const { perfil, url } = leitura.item
    if (perfil && !admitidos.has(pedido.id) && !resolveProfileId(perfil, dependencies.findProfileByName)) {
      recusarPeloApp(pedido, {
        modo: 'embutido',
        url,
        message: `O perfil "${perfil}" nao existe no navegador interno.`,
      })
      return false
    }
    return true
  }

  /**
   * Recusa sem perguntar à pessoa. `recusadoPor: 'app'` diz ao agente que a
   * pessoa não viu o pedido: o motivo é do app, não uma resposta dela.
   */
  function recusarPeloApp(pedido, resultado) {
    return pedidos.resolver(pedido.id, {
      aceito: false,
      resultado: { ok: false, recusadoPor: 'app', ...resultado },
    })
  }

  /**
   * O log leva o id e o motivo, nunca a URL: ela pode ter token de convite,
   * link assinado ou senha (a mesma regra do opener em `external-links`).
   */
  function avisarFalha(onde, error) {
    const motivo = error instanceof Error && error.message ? error.message : 'erro desconhecido'
    logger.warn(`[agent-browser] Falha ao processar ${onde}: ${motivo}`)
  }

  /** O que o cartão mostra: só pedidos válidos, com a URL já serializada. */
  function listRequests() {
    return pedidos
      .listarPendentes({ acao: BROWSER_REQUEST_ACTION })
      .map(lerParaOCartao)
      .filter((leitura) => leitura.ok)
      .map((leitura) => leitura.item)
  }

  function notifyRenderer() {
    const webContents = windowReadyContents(getMainWindow?.())
    webContents?.send(BROWSER_REQUESTS_CHANNEL, { requests: listRequests() })
  }

  /**
   * A escolha da pessoa. `destino` nulo = recusar.
   *
   * `url` e `perfil` são o que o cartão mostrou. Não escolhem nada: só provam
   * que a pessoa viu o pedido que está gravado agora. Sem isso, um arquivo
   * reescrito entre o cartão aparecer e o clique abriria outra URL — ou outro
   * perfil, outra sessão logada — com a confirmação dada ao primeiro.
   *
   * @param {{ id?: unknown, destino?: unknown, url?: unknown, perfil?: unknown }} params
   */
  async function decide(params) {
    const id = typeof params?.id === 'string' ? params.id.trim() : ''
    if (!id) return { resolved: null, message: NAO_PENDENTE }

    // Reservado antes de qualquer await: o estado só é gravado depois de o
    // navegador responder, e um segundo clique nesse meio ainda leria o pedido
    // como pendente e abriria a página de novo.
    if (emAndamento.has(id)) return { resolved: null, message: EM_ANDAMENTO }
    emAndamento.add(id)
    try {
      return await atender(id, params)
    } finally {
      emAndamento.delete(id)
      notifyRenderer()
    }
  }

  async function atender(id, params) {
    const pedido = pedidos.ler(id)
    if (!pedido || pedido.estado !== 'pendente' || pedido.acao !== BROWSER_REQUEST_ACTION) {
      return { resolved: null, message: NAO_PENDENTE }
    }

    const destino = params?.destino ?? null
    if (destino !== null && !DESTINOS.includes(destino)) {
      return { resolved: null, message: 'Destino inválido para esse pedido.' }
    }

    // Relido e revalidado agora. Torto também é mudança: o cartão só mostra
    // pedido bom, e a próxima varredura recusa o que entortou.
    const leitura = lerParaOCartao(pedido)
    if (!leitura.ok || !mesmoQueOCartaoMostrou(leitura.item, params)) {
      return { resolved: null, message: MUDOU }
    }

    return carryOut(pedido, leitura.item, destino)
  }

  /**
   * Executa a escolha. Só a recusa e a abertura que deu certo resolvem o
   * pedido: o que falha ao abrir devolve `ok: false` com o motivo e deixa o
   * pedido esperando, para a pessoa escolher outro destino ou recusar.
   */
  async function carryOut(pedido, item, destino) {
    const { url, modo: modoPedido } = item

    if (destino === null) {
      return {
        resolved: pedidos.resolver(pedido.id, {
          aceito: false,
          resultado: { ok: false, recusadoPor: 'pessoa', modoPedido, message: 'A pessoa recusou abrir a pagina.' },
        }),
      }
    }

    if (destino === 'embutido') {
      const webContents = windowReadyContents(getMainWindow?.())
      if (!webContents) {
        throw new Error('A janela do app ainda nao esta pronta para criar o bloco.')
      }
      // O perfil só vale para o bloco que o agente pediu (`--embedded
      // --profile`). Pedido para o navegador que a pessoa trouxe para o
      // canvas abre no Padrão.
      const perfil = modoPedido === 'embutido' ? item.perfil : undefined
      const profileId = perfil ? resolveProfileId(perfil, dependencies.findProfileByName) : undefined
      if (perfil && !profileId) {
        // Existia na chegada e sumiu antes do clique: cair no Padrão abriria
        // outra sessão logada, e recusar tiraria a escolha da pessoa.
        return { ok: false, message: `O perfil "${perfil}" não existe mais no navegador interno.` }
      }

      webContents.send(BROWSER_OPEN_CHANNEL, { requestId: pedido.id, url, ...(profileId ? { profileId } : {}) })
      return {
        resolved: pedidos.resolver(pedido.id, {
          aceito: true,
          resultado: {
            ok: true,
            modo: 'embutido',
            modoPedido,
            url,
            ...(profileId ? { perfil, profileId } : {}),
          },
        }),
      }
    }

    try {
      await openExternal(url)
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error && error.message ? error.message : 'O navegador externo recusou a abertura.',
      }
    }
    return {
      resolved: pedidos.resolver(pedido.id, {
        aceito: true,
        resultado: { ok: true, modo: 'externo', modoPedido, url },
      }),
    }
  }

  ipcMain?.handle?.('agent-browser:list-requests', () =>
    guard('Falha ao ler os pedidos de abertura de página.', () => ({ requests: listRequests() })),
  )
  ipcMain?.handle?.('agent-browser:decide', (_event, params) =>
    guardAsync('Falha ao atender o pedido de abertura de página.', () => decide(params)),
  )

  const watcher = observeAgentRequests(appPaths.agentRequests, processPending)
  // O main registra os handlers em sequência, sem try/catch em volta: o que
  // lançasse aqui levaria junto tudo o que é registrado depois no boot.
  try {
    processPending()
  } catch (error) {
    avisarFalha('a fila de pedidos', error)
  }

  return {
    pedidos,
    processPending,
    listRequests,
    decide,
    pararDeObservarPedidos: () => watcher?.close(),
  }
}

/**
 * O pedido como o cartão o mostra, ou o motivo de recusá-lo sem perguntar.
 * Não grava nada: `processPending` grava a recusa, `listRequests` só esconde.
 *
 * O arquivo vem de fora do processo (o CLI grava, mas qualquer um escreve na
 * pasta), então os tipos são conferidos antes de qualquer uso: um `perfil`
 * que não é texto lançava ao virar texto — no registro, durante o boot do
 * main, e no render do cartão.
 *
 * @returns {{ ok: true, item: object } | { ok: false, recusa: { message: string } }}
 */
function lerParaOCartao(pedido) {
  const malformado = motivoDeMalformado(pedido)
  if (malformado) return { ok: false, recusa: { message: malformado } }

  const url = webUrlOf(pedido)
  if (!url) return { ok: false, recusa: { message: URL_FORA_DA_WEB } }

  return {
    ok: true,
    item: {
      id: pedido.id,
      url,
      modo: pedido.modo,
      ...(pedido.perfil ? { perfil: pedido.perfil } : {}),
      origem: typeof pedido.origem === 'string' ? pedido.origem : '',
      pedidoEm: pedido.pedidoEm,
    },
  }
}

/**
 * A pessoa decide sobre o que viu: a URL serializada e o perfil que o cartão
 * mostrou precisam ser os do pedido gravado agora.
 */
function mesmoQueOCartaoMostrou(item, params) {
  const perfilMostrado = typeof params?.perfil === 'string' ? params.perfil : ''
  return typeof params?.url === 'string' && params.url === item.url && perfilMostrado === (item.perfil ?? '')
}

/** O que `felixo browser open` nunca grava. '' = formato bom. */
function motivoDeMalformado(pedido) {
  const perfilTorto = pedido.perfil !== undefined && typeof pedido.perfil !== 'string'
  if (
    typeof pedido.url !== 'string' ||
    typeof pedido.modo !== 'string' ||
    typeof pedido.pedidoEm !== 'string' ||
    perfilTorto
  ) {
    return 'Pedido malformado: url, modo e pedidoEm (e perfil, quando ha) precisam ser texto.'
  }
  if (!MODOS_ABERTURA_PAGINA.includes(pedido.modo)) {
    return 'Pedido malformado: o modo precisa ser externo ou embutido.'
  }
  // A CLI já recusa; um arquivo escrito à mão chega até aqui. Perfil é do
  // navegador interno: num pedido para o navegador do sistema ele não diz nada.
  if (pedido.perfil && pedido.modo !== 'embutido') {
    return 'Pedido malformado: o perfil so vale com o modo embutido (--embedded).'
  }
  return ''
}

/** A URL web do pedido, na forma que a política serializa, ou '' se não for web. */
function webUrlOf(pedido) {
  const decision = classifyExternalUrl(pedido?.url, EXTERNAL_WEB_SCHEMES)
  return decision.ok ? decision.url : ''
}

const DEFAULT_PROFILE_NAMES = new Set(['padrao', 'padrão', 'default'])

/** Nome de perfil → id. "Padrão" é o perfil que já existia; os outros vêm do banco. */
function resolveProfileId(name, findProfileByName) {
  // Só texto: `String()` de um objeto torto lança (ou chama código dele).
  if (typeof name !== 'string') return null
  if (DEFAULT_PROFILE_NAMES.has(name.trim().toLowerCase())) return 'default'
  return findProfileByName?.(name)?.id ?? null
}

/** Returns webContents only after the main document has listeners installed. */
function windowReadyContents(window) {
  if (!window || window.isDestroyed?.()) return null
  const webContents = window.webContents
  if (!webContents || webContents.isDestroyed?.()) return null
  if (webContents.isLoadingMainFrame?.()) return null
  return webContents
}

function guard(fallbackMessage, run) {
  try {
    return { ok: true, ...run() }
  } catch (error) {
    return { ok: false, message: error instanceof Error && error.message ? error.message : fallbackMessage }
  }
}

async function guardAsync(fallbackMessage, run) {
  try {
    return { ok: true, ...(await run()) }
  } catch (error) {
    return { ok: false, message: error instanceof Error && error.message ? error.message : fallbackMessage }
  }
}

module.exports = {
  BROWSER_OPEN_CHANNEL,
  BROWSER_REQUESTS_CHANNEL,
  BROWSER_REQUEST_ACTION,
  registerAgentBrowserIpcHandlers,
}
