const { preloadPath } = require('./paths.cjs')

const mainWindowOptions = {
  width: 1320,
  height: 760,
  minWidth: 720,
  minHeight: 500,
  resizable: true,
  maximizable: true,
  fullscreenable: true,
  // O DevTools abre uma segunda instância para automação. Ela continua sendo
  // uma BrowserWindow real, apenas não é mostrada na área de trabalho.
  show: process.env.FELIXO_DEVTOOLS_HEADLESS !== '1',
  useContentSize: false,
  backgroundColor: '#09090b',
  title: 'Felixo AI Core',
  webPreferences: {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    // Lets canvas blocks embed a live <webview> (the "Página Web" block) —
    // each guest still gets its own contextIsolation/nodeIntegration via the
    // element's `webpreferences` attribute (see WebpageNode.tsx).
    webviewTag: true,
  },
}

module.exports = {
  mainWindowOptions,
}
