'use strict'

const electron = require('electron')

const { observeAgentRequests } = require('./agent-request-watcher.cjs')
const { openExternalUrl } = require('./external-links.cjs')
const { EXTERNAL_WEB_SCHEMES, classifyExternalUrl } = require('./external-url-policy.cjs')
const { criarRepositorioDePedidos } = require('./fetch-all/agent-requests.cjs')

const BROWSER_REQUEST_ACTION = 'abrir-pagina'
/** Abre um bloco Página Web no canvas (o renderer cria o nó). */
const BROWSER_OPEN_CHANNEL = 'agent-browser:open-webpage'
/** Avisa a interface que a fila de pedidos de abertura mudou. */
const BROWSER_REQUESTS_CHANNEL = 'agent-browser:requests'
const DESTINOS = ['externo', 'embutido']

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
 * O que chega do renderer é só o id e o destino. A URL e o perfil são relidos
 * do pedido gravado e passam de novo pela política: o renderer nunca escolhe o
 * endereço aberto.
 *
 * Pedido que não tem o que perguntar é recusado na hora, como antes: URL fora
 * da web e perfil que não existe.
 *
 * @param {() => import('electron').BrowserWindow | undefined} getMainWindow
 * @param {{ agentRequests: string }} appPaths
 * @param {{ createRequests?: typeof criarRepositorioDePedidos, shell?: object, openExternal?: Function, findProfileByName?: Function, ipcMain?: { handle: Function } }} [dependencies]
 */
function registerAgentBrowserIpcHandlers(getMainWindow, appPaths, dependencies = {}) {
  const pedidos = (dependencies.createRequests ?? criarRepositorioDePedidos)({
    pasta: appPaths.agentRequests,
  })
  const openExternal =
    dependencies.openExternal ??
    ((url) => openExternalUrl(url, dependencies.shell ?? electron.shell))
  const ipcMain = dependencies.ipcMain ?? electron.ipcMain

  /** Recusa o que não tem o que perguntar; o resto fica para a pessoa. */
  function processPending() {
    for (const pedido of pedidos.listarPendentes({ acao: BROWSER_REQUEST_ACTION })) {
      if (!webUrlOf(pedido)) {
        pedidos.resolver(pedido.id, {
          aceito: false,
          resultado: { ok: false, message: 'A URL do pedido nao e http:// ou https://.' },
        })
        continue
      }

      // Perfil pedido por NOME. Perfil que não existe falha explicitamente:
      // cair no Padrão abriria a página numa sessão logada que o agente não
      // escolheu — o oposto de isolar.
      if (pedido.perfil && !resolveProfileId(pedido.perfil, dependencies.findProfileByName)) {
        pedidos.resolver(pedido.id, {
          aceito: false,
          resultado: {
            ok: false,
            modo: 'embutido',
            url: webUrlOf(pedido),
            message: `O perfil "${pedido.perfil}" nao existe no navegador interno.`,
          },
        })
      }
    }
    notifyRenderer()
  }

  /** O que o cartão mostra: só pedidos válidos, com a URL já serializada. */
  function listRequests() {
    return pedidos
      .listarPendentes({ acao: BROWSER_REQUEST_ACTION })
      .map((pedido) => ({ pedido, url: webUrlOf(pedido) }))
      .filter(({ url }) => url)
      .map(({ pedido, url }) => ({
        id: pedido.id,
        url,
        modo: pedido.modo === 'embutido' ? 'embutido' : 'externo',
        ...(pedido.perfil ? { perfil: pedido.perfil } : {}),
        origem: typeof pedido.origem === 'string' ? pedido.origem : '',
        pedidoEm: pedido.pedidoEm,
      }))
  }

  function notifyRenderer() {
    const webContents = windowReadyContents(getMainWindow?.())
    webContents?.send(BROWSER_REQUESTS_CHANNEL, { requests: listRequests() })
  }

  /**
   * A escolha da pessoa. `destino` nulo = recusar.
   *
   * @param {{ id?: unknown, destino?: unknown }} params
   */
  async function decide(params) {
    const id = typeof params?.id === 'string' ? params.id.trim() : ''
    const pedido = id ? pedidos.ler(id) : null
    if (!pedido || pedido.estado !== 'pendente' || pedido.acao !== BROWSER_REQUEST_ACTION) {
      return { resolved: null, message: 'Esse pedido não está mais pendente.' }
    }

    const destino = params?.destino ?? null
    if (destino !== null && !DESTINOS.includes(destino)) {
      return { resolved: null, message: 'Destino inválido para esse pedido.' }
    }

    try {
      return { resolved: await carryOut(pedido, destino) }
    } finally {
      notifyRenderer()
    }
  }

  async function carryOut(pedido, destino) {
    const modoPedido = pedido.modo === 'embutido' ? 'embutido' : 'externo'
    const url = webUrlOf(pedido)

    if (destino === null) {
      return pedidos.resolver(pedido.id, {
        aceito: false,
        resultado: { ok: false, modoPedido, message: 'A pessoa recusou abrir a pagina.' },
      })
    }
    if (!url) {
      return pedidos.resolver(pedido.id, {
        aceito: false,
        resultado: { ok: false, message: 'A URL do pedido nao e http:// ou https://.' },
      })
    }

    if (destino === 'embutido') {
      const webContents = windowReadyContents(getMainWindow?.())
      if (!webContents) {
        throw new Error('A janela do app ainda nao esta pronta para criar o bloco.')
      }
      // O perfil só vale para o bloco: é o destino que o agente pediu com
      // `--profile`. Pedido para o navegador que a pessoa trouxe para o canvas
      // abre no Padrão.
      const profileId = pedido.perfil
        ? resolveProfileId(pedido.perfil, dependencies.findProfileByName)
        : undefined
      if (pedido.perfil && !profileId) {
        return pedidos.resolver(pedido.id, {
          aceito: false,
          resultado: {
            ok: false,
            modo: 'embutido',
            url,
            message: `O perfil "${pedido.perfil}" nao existe no navegador interno.`,
          },
        })
      }

      webContents.send(BROWSER_OPEN_CHANNEL, { requestId: pedido.id, url, ...(profileId ? { profileId } : {}) })
      return pedidos.resolver(pedido.id, {
        aceito: true,
        resultado: {
          ok: true,
          modo: 'embutido',
          modoPedido,
          url,
          ...(profileId ? { perfil: pedido.perfil, profileId } : {}),
        },
      })
    }

    try {
      await openExternal(url)
      return pedidos.resolver(pedido.id, {
        aceito: true,
        resultado: { ok: true, modo: 'externo', modoPedido, url },
      })
    } catch (error) {
      return pedidos.resolver(pedido.id, {
        aceito: false,
        resultado: {
          ok: false,
          modo: 'externo',
          modoPedido,
          url,
          message:
            error instanceof Error ? error.message : 'O navegador externo recusou a abertura.',
        },
      })
    }
  }

  ipcMain?.handle?.('agent-browser:list-requests', () =>
    guard('Falha ao ler os pedidos de abertura de página.', () => ({ requests: listRequests() })),
  )
  ipcMain?.handle?.('agent-browser:decide', (_event, params) =>
    guardAsync('Falha ao atender o pedido de abertura de página.', () => decide(params)),
  )

  const watcher = observeAgentRequests(appPaths.agentRequests, processPending)
  processPending()

  return {
    pedidos,
    processPending,
    listRequests,
    decide,
    pararDeObservarPedidos: () => watcher?.close(),
  }
}

/** A URL web do pedido, na forma que a política serializa, ou '' se não for web. */
function webUrlOf(pedido) {
  const decision = classifyExternalUrl(pedido?.url, EXTERNAL_WEB_SCHEMES)
  return decision.ok ? decision.url : ''
}

const DEFAULT_PROFILE_NAMES = new Set(['padrao', 'padrão', 'default'])

/** Nome de perfil → id. "Padrão" é o perfil que já existia; os outros vêm do banco. */
function resolveProfileId(name, findProfileByName) {
  if (DEFAULT_PROFILE_NAMES.has(String(name).trim().toLowerCase())) return 'default'
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
