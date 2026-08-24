const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const {
  MAIN_WINDOW_STATE_KEY,
  registerWindowStatePersistence,
  resolveWindowState,
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
