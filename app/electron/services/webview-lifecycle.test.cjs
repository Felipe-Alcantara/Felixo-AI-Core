const test = require('node:test')
const assert = require('node:assert/strict')
const {
  applyWindowOpenPolicy,
  resolveWindowOpenAction,
} = require('./webview-lifecycle.cjs')

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

/** Minimal stand-in for an Electron WebContents, recording what was wired. */
function createFakeWebContents() {
  return {
    windowOpenHandler: null,
    listeners: new Map(),
    loadedUrls: [],
    setWindowOpenHandler(handler) {
      this.windowOpenHandler = handler
    },
    on(event, listener) {
      this.listeners.set(event, listener)
    },
    loadURL(url) {
      this.loadedUrls.push(url)
    },
    emit(event, ...args) {
      this.listeners.get(event)?.(...args)
    },
  }
}

test('a target=_blank link navigates the same webview instead of opening a window', () => {
  const webContents = createFakeWebContents()

  applyWindowOpenPolicy(webContents)
  const result = webContents.windowOpenHandler({
    url: 'https://example.com/página',
    disposition: 'foreground-tab',
  })

  assert.deepEqual(result, { action: 'deny' })
  assert.deepEqual(webContents.loadedUrls, ['https://example.com/página'])
})

test('an allowed popup does not navigate the opener away from its page', () => {
  const webContents = createFakeWebContents()

  applyWindowOpenPolicy(webContents)
  const result = webContents.windowOpenHandler({
    url: 'https://accounts.example.com/oauth',
    disposition: 'default',
  })

  assert.equal(result.action, 'allow')
  assert.deepEqual(webContents.loadedUrls, [])
})

test('the policy follows popups, so a child window cannot open unrestricted windows', () => {
  const webContents = createFakeWebContents()
  const childWindow = { webContents: createFakeWebContents() }

  applyWindowOpenPolicy(webContents)
  webContents.emit('did-create-window', childWindow)

  assert.equal(
    typeof childWindow.webContents.windowOpenHandler,
    'function',
    'the popup should have inherited the window-open policy',
  )
  assert.deepEqual(
    childWindow.webContents.windowOpenHandler({
      url: 'https://example.com/outra',
      disposition: 'background-tab',
    }),
    { action: 'deny' },
  )
})
