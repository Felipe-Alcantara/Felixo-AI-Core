const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveWindowOpenAction } = require('./webview-lifecycle.cjs')

const SECURE_WEB_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
}

test('allows a real popup window for a programmatic window.open (default disposition) — the common OAuth login-button case', () => {
  const result = resolveWindowOpenAction('default')

  assert.equal(result.action, 'allow')
  assert.deepEqual(result.overrideBrowserWindowOptions.webPreferences, SECURE_WEB_PREFERENCES)
})

test('allows a real popup window for the Shift+click new-window disposition', () => {
  const result = resolveWindowOpenAction('new-window')

  assert.equal(result.action, 'allow')
  assert.deepEqual(result.overrideBrowserWindowOptions.webPreferences, SECURE_WEB_PREFERENCES)
})

test('allows a real popup window for any other disposition Chromium reports', () => {
  const result = resolveWindowOpenAction('other')

  assert.equal(result.action, 'allow')
  assert.deepEqual(result.overrideBrowserWindowOptions.webPreferences, SECURE_WEB_PREFERENCES)
})

test('denies target=_blank links so they navigate inside the same block', () => {
  assert.deepEqual(resolveWindowOpenAction('foreground-tab'), { action: 'deny' })
  assert.deepEqual(resolveWindowOpenAction('background-tab'), { action: 'deny' })
})
