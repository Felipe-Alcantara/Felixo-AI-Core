const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveWindowOpenAction } = require('./webview-lifecycle.cjs')

test('allows a real popup window for OAuth-style window.open (new-window disposition)', () => {
  const result = resolveWindowOpenAction('new-window')

  assert.equal(result.action, 'allow')
  assert.deepEqual(result.overrideBrowserWindowOptions.webPreferences, {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  })
})

test('denies target=_blank links so they navigate inside the same block', () => {
  assert.deepEqual(resolveWindowOpenAction('foreground-tab'), { action: 'deny' })
  assert.deepEqual(resolveWindowOpenAction('background-tab'), { action: 'deny' })
})

test('denies unknown dispositions by default', () => {
  assert.deepEqual(resolveWindowOpenAction('other'), { action: 'deny' })
  assert.deepEqual(resolveWindowOpenAction(undefined), { action: 'deny' })
})
