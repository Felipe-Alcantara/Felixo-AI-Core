'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  EXCALIDRAW_ASSETS_DIR,
  EXCALIDRAW_FONTS_ROOT,
  listExcalidrawFonts,
  resolveDevFontRequest,
  stripExcalidrawCdnFallback,
} = require('./excalidraw-fonts.cjs')

test('tira do código instalado do Excalidraw a URL do CDN, uma vez, e só ela', () => {
  const prod = path.join(EXCALIDRAW_FONTS_ROOT, '..')
  const comFallback = fs
    .readdirSync(prod)
    .filter((nome) => nome.endsWith('.js'))
    .map((nome) => fs.readFileSync(path.join(prod, nome), 'utf8'))
    .filter((codigo) => codigo.includes('ASSETS_FALLBACK_URL'))

  assert.equal(comFallback.length, 1, 'o fallback mudou de lugar no pacote')
  const { code, removed } = stripExcalidrawCdnFallback(comFallback[0])
  assert.equal(removed, 1)
  assert.equal(code.length, comFallback[0].length - comFallback[0].match(/\w+\.push\(new URL\(\w+,\w+\.ASSETS_FALLBACK_URL\)\),/)[0].length)
  // A definição continua (é só uma string); o que some é o uso na lista de URLs.
  assert.match(code, /ASSETS_FALLBACK_URL/)
  assert.doesNotMatch(code, /\.push\(new URL\(\w+,\w+\.ASSETS_FALLBACK_URL\)\)/)
})

test('a lista de URLs da fonte fica só com a do build', () => {
  const trecho =
    'static createUrls(t){let n=t.replace(/^\\/+/,""),r=[];if(typeof window.EXCALIDRAW_ASSET_PATH=="string"){let o=this.normalizeBaseUrl(window.EXCALIDRAW_ASSET_PATH);r.push(new URL(n,o))}return r.push(new URL(n,jn.ASSETS_FALLBACK_URL)),r}'
  const { code, removed } = stripExcalidrawCdnFallback(trecho)
  assert.equal(removed, 1)
  assert.ok(code.endsWith('r.push(new URL(n,o))}return r}'))
  assert.deepEqual(stripExcalidrawCdnFallback('sem nada a tirar'), { code: 'sem nada a tirar', removed: 0 })
})

test('lista todas as fontes do pacote do Excalidraw, inclusive a Xiaolai, com o nome do build', () => {
  const fonts = listExcalidrawFonts()
  const familias = new Set(fonts.map((font) => font.fileName.split('/')[2]))

  for (const familia of ['Excalifont', 'Virgil', 'Nunito', 'Lilita', 'ComicShanns', 'Cascadia', 'Liberation', 'Assistant', 'Xiaolai']) {
    assert.ok(familias.has(familia), `${familia} ficou de fora`)
  }
  assert.ok(fonts.every((font) => font.fileName.startsWith(`${EXCALIDRAW_ASSETS_DIR}/fonts/`)))
  assert.ok(fonts.every((font) => font.fileName.endsWith('.woff2') && fs.existsSync(font.absolutePath)))
})

test('o nome no build é o caminho que o Excalidraw pede ("./fonts/<Família>/<arquivo>")', () => {
  // Amarra ao pacote instalado: se um update mudar o layout, o teste avisa.
  const prod = path.join(EXCALIDRAW_FONTS_ROOT, '..')
  const pedidos = fs
    .readdirSync(prod)
    .filter((nome) => nome.endsWith('.js'))
    .flatMap((nome) => [...fs.readFileSync(path.join(prod, nome), 'utf8').matchAll(/"\.\/fonts\/([^"]+\.woff2)"/g)])
    .map((encontrado) => `${EXCALIDRAW_ASSETS_DIR}/fonts/${encontrado[1]}`)
  const noBuild = new Set(listExcalidrawFonts().map((font) => font.fileName))

  assert.ok(pedidos.length > 100, `só ${pedidos.length} fontes pedidas no código do pacote`)
  assert.deepEqual(pedidos.filter((pedido) => !noBuild.has(pedido)), [])
})

test('ignora o que não é pasta de família nem .woff2', () => {
  const entrada = (name, dir) => ({ name, isDirectory: () => dir, isFile: () => !dir })
  const fsFalso = {
    readdirSync: (pasta) =>
      pasta === '/fontes'
        ? [entrada('Excalifont', true), entrada('LEIAME.md', false)]
        : [entrada('a.woff2', false), entrada('licenca.txt', false), entrada('sub', true)],
  }
  assert.deepEqual(
    listExcalidrawFonts('/fontes', fsFalso).map((font) => font.fileName),
    [`${EXCALIDRAW_ASSETS_DIR}/fonts/Excalifont/a.woff2`],
  )
})

test('o dev server só entrega fonte de dentro da pasta das fontes', () => {
  const raiz = path.resolve('/pacote/fonts')
  assert.equal(
    resolveDevFontRequest('/excalidraw-assets/fonts/Excalifont/a.woff2?v=1', raiz),
    path.join(raiz, 'Excalifont', 'a.woff2'),
  )
  for (const pedido of [
    '/excalidraw-assets/fonts/../../segredo.woff2',
    '/excalidraw-assets/fonts/%2e%2e/%2e%2e/segredo.woff2',
    '/excalidraw-assets/fonts/Excalifont/..%2f..%2f..%2fsegredo.woff2',
    '/excalidraw-assets/fonts/..%5c..%5csegredo.woff2',
    '/excalidraw-assets/fonts/Excalifont/a.js',
    '/assets/index.js',
    '/excalidraw-assets/fonts/%E0%A4%A.woff2',
    undefined,
  ]) {
    assert.equal(resolveDevFontRequest(pedido, raiz), null, String(pedido))
  }
})
