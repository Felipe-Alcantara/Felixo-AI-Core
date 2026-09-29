/**
 * Wires up every <webview> guest the "Página Web" canvas block attaches to
 * the main window. The element's own `webpreferences` attribute asks for
 * nodeIntegration/contextIsolation/sandbox, but the renderer is not trusted
 * to ask: `registerWebviewAttachGuard` (navigation-guard.cjs) forces the same
 * isolation on every attach and points a guest that doesn't start on a web
 * page at `about:blank` (without destroying it, so the block survives). What
 * remains here is deciding what "open in new window" attempts should do — and
 * only for web pages.
 *
 * Told apart by Chromium's `disposition`:
 *  - 'foreground-tab' / 'background-tab' is a plain target=_blank link — the
 *    product wants that to stay INSIDE the block, so it navigates the same
 *    webview instead of popping a window.
 *  - Everything else ('default', 'new-window', 'other') is a deliberate
 *    `window.open(...)` call, which is how OAuth login buttons (Google/
 *    Apple/Microsoft…) open their popup — 'default' in particular is what
 *    Chromium reports for a *programmatic* window.open(), the common case
 *    for a login button's onclick handler, not just the Shift+click case
 *    'new-window' covers. That popup expects to post a message back to the
 *    opener when it's done; denying it (or redirecting the opener's own tab)
 *    breaks that handshake and the site reports "popup blocked" — the exact
 *    bug this used to cause by only recognizing 'new-window'. These get a
 *    real child window, with the same locked-down webPreferences as every
 *    other webview guest.
 */

const { EXTERNAL_WEB_SCHEMES, classifyExternalUrl } = require('./external-url-policy.cjs')
const { isWebviewDestination, registerWebviewAttachGuard } = require('./navigation-guard.cjs')

/**
 * Pure decision for a webview's `setWindowOpenHandler`. Separated from the
 * wiring below so the disposition→action logic is testable without mocking
 * `webContents`.
 */
function resolveWindowOpenAction(disposition) {
  if (disposition === 'foreground-tab' || disposition === 'background-tab') {
    return { action: 'deny' }
  }

  return {
    action: 'allow',
    overrideBrowserWindowOptions: {
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    },
  }
}

function registerWebviewLifecycle(mainWindow) {
  registerWebviewAttachGuard(mainWindow)
  mainWindow.webContents.on('did-attach-webview', (_event, guestWebContents) => {
    applyWindowOpenPolicy(guestWebContents)
  })
}

/**
 * Aplica a política de novas janelas a um webContents e, recursivamente, a
 * cada popup que ele abrir. Sem a recursão, um popup de login legítimo poderia
 * abrir outras janelas sem nenhuma restrição, em cascata.
 *
 * @param {import('electron').WebContents} webContents
 */
function applyWindowOpenPolicy(webContents) {
  webContents.setWindowOpenHandler(({ url, disposition }) => {
    // Só página web vira aba no bloco ou popup. O `loadURL` abaixo é uma
    // navegação iniciada pelo processo principal, que o Chromium NÃO filtra
    // como filtra a do site: sem esta checagem, um `<a target="_blank"
    // href="file:///...">` numa página qualquer abria arquivo local no bloco.
    // `about:blank` passa porque é como popups de login começam.
    if (!isWebviewDestination(url)) return { action: 'deny' }

    const resolved = resolveWindowOpenAction(disposition)
    if (resolved.action === 'deny') {
      const decision = classifyExternalUrl(url, EXTERNAL_WEB_SCHEMES)
      if (decision.ok) webContents.loadURL(decision.url)
    }
    return resolved
  })

  webContents.on('did-create-window', (childWindow) => {
    applyWindowOpenPolicy(childWindow.webContents)
  })
}

module.exports = {
  applyWindowOpenPolicy,
  registerWebviewLifecycle,
  resolveWindowOpenAction,
}
