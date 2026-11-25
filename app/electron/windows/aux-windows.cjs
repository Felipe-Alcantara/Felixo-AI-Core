'use strict'

const { readWindowBackground } = require('../core/window-background.cjs')
const { applyWindowState, registerWindowStatePersistence, resolveWindowState } = require('./window-state.cjs')

/**
 * Janelas auxiliares, no modelo do VS Code: a principal chama
 * `window.open('about:blank', 'felixo-aux-<id>')` e desenha nelas por portal. O
 * renderer é UM só (o da principal), então canvas e terminais continuam com um
 * estado só e mudam de janela sem reiniciar. Fechar a principal fecha as
 * auxiliares (elas não vivem sem o renderer que as desenha).
 *
 * O módulo não importa `electron`: tudo que toca a plataforma entra por
 * parâmetro, e o teste usa janelas falsas.
 */

const AUX_FRAME_PREFIX = 'felixo-aux-'
const AUX_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/i
const AUX_STATE_KEY_PREFIX = 'window.aux.'
const MAX_AUX_WINDOWS = 8

const AUX_DEFAULT_BOUNDS = { width: 900, height: 640 }

/**
 * Picture-in-picture: auxiliar de id `pip-<...>`, pequena e sempre no topo. Ela
 * continua visível quando a principal vai para a bandeja (é o motivo de existir:
 * acompanhar um agente com o app escondido).
 */
const PIP_ID_PREFIX = 'pip-'
const PIP_DEFAULT_SIZE = { width: 520, height: 320 }
const PIP_MARGIN = 24

const isPipId = (id) => typeof id === 'string' && id.startsWith(PIP_ID_PREFIX)

/** Canto inferior direito da área útil do monitor principal. */
function pipDefaultBounds(primaryDisplay) {
  const area = primaryDisplay?.workArea
  if (!area) return { ...PIP_DEFAULT_SIZE }
  return {
    ...PIP_DEFAULT_SIZE,
    x: Math.round(area.x + area.width - PIP_DEFAULT_SIZE.width - PIP_MARGIN),
    y: Math.round(area.y + area.height - PIP_DEFAULT_SIZE.height - PIP_MARGIN),
  }
}

/** O id da auxiliar a partir do nome do quadro do `window.open`, ou null se o nome não é nosso. */
function parseAuxFrameName(frameName) {
  if (typeof frameName !== 'string' || !frameName.startsWith(AUX_FRAME_PREFIX)) return null
  const id = frameName.slice(AUX_FRAME_PREFIX.length)
  return AUX_ID_PATTERN.test(id) ? id : null
}

/**
 * Opções fechadas da auxiliar: sem Node, sandbox e contextIsolation ligados. Não
 * leva preload próprio (a auxiliar só hospeda DOM que a principal escreve), e o
 * `webviewTag` fica porque o bloco "Página Web" pode ser movido para lá.
 */
function auxWindowOptions(bounds, { show = true, backgroundColor = '#09090b', pip = false } = {}) {
  return {
    ...bounds,
    minWidth: pip ? 280 : 360,
    minHeight: pip ? 160 : 240,
    show,
    backgroundColor,
    title: 'Felixo AI Core',
    ...(pip ? { alwaysOnTop: true, fullscreenable: false } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webviewTag: true,
    },
  }
}

/**
 * @param {object} deps
 * @param {{ get: (key: string) => unknown, set: (key: string, value: unknown) => void }} [deps.settingsRepository]
 * @param {{ getAllDisplays?: () => object[], getPrimaryDisplay?: () => object, on?: Function, removeListener?: Function }} [deps.screenApi]
 * @param {(browserWindow: object) => void} deps.applyGuards - as mesmas guardas da principal
 * @param {boolean} [deps.show]
 */
function createAuxWindowManager({ settingsRepository, screenApi, applyGuards, show = true } = {}) {
  /** @type {Map<string, object>} */
  const windows = new Map()
  const reserved = new Set()

  const displays = () => screenApi?.getAllDisplays?.() ?? []

  function readSavedState(id) {
    try {
      return settingsRepository?.get(`${AUX_STATE_KEY_PREFIX}${id}.state`) ?? null
    } catch {
      return null
    }
  }

  function stateFor(id) {
    const primary = screenApi?.getPrimaryDisplay?.()
    const salvo = readSavedState(id)
    // PiP nova nasce no canto (o padrão do resolveWindowState centraliza); a que já foi movida volta para onde estava.
    if (isPipId(id) && !salvo) return { bounds: pipDefaultBounds(primary), isMaximized: false, isFullScreen: false }
    return resolveWindowState(salvo, displays(), primary, isPipId(id) ? PIP_DEFAULT_SIZE : AUX_DEFAULT_BOUNDS)
  }

  // A principal desenha o xterm da PiP (mesmo renderer): escondida na bandeja, ela
  // teria os timers estrangulados e a PiP atualizaria uma vez por segundo.
  let principal = null
  const pipsAbertas = () => [...windows.keys()].filter(isPipId).length
  function ajustarEstrangulamento() {
    const webContents = principal?.isDestroyed?.() ? null : principal?.webContents
    webContents?.setBackgroundThrottling?.(pipsAbertas() === 0)
  }

  /**
   * `setWindowOpenHandler` da principal. Devolve o resultado só para o formato
   * permitido (`about:blank` + nome de quadro com o prefixo fixo e id válido);
   * qualquer outro `window.open` devolve null e segue a política de links.
   */
  function windowOpenHandler(details) {
    const id = parseAuxFrameName(details?.frameName)
    if (!id || details?.url !== 'about:blank') return null
    if (windows.has(id)) return null
    if (windows.size + reserved.size >= MAX_AUX_WINDOWS && !reserved.has(id)) return { action: 'deny' }
    reserved.add(id)
    return {
      action: 'allow',
      overrideBrowserWindowOptions: auxWindowOptions(stateFor(id).bounds, {
        show,
        backgroundColor: readWindowBackground(settingsRepository),
        pip: isPipId(id),
      }),
    }
  }

  /** `did-create-window` da principal: registra a janela e aplica as guardas. */
  function onDidCreateWindow(child, details) {
    const id = parseAuxFrameName(details?.frameName)
    if (!id) return
    reserved.delete(id)
    windows.set(id, child)

    applyGuards(child)
    applyWindowState(child, stateFor(id))
    if (isPipId(id)) {
      // 'floating' fica acima das janelas comuns sem cobrir menus e diálogos do sistema.
      child.setAlwaysOnTop?.(true, 'floating')
      child.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true })
      ajustarEstrangulamento()
    }
    const stopPersisting = registerWindowStatePersistence(child, settingsRepository, `${AUX_STATE_KEY_PREFIX}${id}.state`)
    child.once('closed', () => {
      stopPersisting()
      if (windows.get(id) === child) windows.delete(id)
      if (isPipId(id)) ajustarEstrangulamento()
    })
  }

  /** Nenhuma auxiliar pode ser tratada como "a janela principal" (getMainWindow). */
  function isAuxWindow(browserWindow) {
    for (const item of windows.values()) if (item === browserWindow) return true
    return false
  }

  /** Traz de volta, para um monitor visível, a auxiliar cujo monitor sumiu. */
  function reconcileDisplays() {
    for (const child of windows.values()) {
      if (child.isDestroyed?.()) continue
      const atual = child.getBounds()
      const { bounds } = resolveWindowState({ bounds: atual }, displays(), screenApi?.getPrimaryDisplay?.(), atual)
      if (['x', 'y', 'width', 'height'].some((key) => bounds[key] !== atual[key])) child.setBounds(bounds)
    }
  }

  function closeAll() {
    for (const child of [...windows.values()]) {
      if (!child.isDestroyed?.()) child.close()
    }
  }

  /**
   * Liga o gerenciador à principal: registra as auxiliares que ela cria, fecha
   * todas quando ela fecha e reage a monitor que some ou muda de escala.
   */
  function attachTo(mainWindow) {
    principal = mainWindow
    mainWindow.webContents.on('did-create-window', onDidCreateWindow)
    screenApi?.on?.('display-removed', reconcileDisplays)
    screenApi?.on?.('display-metrics-changed', reconcileDisplays)
    // Esconder a principal (bandeja) leva as auxiliares junto; só destruí-la as fecha.
    // A PiP fica de fora: ela existe para seguir visível com o app escondido.
    const seguir = (acao) => () => {
      for (const [id, child] of windows) if (!isPipId(id) && !child.isDestroyed?.()) child[acao]()
    }
    mainWindow.on('hide', seguir('hide'))
    mainWindow.on('show', seguir('show'))
    mainWindow.once('closed', () => {
      screenApi?.removeListener?.('display-removed', reconcileDisplays)
      screenApi?.removeListener?.('display-metrics-changed', reconcileDisplays)
      closeAll()
    })
  }

  return {
    attachTo,
    closeAll,
    isAuxWindow,
    list: () => [...windows.keys()],
    onDidCreateWindow,
    reconcileDisplays,
    windowOpenHandler,
  }
}

module.exports = {
  AUX_FRAME_PREFIX,
  AUX_STATE_KEY_PREFIX,
  MAX_AUX_WINDOWS,
  PIP_ID_PREFIX,
  auxWindowOptions,
  createAuxWindowManager,
  isPipId,
  parseAuxFrameName,
  pipDefaultBounds,
}
