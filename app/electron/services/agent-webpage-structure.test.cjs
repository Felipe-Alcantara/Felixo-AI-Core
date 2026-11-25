'use strict'
require('../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { redigirEstrutura, resumoEmArvore, seletorValido } = require('./agent-webpage-structure.cjs')
const { inspecionarPagina } = require('./agent-webpage-inspect.cjs')
const { normalizarPedido } = require('./fetch-all/agent-requests.cjs')

const BRUTO = {
  viewport: { largura: 800, altura: 600, devicePixelRatio: 1 },
  titulo: 'Loja',
  idioma: 'pt-BR',
  truncado: false,
  nos: [
    { i: 0, p: -1, prof: 0, tag: 'html', rect: { x: 0, y: 0, w: 800, h: 600 }, estilo: {} },
    { i: 1, p: 0, prof: 1, tag: 'a', id: 'entrar', classes: ['btn', 'primario'], attrs: { href: 'https://x.test/cb?code=segredo123456&ok=1', 'data-testid': 'entrar' }, texto: 'Entrar', rect: { x: 10, y: 20, w: 80, h: 30 }, estilo: { color: 'red' } },
    { i: 2, p: 0, prof: 1, tag: 'img', attrs: { src: 'data:image/png;base64,AAAA' }, rect: { x: 0, y: 0, w: 1, h: 1 }, estilo: {} },
    { i: 3, p: 0, prof: 1, tag: 'input', sensivel: 'senha', rect: { x: 5, y: 60, w: 100, h: 20 }, estilo: {} },
    { i: 4, p: 0, prof: 1, tag: 'p', texto: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789', rect: { x: 0, y: 0, w: 1, h: 1 }, estilo: {} },
  ],
  recursos: {
    meta: [{ nome: 'description', conteudo: 'loja' }],
    estilos: ['https://cdn.test/a.css?token=abcdef1234567890'],
    scripts: ['https://cdn.test/app.js'],
    iframes: [],
  },
}

test('a redação tira token de endereços e textos e resume data: URI', () => {
  const dom = redigirEstrutura(BRUTO)
  const texto = JSON.stringify(dom)

  assert.doesNotMatch(texto, /segredo123456|abcdefghijklmnopqrstuvwxyz0123456789|abcdef1234567890/)
  assert.match(dom.nos[1].attrs.href, /ok=1/)
  assert.equal(dom.nos[2].attrs.src, 'data:…')
  assert.equal(dom.nos[1].attrs['data-testid'], 'entrar')
})

test('o campo sensível entra marcado, sem nome, id nem atributos', () => {
  const [, , , senha] = redigirEstrutura(BRUTO).nos
  assert.equal(senha.sensivel, 'senha')
  assert.equal(senha.id, undefined)
  assert.equal(senha.attrs, undefined)
})

test('a árvore resumida recua pela profundidade e mostra id, classes, texto e posição', () => {
  const linhas = resumoEmArvore(redigirEstrutura(BRUTO).nos)
  assert.equal(linhas[0], 'html 0,0 800x600')
  assert.equal(linhas[1], '  a#entrar.btn.primario "Entrar" 10,20 80x30')
  assert.match(linhas[3], /\[campo senha\]/)
})

test('seletor: só texto de tamanho razoável e sem caractere de controle', () => {
  assert.equal(seletorValido('main .card > a[href]'), true)
  for (const ruim of ['', '   ', 'x'.repeat(201), 'a\u0000b', 42, undefined]) assert.equal(seletorValido(ruim), false)
})

test('inspecionarPagina estrutura grava o JSON completo e devolve só o resumo', async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-dom-'))
  const guest = { getURL: () => 'https://x.test/?token=abcdef1234567890', executeJavaScriptInIsolatedWorld: async () => BRUTO }
  try {
    const r = await inspecionarPagina({ guest, tipo: 'estrutura', pastaCapturas: pasta, idDoPedido: 'ped-1' })
    assert.equal(r.ok, true)
    assert.equal(r.total, 5)
    assert.equal(r.recursos.scripts, 1)
    assert.equal(r.arvore.length, 5)
    assert.doesNotMatch(r.url, /abcdef1234567890/)
    const arquivo = JSON.parse(fs.readFileSync(r.arquivo, 'utf8'))
    assert.equal(arquivo.nos.length, 5)
    assert.equal(r.arquivo, path.join(pasta, 'ped-1-dom.json'))

    const erro = await inspecionarPagina({ guest: { ...guest, executeJavaScriptInIsolatedWorld: async () => ({ erro: 'Nenhum elemento casa' }) }, tipo: 'estrutura', pastaCapturas: pasta, idDoPedido: 'ped-2', seletor: '#nao' })
    assert.equal(erro.ok, false)
  } finally {
    for (const nome of fs.readdirSync(pasta)) fs.unlinkSync(path.join(pasta, nome))
    fs.rmdirSync(pasta)
  }
})

test('o pedido estrutura valida seletor e profundidade', () => {
  const ok = normalizarPedido('pagina-inspecionar', { idDoElemento: 'web-1', tipo: 'estrutura', seletor: ' main ', profundidade: '5' })
  assert.deepEqual([ok.seletor, ok.profundidade], ['main', 5])
  assert.equal(normalizarPedido('pagina-inspecionar', { idDoElemento: 'web-1', tipo: 'estrutura' }).seletor, undefined)
  for (const profundidade of [0, 41, 2.5, 'x']) {
    assert.throws(() => normalizarPedido('pagina-inspecionar', { idDoElemento: 'web-1', tipo: 'estrutura', profundidade }), /Profundidade inválida/)
  }
  assert.throws(() => normalizarPedido('pagina-inspecionar', { idDoElemento: 'web-1', tipo: 'estrutura', seletor: 'a'.repeat(201) }), /Seletor inválido/)
})
