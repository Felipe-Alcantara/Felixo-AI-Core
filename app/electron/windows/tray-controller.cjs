'use strict'

/**
 * @module tray-controller
 * Fechar a janela (o X) esconde o app na bandeja e NÃO encerra os agentes: a
 * única coisa que encerra um agente é excluí-lo do canvas, ou o "Sair" confirmado.
 * Quem pergunta "encerrar N agentes?" no Sair é a guarda de fechamento
 * (`close-guard.cjs`), que já diz quantos terminais vivos serão perdidos.
 *
 * Só no Windows e no Linux: no macOS o app já fica no Dock quando a janela fecha.
 * Também fora do modo de desenvolvimento, do release smoke e da automação
 * (`felixo devtools`): ali o fechamento precisa encerrar o processo, senão o
 * Vite e a porta ficam órfãos e o smoke nunca termina. Só o teste da própria
 * bandeja liga isto na automação, com `FELIXO_DEVTOOLS_TRAY=1` e porta válida.
 *
 * O módulo não importa `electron`: tudo que toca a plataforma entra por
 * parâmetro, e o teste usa um app e uma bandeja falsos.
 */

/**
 * A bandeja vale neste processo?
 *
 * @param {object} params
 * @param {string} params.platformName
 * @param {boolean} params.isDevelopment
 * @param {boolean} params.isReleaseSmoke
 * @param {number} [params.devtoolsPort] - Porta do `felixo devtools`, se este for um processo de automação.
 * @param {NodeJS.ProcessEnv} [params.env]
 * @returns {boolean}
 */
function trayEnabled({ platformName, isDevelopment, isReleaseSmoke, devtoolsPort, env = {} }) {
  if (platformName === 'darwin' || isReleaseSmoke) return false
  const automation = Number.isInteger(devtoolsPort) && devtoolsPort > 0 && devtoolsPort <= 65535
  if (automation) return env.FELIXO_DEVTOOLS_TRAY === '1'
  return !isDevelopment
}

/** O texto da dica da bandeja: diz quantos agentes seguem rodando. */
function trayTooltip(appName, sessoesVivas) {
  if (!(sessoesVivas > 0)) return appName
  return `${appName} — ${sessoesVivas === 1 ? '1 agente rodando' : `${sessoesVivas} agentes rodando`}`
}

/**
 * @param {object} deps
 * @param {boolean} deps.enabled
 * @param {{ on: Function, quit: Function }} deps.app
 * @param {new (image: unknown) => { setToolTip: Function, setContextMenu: Function, on: Function, destroy: Function }} deps.Tray
 * @param {{ buildFromTemplate: Function }} deps.Menu
 * @param {{ createFromPath: Function }} deps.nativeImage
 * @param {string} deps.iconPath
 * @param {() => import('electron').BrowserWindow | null | undefined} deps.getMainWindow
 * @param {() => number} [deps.contarSessoesVivas]
 * @param {string} [deps.appName]
 */
function createTrayController({
  enabled,
  app,
  Tray,
  Menu,
  nativeImage,
  iconPath,
  getMainWindow,
  contarSessoesVivas,
  appName = 'Felixo AI Core',
}) {
  let tray = null
  // Verdadeiro enquanto o app está saindo de verdade (Sair, Ctrl+Q, atualização): aí o X não esconde.
  let saindo = false

  const janela = () => {
    const win = getMainWindow?.()
    return win && !win.isDestroyed?.() ? win : null
  }

  function abrir() {
    const win = janela()
    if (!win) return
    if (win.isMinimized?.()) win.restore()
    win.show()
    win.focus()
  }

  function sair() {
    saindo = true
    app.quit()
  }

  function garantirBandeja() {
    if (tray) return
    tray = new Tray(nativeImage.createFromPath(iconPath))
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `Abrir o ${appName}`, click: abrir },
        { type: 'separator' },
        { label: 'Sair', click: sair },
      ]),
    )
    tray.on('click', abrir)
  }

  function atualizarDica() {
    tray?.setToolTip(trayTooltip(appName, Number(contarSessoesVivas?.() ?? 0)))
  }

  if (enabled) {
    // Qualquer saída real (menu, Ctrl+Q, instalar atualização) passa por aqui antes de fechar as janelas.
    app.on('before-quit', () => {
      saindo = true
    })
    app.on('will-quit', () => {
      tray?.destroy()
      tray = null
    })
  }

  return {
    /**
     * Chamado no `close` da janela principal, antes da guarda de fechamento.
     * Devolve true quando escondeu a janela em vez de fechar: a guarda não pergunta.
     */
    interceptar(evento) {
      if (!enabled || saindo) return false
      const win = janela()
      if (!win) return false
      evento.preventDefault()
      win.hide()
      garantirBandeja()
      atualizarDica()
      return true
    },
    /** A pessoa cancelou o "Fechar mesmo assim?" do Sair: o app segue, e o X volta a esconder. */
    aoCancelarSaida() {
      saindo = false
    },
    enabled: Boolean(enabled),
    abrir,
    sair,
    existe: () => tray !== null,
  }
}

module.exports = { createTrayController, trayEnabled, trayTooltip }
