require('../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)
const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const {
  MAIN_WINDOW_STATE_KEY,
  registerWindowStatePersistence,
  resolveWindowState,
  revealWhenPainted,
} = require('./window-state.cjs')

const DEFAULT_BOUNDS = { width: 1320, height: 760 }
const primary = { workArea: { x: 0, y: 0, width: 1920, height: 1080 } }
const vertical = { workArea: { x: 1920, y: 0, width: 1080, height: 1920 } }

test('keeps bounds that still intersect a connected vertical monitor', () => {
  const state = resolveWindowState(
    {
      bounds: { x: 1980, y: 120, width: 900, height: 1500 },
      isMaximized: true,
      isFullScreen: false,
    },
    [primary, vertical],
    primary,
    DEFAULT_BOUNDS,
  )

  assert.deepEqual(state, {
    bounds: { x: 1980, y: 120, width: 900, height: 1500 },
    isMaximized: true,
    isFullScreen: false,
  })
})

test('centers the fallback on the primary monitor when the saved monitor disappeared', () => {
  const state = resolveWindowState(
    {
      bounds: { x: 2400, y: 120, width: 900, height: 1400 },
      isMaximized: false,
      isFullScreen: false,
    },
    [primary],
    primary,
    DEFAULT_BOUNDS,
  )

  assert.deepEqual(state.bounds, { x: 300, y: 160, width: 1320, height: 760 })
})

test('preserves maximized and full-screen state while falling back to a visible monitor', () => {
  const state = resolveWindowState(
    {
      bounds: { x: -3000, y: 0, width: 1200, height: 800 },
      isMaximized: true,
      isFullScreen: true,
    },
    [primary],
    primary,
    DEFAULT_BOUNDS,
  )

  assert.equal(state.isMaximized, true)
  assert.equal(state.isFullScreen, true)
  assert.deepEqual(state.bounds, { x: 300, y: 160, width: 1320, height: 760 })
})

test('uses a stable settings key for the main window state', () => {
  assert.equal(MAIN_WINDOW_STATE_KEY, 'window.main.state')
})

test('persists the normal bounds and state immediately when closing', () => {
  const browserWindow = new EventEmitter()
  browserWindow.isMaximized = () => true
  browserWindow.isFullScreen = () => false
  browserWindow.getNormalBounds = () => ({ x: 1920, y: 100, width: 900, height: 1400 })
  browserWindow.getBounds = () => ({ x: 0, y: 0, width: 1, height: 1 })
  const writes = []
  const stop = registerWindowStatePersistence(browserWindow, {
    set: (key, value) => writes.push({ key, value }),
  })

  browserWindow.emit('close')
  stop()

  assert.deepEqual(writes, [
    {
      key: MAIN_WINDOW_STATE_KEY,
      value: {
        bounds: { x: 1920, y: 100, width: 900, height: 1400 },
        isMaximized: true,
        isFullScreen: false,
      },
    },
  ])
})

function janelaOculta() {
  const win = new EventEmitter()
  win.chamadas = []
  win.isDestroyed = () => false
  win.show = () => win.chamadas.push('show')
  win.maximize = () => win.chamadas.push('maximize')
  win.setFullScreen = () => win.chamadas.push('fullscreen')
  return win
}

test('a janela só aparece depois do primeiro quadro pronto, já maximizada', () => {
  const win = janelaOculta()
  const agendados = []
  revealWhenPainted(win, { isMaximized: true, isFullScreen: false }, { schedule: (fn) => agendados.push(fn) })
  assert.deepEqual(win.chamadas, [])
  win.emit('ready-to-show')
  assert.deepEqual(win.chamadas, ['maximize', 'show'])
  agendados[0]()
  assert.deepEqual(win.chamadas, ['maximize', 'show'], 'o limite de tempo não mostra de novo')
})

test('sem o primeiro quadro, o limite de tempo mostra a janela assim mesmo', () => {
  const win = janelaOculta()
  const agendados = []
  revealWhenPainted(win, { isMaximized: false, isFullScreen: false }, { schedule: (fn) => agendados.push(fn) })
  agendados[0]()
  assert.deepEqual(win.chamadas, ['show'])
})
