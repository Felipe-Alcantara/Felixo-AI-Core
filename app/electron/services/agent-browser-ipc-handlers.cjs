'use strict'

const { shell } = require('electron')

const { observeAgentRequests } = require('./agent-request-watcher.cjs')
const { openExternalUrl } = require('./external-links.cjs')
const {
  criarRepositorioDePedidos,
  normalizarUrlWeb,
} = require('./fetch-all/agent-requests.cjs')

const BROWSER_REQUEST_ACTION = 'abrir-pagina'
const BROWSER_OPEN_CHANNEL = 'agent-browser:open-webpage'

/**
 * Consumes browser intents from the same request folder used by Fetch All.
 * External requests use the existing system-browser handler; embedded ones
 * become a renderer event that CanvasView turns into a persisted Webpage node.
 *
 * @param {() => import('electron').BrowserWindow | undefined} getMainWindow
 * @param {{ agentRequests: string }} appPaths
 * @param {{ createRequests?: typeof criarRepositorioDePedidos, shell?: object, openExternal?: Function }} [dependencies]
 * @returns {{ pedidos: object, pararDeObservarPedidos: () => void }}
 */
function registerAgentBrowserIpcHandlers(getMainWindow, appPaths, dependencies = {}) {
  const pedidos = (dependencies.createRequests ?? criarRepositorioDePedidos)({
    pasta: appPaths.agentRequests,
  })
  const openExternal =
    dependencies.openExternal ??
    ((url) => openExternalUrl(url, dependencies.shell ?? shell))

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
    for (const pedido of pedidos.listarPendentes({ acao: BROWSER_REQUEST_ACTION })) {
      const url = normalizarUrlWeb(pedido.url)
      if (!url) {
        pedidos.resolver(pedido.id, {
          aceito: false,
          resultado: { ok: false, message: 'A URL do pedido nao e http:// ou https://.' },
        })
        continue
      }

      if (pedido.modo === 'embutido') {
        const window = getMainWindow?.()
        const webContents = windowReadyContents(window)

        if (!webContents) {
          waitForWindow(window, schedule)
          continue
        }

        webContents.send(BROWSER_OPEN_CHANNEL, { requestId: pedido.id, url })
        pedidos.resolver(pedido.id, {
          aceito: true,
          resultado: { ok: true, modo: 'embutido', url },
        })
        continue
      }

      try {
        await openExternal(url)
        pedidos.resolver(pedido.id, {
          aceito: true,
          resultado: { ok: true, modo: 'externo', url },
        })
      } catch (error) {
        pedidos.resolver(pedido.id, {
          aceito: false,
          resultado: {
            ok: false,
            modo: 'externo',
            url,
            message:
              error instanceof Error
                ? error.message
                : 'O navegador externo recusou a abertura.',
          },
        })
      }
    }
  }

  return {
    pedidos,
    processPending,
    pararDeObservarPedidos: () => watcher?.close(),
  }
}

/** Returns webContents only after the main document has listeners installed. */
function windowReadyContents(window) {
  if (!window || window.isDestroyed?.()) return null
  const webContents = window.webContents
  if (!webContents || webContents.isDestroyed?.()) return null
  if (webContents.isLoadingMainFrame?.()) return null
  return webContents
}

/** Keep an embedded request pending until a newly-created window finishes. */
function waitForWindow(window, onReady) {
  const webContents = window?.webContents
  if (typeof webContents?.once === 'function') {
    webContents.once('did-finish-load', onReady)
  }
}

module.exports = {
  BROWSER_OPEN_CHANNEL,
  BROWSER_REQUEST_ACTION,
  registerAgentBrowserIpcHandlers,
}
