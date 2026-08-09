/**
 * Wires up every <webview> guest the "Página Web" canvas block attaches to
 * the main window. The element's own `webpreferences` attribute already
 * covers nodeIntegration/contextIsolation/sandbox for the guest — the one
 * thing that still needs main-process logic is deciding what "open in new
 * window" attempts should do.
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
    const resolved = resolveWindowOpenAction(disposition)
    if (resolved.action === 'deny') {
      webContents.loadURL(url)
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
