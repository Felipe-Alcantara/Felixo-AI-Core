const { BrowserWindow, dialog, screen } = require('electron')
const { APP_INDEX_URL } = require('../core/app-protocol.cjs')
const { mainWindowOptions } = require('../core/window-options.cjs')
const { registrarGuardaDeFechamento } = require('./close-guard.cjs')
const { applyWindowGuards } = require('./window-guards.cjs')
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
 * @param {{ openExternal: (url: string) => Promise<void> }} [options.electronShell] - O
 *   `shell` que abre os links; sem ele, o do Electron. Só a automação troca
 *   (`devtools-shell-open-guard.cjs`).
 * @param {ReturnType<typeof import('./aux-windows.cjs').createAuxWindowManager>} [options.auxWindows] - Gerenciador
 *   das janelas auxiliares: sem ele, `window.open` de `about:blank` continua negado.
 * @returns {import('electron').BrowserWindow}
 */
function createMainWindow({ contarSessoesVivas, settingsRepository, screenApi = screen, electronShell, onWebviewPopup, auxWindows } = {}) {
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

  applyWindowState(mainWindow, state)
  registerWindowStatePersistence(mainWindow, settingsRepository)

  // As mesmas guardas valem para as auxiliares (fábrica única: window-guards.cjs).
  applyWindowGuards(mainWindow, {
    electronShell,
    onWebviewPopup,
    abrirAuxiliar: auxWindows?.windowOpenHandler,
  })
  auxWindows?.attachTo(mainWindow)

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

  // O build por app://, não file:// (core/app-protocol.cjs): 'self' passa a ser só o build.
  mainWindow.loadURL(APP_INDEX_URL)
  return mainWindow
}

module.exports = {
  createMainWindow,
}
