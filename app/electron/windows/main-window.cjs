const { BrowserWindow, dialog, screen } = require('electron')
const { rendererBuildPath } = require('../core/paths.cjs')
const { mainWindowOptions } = require('../core/window-options.cjs')
const { denyExternalWindowOpen } = require('../services/external-links.cjs')
const { registerWindowZoomShortcuts } = require('../services/window-zoom-shortcuts.cjs')
const { registerWindowFocusBridge } = require('../services/window-focus-bridge.cjs')
const { registerWebviewLifecycle } = require('../services/webview-lifecycle.cjs')
const { registrarGuardaDeFechamento } = require('./close-guard.cjs')
const {
  applyWindowState,
  registerWindowStatePersistence,
  resolveWindowState,
} = require('./window-state.cjs')

/**
 * Pergunta de fechamento usando o diálogo nativo.
 *
 * Modal da janela de propósito: um diálogo solto pode ficar atrás do app e dar
 * a impressão de que o fechamento travou.
 *
 * @param {import('electron').BrowserWindow} browserWindow
 * @returns {(pergunta: object) => Promise<number>}
 */
function criarPerguntaNativa(browserWindow) {
  return async (pergunta) => {
    const { response } = await dialog.showMessageBox(browserWindow, {
      type: 'question',
      title: pergunta.titulo,
      message: pergunta.mensagem,
      detail: pergunta.detalhe,
      buttons: pergunta.botoes,
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })

    return response
  }
}

/**
 * @param {object} [options]
 * @param {() => number} [options.contarSessoesVivas] - Quantos terminais têm
 *   processo vivo. Vem como função, e não como número, porque o gerenciador de
 *   PTY é criado DEPOIS da janela em `main.cjs`: um valor lido aqui seria
 *   sempre zero, e a guarda nunca perguntaria nada.
 * @returns {import('electron').BrowserWindow}
 */
function createMainWindow({ contarSessoesVivas, settingsRepository, screenApi = screen } = {}) {
  let savedState = null
  try {
    savedState = settingsRepository?.get('window.main.state') ?? null
  } catch {
    // A janela precisa continuar abrindo se uma configuração antiga corrompeu.
  }
  const state = resolveWindowState(
    savedState,
    screenApi?.getAllDisplays?.() ?? [],
    screenApi?.getPrimaryDisplay?.(),
    mainWindowOptions,
  )
  const mainWindow = new BrowserWindow({ ...mainWindowOptions, ...state.bounds })

  registerWindowFocusBridge(mainWindow)
  applyWindowState(mainWindow, state)
  registerWindowStatePersistence(mainWindow, settingsRepository)

  mainWindow.webContents.setWindowOpenHandler(denyExternalWindowOpen)
  registerWindowZoomShortcuts(mainWindow)
  registerWebviewLifecycle(mainWindow)

  if (typeof contarSessoesVivas === 'function') {
    registrarGuardaDeFechamento(mainWindow, {
      contarSessoesVivas,
      perguntar: criarPerguntaNativa(mainWindow),
    })
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    return mainWindow
  }

  mainWindow.loadFile(rendererBuildPath)
  return mainWindow
}

module.exports = {
  createMainWindow,
}
