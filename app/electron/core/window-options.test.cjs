const test = require('node:test')
const assert = require('node:assert/strict')
const { mainWindowOptions } = require('./window-options.cjs')

test('main window keeps vscode-like resize controls enabled', () => {
  assert.equal(mainWindowOptions.resizable, true)
  assert.equal(mainWindowOptions.maximizable, true)
  assert.equal(mainWindowOptions.fullscreenable, true)
  assert.ok(mainWindowOptions.minWidth >= 720)
  assert.ok(mainWindowOptions.minHeight >= 500)
})

test('main window is visible by default outside the isolated DevTools process', () => {
  assert.equal(mainWindowOptions.show, true)
})
