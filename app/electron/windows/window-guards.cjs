const { APP_INDEX_URL } = require('../core/app-protocol.cjs')
const {
  EXTERNAL_OPEN_FAILED_CHANNEL,
  createExternalWindowOpenHandler,
  openExternalUrl,
} = require('../services/external-links.cjs')
const { registerMainWindowNavigationGuard } = require('../services/navigation-guard.cjs')
const { registerWindowZoomShortcuts } = require('../services/window-zoom-shortcuts.cjs')
const { registerWindowFocusBridge } = require('../services/window-focus-bridge.cjs')
const { registerWebviewLifecycle } = require('../services/webview-lifecycle.cjs')

/**
 * As guardas que TODA janela do app recebe, principal ou auxiliar: links só
 * saem pela política externa, a navegação não deixa o app, o `<webview>` anexa
 * isolado (will-attach-webview) e o zoom/foco valem igual. Uma só função para
 * que uma janela nova nunca nasça sem alguma delas.
 *
 * @param {import('electron').BrowserWindow} browserWindow
 * @param {object} [options]
 * @param {(details: object) => object | null} [options.abrirAuxiliar] - Só a
 *   principal passa: decide se um `window.open` vira janela auxiliar. Sem ela
 *   (as auxiliares), todo `window.open` é link externo ou negado.
 */
function applyWindowGuards(browserWindow, { electronShell, onWebviewPopup, abrirAuxiliar } = {}) {
  registerWindowFocusBridge(browserWindow)

  const openExternal = (url) => openExternalUrl(url, electronShell)
  const aoAbrirLink = createExternalWindowOpenHandler({
    open: openExternal,
    // A janela que pediu é a que avisa a pessoa (e oferece copiar o link).
    notify: (failure) => {
      if (!browserWindow.isDestroyed()) browserWindow.webContents.send(EXTERNAL_OPEN_FAILED_CHANNEL, failure)
    },
  })
  browserWindow.webContents.setWindowOpenHandler((details) => abrirAuxiliar?.(details) ?? aoAbrirLink(details))
  registerMainWindowNavigationGuard(browserWindow.webContents, {
    appUrl: process.env.VITE_DEV_SERVER_URL || APP_INDEX_URL,
    openExternal,
  })
  registerWindowZoomShortcuts(browserWindow)
  registerWebviewLifecycle(browserWindow, {
    onPopupCreated: onWebviewPopup,
    // O bloco que passou do limite de popups mostra o aviso (WebpageNode).
    onPopupBlocked: (block, max) => {
      if (!browserWindow.isDestroyed()) browserWindow.webContents.send('webview-popups:blocked', { webContentsId: block.id, max })
    },
  })
}

module.exports = { applyWindowGuards }
