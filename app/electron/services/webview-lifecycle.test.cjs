const test = require('node:test')
const assert = require('node:assert/strict')
const {
  applyWindowOpenPolicy,
  registerWebviewLifecycle,
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
  // A forma serializada: o guest recebe exatamente o que a política validou.
  assert.deepEqual(webContents.loadedUrls, ['https://example.com/p%C3%A1gina'])
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

test('um link target=_blank para esquema que não é página web não navega o bloco', () => {
  const webContents = createFakeWebContents()

  applyWindowOpenPolicy(webContents)
  for (const url of [
    'file:///C:/Users/pessoa/.ssh/id_ed25519',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'chrome://settings',
    'vscode://file/C:/projeto/arquivo.ts',
    'mailto:pessoa@example.com',
  ]) {
    assert.deepEqual(webContents.windowOpenHandler({ url, disposition: 'foreground-tab' }), { action: 'deny' }, url)
  }
  assert.deepEqual(webContents.loadedUrls, [])
})

test('popup de login só abre para página web ou about:blank', () => {
  const webContents = createFakeWebContents()

  applyWindowOpenPolicy(webContents)
  assert.equal(webContents.windowOpenHandler({ url: 'about:blank', disposition: 'default' }).action, 'allow')
  assert.equal(
    webContents.windowOpenHandler({ url: 'https://accounts.example.com/o/oauth2', disposition: 'new-window' }).action,
    'allow',
  )
  assert.deepEqual(
    webContents.windowOpenHandler({ url: 'file:///C:/Windows/win.ini', disposition: 'default' }),
    { action: 'deny' },
  )
  assert.deepEqual(webContents.loadedUrls, [])
})

test('registerWebviewLifecycle liga o attach guard e a política de janelas de todo webview', () => {
  // Trava da fiação: as duas funções têm testes próprios, mas sem estes
  // listeners na janela principal nenhuma delas roda para um webview de verdade.
  const mainWebContents = createFakeWebContents()
  registerWebviewLifecycle({ webContents: mainWebContents })

  assert.equal(typeof mainWebContents.listeners.get('will-attach-webview'), 'function', 'will-attach-webview')
  assert.equal(typeof mainWebContents.listeners.get('did-attach-webview'), 'function', 'did-attach-webview')

  const attach = {
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true
    },
  }
  const webPreferences = { preload: 'C:\\malicioso.js', nodeIntegration: true }
  const params = { src: 'file:///C:/Users/pessoa/.ssh/id_ed25519' }
  mainWebContents.emit('will-attach-webview', attach, webPreferences, params)
  assert.equal(webPreferences.preload, undefined)
  assert.equal(webPreferences.nodeIntegration, false)
  assert.equal(params.src, 'about:blank')
  assert.equal(attach.defaultPrevented, false)

  const guest = createFakeWebContents()
  mainWebContents.emit('did-attach-webview', {}, guest)
  assert.equal(typeof guest.windowOpenHandler, 'function', 'o guest anexado precisa receber a política de janelas')
  assert.deepEqual(guest.windowOpenHandler({ url: 'file:///C:/Windows/win.ini', disposition: 'default' }), {
    action: 'deny',
  })
})

test('o link target=_blank para about:blank não recarrega o bloco em branco', () => {
  const webContents = createFakeWebContents()

  applyWindowOpenPolicy(webContents)
  assert.deepEqual(webContents.windowOpenHandler({ url: 'about:blank', disposition: 'foreground-tab' }), {
    action: 'deny',
  })
  assert.deepEqual(webContents.loadedUrls, [])
})
