const test = require('node:test')
const assert = require('node:assert/strict')
const {
  applyZoomAction,
  clampZoomLevel,
  getZoomAction,
} = require('./window-zoom-shortcuts.cjs')

test('detects zoom shortcuts across common keyboard layouts', () => {
  assert.equal(
    getZoomAction({ type: 'keyDown', control: true, key: '=' }),
    'in',
  )
  assert.equal(
    getZoomAction({ type: 'keyDown', control: true, key: '+' }),
    'in',
  )
  assert.equal(
    getZoomAction({ type: 'keyDown', control: true, key: '-' }),
    'out',
  )
  assert.equal(
    getZoomAction({ type: 'keyDown', control: true, key: '0' }),
    'reset',
  )
})

test('ignores non-zoom shortcuts', () => {
  assert.equal(
    getZoomAction({ type: 'keyDown', control: false, meta: false, key: '=' }),
    null,
  )
  assert.equal(
    getZoomAction({ type: 'keyUp', control: true, key: '=' }),
    null,
  )
  assert.equal(
    getZoomAction({ type: 'keyDown', control: true, alt: true, key: '=' }),
    null,
  )
})

test('clamps zoom level to supported bounds', () => {
  assert.equal(clampZoomLevel(4), 3)
  assert.equal(clampZoomLevel(-4), -3)
  assert.equal(clampZoomLevel(1), 1)
})

test('applies zoom actions to webContents', () => {
  const levels = []
  const webContents = {
    currentZoomLevel: 0,
    getZoomLevel() {
      return this.currentZoomLevel
    },
    setZoomLevel(value) {
      this.currentZoomLevel = value
      levels.push(value)
    },
  }

  applyZoomAction(webContents, 'in')
  applyZoomAction(webContents, 'out')
  applyZoomAction(webContents, 'reset')

  assert.deepEqual(levels, [0.5, 0, 0])
})
