'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const {
  APP_INDEX_URL,
  APP_ORIGIN,
  LOCAL_IMAGE_PATH,
  MIGRATION_PAGE_URL,
  createAppProtocolHandler,
  isLocalImageRequest,
  registerAppScheme,
  resolveBuildFile,
} = require('./app-protocol.cjs')

for (const [nome, pathImpl, dist] of [
  ['POSIX', path.posix, '/opt/felixo/resources/app.asar/dist'],
  ['Windows', path.win32, 'C:\\Programas\\Felixo AI Core\\resources\\app.asar\\dist'],
]) {
  test(`o build sai só de dentro do dist (${nome})`, () => {
    const dentro = (url) => resolveBuildFile(url, dist, pathImpl)
    assert.equal(dentro(APP_INDEX_URL), pathImpl.join(dist, 'index.html'))
    assert.equal(dentro(`${APP_ORIGIN}/`), pathImpl.join(dist, 'index.html'))
    assert.equal(dentro(`${APP_ORIGIN}/assets/../sounds/notification.mp3`), pathImpl.join(dist, 'sounds', 'notification.mp3'))
    // O parser de URL já desfaz `..` e `%2e%2e` antes de chegar aqui: fica na raiz do dist.
    assert.equal(dentro(`${APP_ORIGIN}/%2e%2e/%2e%2e/package.json`), pathImpl.join(dist, 'package.json'))
    for (const fora of [
      `${APP_ORIGIN}/..%2f..%2fpackage.json`,
      `${APP_ORIGIN}/assets/..%2f..%2f..%2fsegredo.txt`,
      `${APP_ORIGIN}/%00.html`,
      `${APP_ORIGIN}/%E0%A4%A`,
      'app://outro-host/index.html',
      'não é url',
    ]) {
      assert.equal(dentro(fora), null, fora)
    }
  })
}

test('no Windows, barra invertida codificada também não sai do dist', () => {
  const dist = 'C:\\app\\dist'
  assert.equal(resolveBuildFile(`${APP_ORIGIN}/..%5c..%5cWindows%5cwin.ini`, dist, path.win32), null)
})

test('a rota da imagem local só aceita caminho absoluto de imagem raster', () => {
  assert.equal(isLocalImageRequest('/home/p/proj/assets/logo.png', path.posix), true)
  assert.equal(isLocalImageRequest('C:/Users/P/proj/assets/Logo.JPG', path.win32), true)
  for (const recusado of ['assets/logo.png', '/home/p/segredo.txt', '/home/p/desenho.svg', '/home/p/a\0.png', '', null, 42]) {
    assert.equal(isLocalImageRequest(recusado, path.posix), false, String(recusado))
  }
})

function handler(overrides = {}) {
  const servidos = []
  const handle = createAppProtocolHandler({
    distDir: path.resolve('/dist-falso'),
    fetchFile: (file) => {
      servidos.push(file)
      return new Response('conteúdo', { status: 200 })
    },
    isFile: (file) => !file.endsWith('inexistente.js'),
    ...overrides,
  })
  return { handle: (url) => handle({ url }), servidos }
}

test('serve o build e responde 404 para o que não é do build', async () => {
  const { handle, servidos } = handler()
  assert.equal((await handle(APP_INDEX_URL)).status, 200)
  assert.deepEqual(servidos, [path.join(path.resolve('/dist-falso'), 'index.html')])
  assert.equal((await handle(`${APP_ORIGIN}/assets/inexistente.js`)).status, 404)
  assert.equal((await handle(`${APP_ORIGIN}/..%2f..%2fpackage.json`)).status, 404)
  assert.equal((await handle('app://outro/index.html')).status, 404)
  assert.equal(servidos.length, 1)
})

test('o que o net.fetch não consegue ler (uma pasta, um arquivo que sumiu) vira 404, não erro do protocolo', async () => {
  const { handle } = handler({
    fetchFile: () => Promise.reject(new Error('ERR_FILE_NOT_FOUND')),
  })
  assert.equal((await handle(`${APP_ORIGIN}/assets/`)).status, 404)
})

test('a página de migração é HTML vazio, sem o app', async () => {
  const resposta = await handler().handle(MIGRATION_PAGE_URL)
  assert.equal(resposta.status, 200)
  assert.match(resposta.headers.get('content-type'), /text\/html/)
  assert.doesNotMatch(await resposta.text(), /<script/i)
})

test('a imagem local passa pela autorização do processo principal e pelo caminho real', async () => {
  const pedido = (caminho) => `${APP_ORIGIN}${LOCAL_IMAGE_PATH}?caminho=${encodeURIComponent(caminho)}`
  const real = path.resolve('/projeto/assets/logo.png')

  // Sem autorização configurada (modo de smoke, antes dos handlers): nada sai.
  assert.equal((await handler().handle(pedido(real))).status, 403)

  const autorizados = []
  const { handle, servidos } = handler({
    authorizeLocalImage: (caminho) => {
      autorizados.push(caminho)
      if (caminho.includes('fora')) throw new Error('Arquivo fora dos projetos registrados.')
      if (caminho.includes('link-para-texto')) return path.resolve('/projeto/segredo.txt')
      return real
    },
  })
  assert.equal((await handle(pedido(real))).status, 200)
  assert.deepEqual(servidos, [real])
  assert.equal((await handle(pedido(path.resolve('/fora/foto.png')))).status, 403)
  // `foto.png` que é link simbólico para um texto: o destino real decide.
  assert.equal((await handle(pedido(path.resolve('/projeto/link-para-texto.png')))).status, 403)
  // Forma errada nem chega à autorização.
  assert.equal((await handle(pedido('relativo/foto.png'))).status, 403)
  assert.equal((await handle(pedido(path.resolve('/projeto/notas.md')))).status, 403)
  assert.equal(autorizados.length, 3)
  assert.equal(servidos.length, 1)
})

test('main.cjs: esquema antes do ready, protocolo antes do smoke, imagem pelo text-file-access e migração antes da janela', () => {
  const fs = require('node:fs')
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8')
  const em = (trecho) => {
    const indice = main.indexOf(trecho)
    assert.ok(indice >= 0, `main.cjs sem: ${trecho}`)
    return indice
  }
  assert.ok(em('registerAppScheme(protocol)') < em('app.whenReady().then('))
  assert.ok(em('app.whenReady().then(') < em('registerAppProtocol({'))
  assert.ok(em('registerAppProtocol({') < em('runPackagedReleaseSmoke({ app })'))
  em('textFileHandlers.authorizeImageNear(filePath)')
  assert.ok(em('migrateFileOriginStorage({') < em('mainWindow = createMainWindow({'))
  // Sem isto, as janelas ocultas da migração fechavam o app antes de ele abrir.
  em('mainWindowCreated: mainWindow !== null')
})

test('o esquema é registrado com origem, contexto seguro e fetch', () => {
  const registrados = []
  registerAppScheme({ registerSchemesAsPrivileged: (lista) => registrados.push(...lista) })
  assert.equal(registrados.length, 1)
  assert.equal(registrados[0].scheme, 'app')
  assert.equal(registrados[0].privileges.standard, true)
  assert.equal(registrados[0].privileges.secure, true)
  assert.equal(registrados[0].privileges.supportFetchAPI, true)
})
