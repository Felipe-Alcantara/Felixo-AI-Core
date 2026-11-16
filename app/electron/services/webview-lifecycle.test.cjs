const test = require('node:test')
const assert = require('node:assert/strict')
const {
  applyWindowOpenPolicy,
  createPopupTracker,
  popupWindowTitle,
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
let fakeIds = 0

function createFakeWebContents(url = 'about:blank') {
  return {
    id: ++fakeIds,
    url,
    getURL() {
      return this.url
    },
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

/** Janela de popup falsa: títulos gravados, vários ouvintes por evento e close() que emite 'closed'. */
function createFakeWindow(url = 'about:blank') {
  const listeners = new Map()
  return {
    webContents: createFakeWebContents(url),
    titles: [],
    destroyed: false,
    on(event, listener) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
    },
    emit(event, ...args) {
      for (const listener of listeners.get(event) ?? []) listener(...args)
    },
    setTitle(title) {
      this.titles.push(title)
    },
    isDestroyed() {
      return this.destroyed
    },
    close() {
      this.destroyed = true
      this.emit('closed')
    },
  }
}

test('the policy follows popups, so a child window cannot open unrestricted windows', () => {
  const webContents = createFakeWebContents()
  const childWindow = createFakeWindow()

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
test('o título do popup mostra o site antes do título da página; http fica visível', () => {
  assert.equal(popupWindowTitle('https://accounts.google.com/o/oauth2/auth?x=1', 'Fazer login'), 'accounts.google.com — Fazer login')
  assert.equal(popupWindowTitle('https://accounts.google.com/', 'accounts.google.com'), 'accounts.google.com')
  assert.equal(popupWindowTitle('http://127.0.0.1:8787/popup', ''), 'http://127.0.0.1:8787')
  assert.equal(popupWindowTitle('about:blank', 'Google'), 'Abrindo… — Google')
  assert.equal(popupWindowTitle(undefined), 'Abrindo…')
})

test('a janela do popup mantém o site no título, mesmo quando a página troca o dela', () => {
  const opener = createFakeWebContents('https://app.exemplo.com/')
  const popup = createFakeWindow('about:blank')
  applyWindowOpenPolicy(opener)
  opener.emit('did-create-window', popup)
  assert.equal(popup.titles.at(-1), 'Abrindo…')

  popup.webContents.url = 'https://accounts.google.com/signin'
  popup.webContents.emit('did-navigate')
  assert.equal(popup.titles.at(-1), 'accounts.google.com')

  let prevented = false
  popup.emit('page-title-updated', { preventDefault: () => { prevented = true } }, 'Banco do Brasil — entre aqui')
  assert.equal(prevented, true, 'a página não troca o título da janela sozinha')
  assert.equal(popup.titles.at(-1), 'accounts.google.com — Banco do Brasil — entre aqui')
})

function blockWithLimit({ now } = {}) {
  const tracker = createPopupTracker({ max: 2, ...(now ? { now } : {}) })
  const block = createFakeWebContents('https://app.exemplo.com/')
  const blocked = []
  applyWindowOpenPolicy(block, undefined, { tracker, block, onPopupBlocked: (who, max) => blocked.push([who.id, max]) })
  const open = (contents = block) => contents.windowOpenHandler({ url: 'https://login.exemplo.com/', disposition: 'default' }).action
  return { tracker, block, blocked, open }
}

test('no máximo 2 popups por bloco: o terceiro window.open é negado e o bloco é avisado; fechar libera a vaga', () => {
  const { tracker, block, blocked, open } = blockWithLimit()
  const primeira = createFakeWindow('https://login.exemplo.com/')
  assert.equal(open(), 'allow')
  block.emit('did-create-window', primeira)
  assert.equal(open(), 'allow')
  block.emit('did-create-window', createFakeWindow('https://login.exemplo.com/'))
  assert.equal(tracker.count(block.id), 2)

  for (let i = 0; i < 5; i += 1) assert.equal(open(), 'deny', 'window.open em loop não passa do limite')
  assert.equal(blocked.length, 5)
  assert.deepEqual(blocked[0], [block.id, 2])

  primeira.close()
  assert.equal(tracker.count(block.id), 1)
  assert.equal(open(), 'allow', 'a janela fechada devolve a vaga')
})

test('popup aberto por um popup conta no mesmo bloco; link target=_blank não conta', () => {
  const { tracker, block, open } = blockWithLimit()
  const popup = createFakeWindow('https://login.exemplo.com/')
  assert.equal(open(), 'allow')
  block.emit('did-create-window', popup)
  assert.equal(open(popup.webContents), 'allow', 'o popup herda o limite do bloco')
  popup.webContents.emit('did-create-window', createFakeWindow())
  assert.equal(tracker.count(block.id), 2)
  assert.equal(open(popup.webContents), 'deny')
  assert.deepEqual(block.windowOpenHandler({ url: 'https://outro.exemplo.com/', disposition: 'foreground-tab' }), { action: 'deny' })
  assert.deepEqual(block.loadedUrls, ['https://outro.exemplo.com/'], 'o link segue abrindo dentro do bloco')
})

test('vaga de popup aprovado que nunca nasceu expira, para não travar o bloco', () => {
  let clock = 0
  const { open } = blockWithLimit({ now: () => clock })
  assert.equal(open(), 'allow')
  assert.equal(open(), 'allow')
  assert.equal(open(), 'deny')
  clock = 10_001
  assert.equal(open(), 'allow')
})

test('remover o bloco (webview destruído) fecha os popups dele', () => {
  const mainWebContents = createFakeWebContents()
  registerWebviewLifecycle({ webContents: mainWebContents })
  const guest = createFakeWebContents('https://app.exemplo.com/')
  mainWebContents.emit('did-attach-webview', {}, guest)
  const popups = [createFakeWindow('https://login.exemplo.com/'), createFakeWindow('https://login.exemplo.com/')]
  for (const popup of popups) {
    assert.equal(guest.windowOpenHandler({ url: 'https://login.exemplo.com/', disposition: 'default' }).action, 'allow')
    guest.emit('did-create-window', popup)
  }
  assert.equal(guest.windowOpenHandler({ url: 'https://login.exemplo.com/', disposition: 'default' }).action, 'deny')

  guest.emit('destroyed')
  assert.deepEqual(popups.map((popup) => popup.destroyed), [true, true])
})
