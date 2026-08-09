/**
 * Wires up every <webview> guest the "Página Web" canvas block attaches to
 * the main window. The element's own `webpreferences` attribute already
 * covers nodeIntegration/contextIsolation/sandbox for the guest — the one
 * thing that still needs main-process logic is deciding what "open in new
 * window" attempts should do.
 *
 * Two cases, told apart by Chromium's `disposition`:
 *  - A plain link with target=_blank ('foreground-tab'/'background-tab') is
 *    just regular browsing — the product wants that to stay INSIDE the block,
 *    so it navigates the same webview instead of popping a window.
 *  - `window.open(url, name, "features...")`, e.g. an OAuth login button
 *    (Google/Apple/Microsoft…), reports as 'new-window' and expects a real
 *    popup that posts a message back to the opener when it's done — denying
 *    it (or redirecting the opener's own tab) breaks that handshake, which is
 *    exactly the bug this used to cause. Those get a real child window, with
 *    the same locked-down webPreferences as every other webview guest.
 */

/**
 * Pure decision for a webview's `setWindowOpenHandler`. Separated from the
 * wiring below so the disposition→action logic is testable without mocking
 * `webContents`.
 */
function resolveWindowOpenAction(disposition) {
  if (disposition === 'new-window') {
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

  return { action: 'deny' }
}

function registerWebviewLifecycle(mainWindow) {
  mainWindow.webContents.on('did-attach-webview', (_event, guestWebContents) => {
    guestWebContents.setWindowOpenHandler(({ url, disposition }) => {
      const resolved = resolveWindowOpenAction(disposition)
      if (resolved.action === 'deny') {
        guestWebContents.loadURL(url)
      }
      return resolved
    })
  })
}

module.exports = {
  registerWebviewLifecycle,
  resolveWindowOpenAction,
}
