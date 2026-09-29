const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { pathToFileURL } = require('node:url')
const path = require('node:path')

const { MAX_EXTERNAL_URL_CHARS } = require('./external-url-policy.cjs')
const {
  hardenWebviewAttach,
  isAppDocument,
  isWebviewDestination,
  registerMainWindowNavigationGuard,
  registerWebviewAttachGuard,
} = require('./navigation-guard.cjs')

const BUILD_URL = pathToFileURL(path.resolve('dist', 'index.html')).href
const DEV_URL = 'http://localhost:5173/'

/**
 * @param {{ currentUrl?: string }} [options] - o que `getURL()` devolve: a URL
 *   que o Chromium de fato carregou na janela
 */
function fakeEmitter({ currentUrl = '' } = {}) {
  const listeners = new Map()
  return {
    on(event, listener) {
      listeners.set(event, listener)
    },
    emit(event, ...args) {
      listeners.get(event)?.(...args)
    },
    getURL() {
      return currentUrl
    },
  }
}

function navigationEvent(url) {
  return {
    url,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true
    },
  }
}

test('o app é só o próprio documento: o mesmo arquivo do build ou a origem do Vite', () => {
  assert.equal(isAppDocument(BUILD_URL, BUILD_URL), true)
  assert.equal(isAppDocument(`${BUILD_URL}?x=1#/canvas`, BUILD_URL), true)
  assert.equal(isAppDocument(pathToFileURL(path.resolve('dist', 'outro.html')).href, BUILD_URL), false)
  assert.equal(isAppDocument('file:///C:/Users/pessoa/SEGREDO.html', BUILD_URL), false)
  assert.equal(isAppDocument('https://example.com/', BUILD_URL), false)

  assert.equal(isAppDocument('http://localhost:5173/src/main.tsx', DEV_URL), true)
  assert.equal(isAppDocument('http://localhost:5174/', DEV_URL), false)
  assert.equal(isAppDocument('https://localhost:5173/', DEV_URL), false)
  assert.equal(isAppDocument('não é url', DEV_URL), false)
})

test('documento de origem opaca nunca serve de referência de app', () => {
  // `about:blank`, `data:` e a página de erro do Chromium têm origem "null";
  // comparar origem com origem deixaria passar qualquer outro destino opaco.
  for (const reference of ['about:blank', 'chrome-error://chromewebdata/', 'data:text/html,app']) {
    assert.equal(isAppDocument('data:text/html,<script>alert(1)</script>', reference), false, reference)
    assert.equal(isAppDocument('javascript:alert(1)', reference), false, reference)
    assert.equal(isAppDocument(reference, reference), false, reference)
  }
})

test('o documento que o Chromium carregou é app mesmo quando o appUrl o escreve de outro jeito', () => {
  // O mesmo arquivo em duas grafias: o Chromium mantém a unidade maiúscula e o
  // `~` do nome 8.3 cru; o `pathToFileURL` do caminho configurado deu `f:` e `%7E`.
  const loadedUrl = 'file:///F:/Users/PESSOA~1/app/dist/index.html'
  const appUrl = 'file:///f:/Users/PESSOA%7E1/app/dist/index.html'
  const webContents = fakeEmitter({ currentUrl: loadedUrl })
  const opened = []
  registerMainWindowNavigationGuard(webContents, {
    appUrl,
    openExternal: async (url) => opened.push(url),
  })

  const inApp = navigationEvent(`${loadedUrl}#/canvas`)
  // Pré-condição: só o appUrl bloquearia — é o `getURL()` que salva a navegação.
  assert.equal(isAppDocument(inApp.url, appUrl), false)
  webContents.emit('will-navigate', inApp, inApp.url)
  assert.equal(inApp.defaultPrevented, false)

  const redirect = navigationEvent(`${loadedUrl}?de=novo`)
  webContents.emit('will-redirect', redirect, redirect.url)
  assert.equal(redirect.defaultPrevented, false)

  const outside = ['file:///F:/Users/PESSOA~1/app/dist/outro.html', 'file:///C:/Users/pessoa/SEGREDO.html']
  for (const url of outside) {
    const event = navigationEvent(url)
    webContents.emit('will-navigate', event, url)
    assert.equal(event.defaultPrevented, true, url)
  }
  assert.deepEqual(opened, outside)
})

test('janela parada numa página de origem opaca não libera outro destino opaco', () => {
  const webContents = fakeEmitter({ currentUrl: 'about:blank' })
  registerMainWindowNavigationGuard(webContents, { appUrl: BUILD_URL, openExternal: async () => {} })

  const event = navigationEvent('data:text/html,<script>alert(1)</script>')
  webContents.emit('will-navigate', event, event.url)
  assert.equal(event.defaultPrevented, true)
})

test('a janela principal nega sair do app e manda só link aprovado ao opener', async () => {
  const webContents = fakeEmitter()
  const opened = []
  registerMainWindowNavigationGuard(webContents, {
    appUrl: BUILD_URL,
    openExternal: async (url) => {
      opened.push(url)
    },
  })

  const inApp = navigationEvent(`${BUILD_URL}#/canvas`)
  webContents.emit('will-navigate', inApp, inApp.url)
  assert.equal(inApp.defaultPrevented, false)

  for (const url of ['https://example.com/', 'file:///C:/Users/pessoa/SEGREDO.html', 'javascript:alert(1)']) {
    const event = navigationEvent(url)
    webContents.emit('will-navigate', event, url)
    assert.equal(event.defaultPrevented, true, url)
  }
  // O opener aplica a política; aqui só se prova que toda saída passa por ele.
  assert.deepEqual(opened, ['https://example.com/', 'file:///C:/Users/pessoa/SEGREDO.html', 'javascript:alert(1)'])
})

test('a guarda lê a URL do evento quando o Electron não a passa como argumento', () => {
  const webContents = fakeEmitter()
  const opened = []
  registerMainWindowNavigationGuard(webContents, {
    appUrl: BUILD_URL,
    openExternal: async (url) => opened.push(url),
  })

  const event = navigationEvent('https://example.com/')
  webContents.emit('will-navigate', event)
  assert.equal(event.defaultPrevented, true)
  assert.deepEqual(opened, ['https://example.com/'])
})

test('redirecionamento para fora do app é negado e não abre nada', () => {
  const webContents = fakeEmitter()
  const opened = []
  registerMainWindowNavigationGuard(webContents, {
    appUrl: DEV_URL,
    openExternal: async (url) => opened.push(url),
  })

  const outside = navigationEvent('https://evil.example/')
  webContents.emit('will-redirect', outside, outside.url)
  const inside = navigationEvent('http://localhost:5173/index.html')
  webContents.emit('will-redirect', inside, inside.url)

  assert.equal(outside.defaultPrevented, true)
  assert.equal(inside.defaultPrevented, false)
  assert.deepEqual(opened, [])
})

test('todo webview anexado perde preload e Node, não importa o que o renderer pediu', () => {
  const webPreferences = {
    preload: 'C:\\malicioso.js',
    preloadURL: 'file:///C:/malicioso.js',
    nodeIntegration: true,
    nodeIntegrationInSubFrames: true,
    nodeIntegrationInWorker: true,
    contextIsolation: false,
    sandbox: false,
    webSecurity: false,
    allowRunningInsecureContent: true,
    experimentalFeatures: true,
  }

  const params = { src: 'https://example.com/' }
  hardenWebviewAttach(webPreferences, params)
  assert.equal(params.src, 'https://example.com/')
  assert.deepEqual(webPreferences, {
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    nodeIntegrationInWorker: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
  })
})

test('webview só nasce numa página web', () => {
  for (const src of ['https://example.com/', 'http://localhost:3000/', 'about:blank']) {
    assert.equal(isWebviewDestination(src), true, src)
  }
  for (const src of [
    'file:///C:/Users/pessoa/.ssh/id_ed25519',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'chrome://settings',
    'devtools://devtools/bundled/inspector.html',
    'view-source:https://example.com/',
    'mailto:pessoa@example.com',
    '',
    undefined,
  ]) {
    assert.equal(isWebviewDestination(src), false, String(src))
  }
})

test('o attach guard troca por about:blank o destino recusado, sem destruir o guest', () => {
  const webContents = fakeEmitter()
  registerWebviewAttachGuard({ webContents })

  for (const src of ['https://example.com/', 'about:blank']) {
    const allowed = navigationEvent()
    const params = { src }
    webContents.emit('will-attach-webview', allowed, { nodeIntegration: true }, params)
    assert.equal(allowed.defaultPrevented, false, src)
    assert.equal(params.src, src)
  }

  // Os dois primeiros são o bug que isto conserta: URL salva num bloco "Página
  // Web" que a política recusa. Com `preventDefault` o guest era destruído e o
  // bloco morria ao remontar; agora ele nasce em branco e aceita outra URL.
  const refusedSources = [
    `https://example.com/#${'a'.repeat(MAX_EXTERNAL_URL_CHARS)}`,
    'https://pessoa:senha@example.com/',
    'file:///C:/x.html',
    'javascript:alert(1)',
    undefined,
  ]
  for (const src of refusedSources) {
    const refused = navigationEvent()
    const preferences = { preload: 'x.js', nodeIntegration: true }
    const params = { src }
    webContents.emit('will-attach-webview', refused, preferences, params)

    const label = String(src).slice(0, 40)
    assert.equal(refused.defaultPrevented, false, label)
    assert.equal(params.src, 'about:blank', label)
    assert.equal(preferences.preload, undefined, label)
    assert.equal(preferences.nodeIntegration, false, label)
  }
})

/**
 * Índices das ocorrências de `snippet` que são código, não comentário: pula a
 * que tem `//` antes na mesma linha ou está numa linha de bloco de comentário
 * (começa com `*`). Basta para os arquivos lidos aqui, que citam as mesmas
 * chamadas em comentários — o `main.cjs` fala de `app.whenReady()` num
 * comentário ANTES do `registerSessionSecurity`.
 *
 * @param {string} source
 * @param {string} snippet
 */
function codeIndexes(source, snippet) {
  const indexes = []
  for (let index = source.indexOf(snippet); index !== -1; index = source.indexOf(snippet, index + 1)) {
    const before = source.slice(source.lastIndexOf('\n', index) + 1, index)
    const trimmed = before.trimStart()
    if (before.includes('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue
    indexes.push(index)
  }
  return indexes
}

// Os dois testes abaixo leem o fonte em vez de executar, de propósito.
// `createMainWindow` constrói um `BrowserWindow` real e `main.cjs` sobe o app
// inteiro ao ser carregado — nenhum dos dois roda num `node --test`. Sem esta
// trava, apagar uma linha de fiação desligaria a barreira sem nenhum teste
// falhar: as funções continuariam testadas, só que ninguém as chamaria.

test('a janela principal nega window.open e liga as guardas antes de carregar o app', () => {
  const source = readFileSync(path.join(__dirname, '..', 'windows', 'main-window.cjs'), 'utf8')
  const firstCall = (snippet) => codeIndexes(source, snippet)[0] ?? -1

  const denyOpen = firstCall('mainWindow.webContents.setWindowOpenHandler(')
  const navigationGuard = firstCall('registerMainWindowNavigationGuard(mainWindow.webContents,')
  const webviewLifecycle = firstCall('registerWebviewLifecycle(mainWindow)')
  const loads = [...codeIndexes(source, 'mainWindow.loadFile('), ...codeIndexes(source, 'mainWindow.loadURL(')]

  assert.notEqual(denyOpen, -1, 'main-window.cjs deixou de chamar setWindowOpenHandler')
  assert.notEqual(navigationGuard, -1, 'main-window.cjs deixou de chamar registerMainWindowNavigationGuard')
  assert.notEqual(webviewLifecycle, -1, 'main-window.cjs deixou de chamar registerWebviewLifecycle')
  assert.ok(loads.length > 0, 'main-window.cjs não carrega mais o app do jeito esperado; revise esta trava')

  // Registrado depois do load, o primeiro documento já poderia abrir janela
  // ou anexar webview sem guarda.
  const firstLoad = Math.min(...loads)
  for (const [name, index] of Object.entries({ denyOpen, navigationGuard, webviewLifecycle })) {
    assert.ok(index < firstLoad, `${name} precisa vir antes do primeiro load`)
  }

  // O handler de `window.open` nega a janela, abre pelo opener com a política
  // e avisa a própria janela quando o link não abre.
  const handlerCall = source.slice(denyOpen, source.indexOf('registerMainWindowNavigationGuard(', denyOpen))
  assert.match(handlerCall, /createExternalWindowOpenHandler\(/)
  assert.match(handlerCall, /open: openExternal\b/)
  assert.match(handlerCall, /notify:[\s\S]*webContents\.send\(EXTERNAL_OPEN_FAILED_CHANNEL/)

  // Os dois (handler e guarda) saem pelo mesmo opener, que passa pela política
  // de URL e pelo shell da instância (o da plataforma ou o da automação).
  const guardCall = source.slice(navigationGuard, source.indexOf('})', navigationGuard))
  assert.match(guardCall, /\bopenExternal\b/)
  assert.match(source, /const openExternal = \(url\) => openExternalUrl\(url, electronShell\)/)
})

test('o main registra a segurança de sessão antes de app.whenReady()', () => {
  // Antes do `ready` porque a permissão `openExternal` de toda sessão precisa
  // estar no lugar antes de qualquer sessão existir.
  const source = readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8')
  const register = codeIndexes(source, 'registerSessionSecurity(app, session)')
  const whenReady = codeIndexes(source, 'app.whenReady()')

  assert.ok(register.length > 0, 'main.cjs deixou de chamar registerSessionSecurity(app, session)')
  assert.ok(whenReady.length > 0, 'main.cjs não chama mais app.whenReady(); revise esta trava')
  assert.ok(register[0] < whenReady[0], 'registerSessionSecurity precisa vir antes de app.whenReady()')
})
