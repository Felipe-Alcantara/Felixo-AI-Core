'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')

const { casosDaRodada, decodificar, parseArgs } = require('./packaged-links-check.cjs')

test('parseArgs: padrões e valores aceitos', () => {
  const padrao = parseArgs([])
  assert.equal(padrao.navegador, 'real')
  assert.equal(padrao.releaseDir, 'release')
  assert.equal(padrao.timeoutMs, 45_000)
  assert.equal(parseArgs(['--timeout', '60000']).timeoutMs, 60_000)
  assert.throws(() => parseArgs(['--navegador', 'chrome']), /real, curl ou ausente/)
  assert.throws(() => parseArgs(['--timeout', 'x']), /inteiro/)
  assert.throws(() => parseArgs(['--report']), /precisa de um valor/)
  assert.throws(() => parseArgs(['--desconhecida']), /Opção desconhecida/)
})

test('parseArgs: trocar o xdg-open só faz sentido no Linux', { skip: process.platform === 'linux' }, () => {
  assert.throws(() => parseArgs(['--navegador', 'curl']), /só existe no Linux/)
})

test('cada caso tem um caminho único, e o esperado nunca leva o fragmento', () => {
  const casos = casosDaRodada('/tmp/marcador')
  const caminhos = casos.map((caso) => caso.caminho)
  assert.equal(new Set(caminhos).size, caminhos.length)
  for (const caso of casos) {
    assert.ok(caso.caminho.startsWith('/'), caso.id)
    assert.ok(!caso.esperado.includes('#'), caso.id)
  }
  // Os três gestos de origem aparecem: nota, terminal e o botão da Página Web.
  assert.deepEqual([...new Set(casos.map((caso) => caso.origem))].sort(), ['botao-pagina-web', 'markdown', 'terminal'])
})

test('a injeção de shell não tem espaço literal e aponta os três marcadores', () => {
  const injecao = casosDaRodada('/tmp/marcador').find((caso) => caso.id === 'markdown-injecao-de-shell')
  assert.ok(injecao)
  assert.doesNotMatch(injecao.caminho, /\s/)
  for (const letra of ['a', 'b', 'c']) assert.ok(injecao.caminho.includes(`/tmp/marcador-${letra}`), letra)
  for (const trecho of ['$(', ';touch', '|touch', '${IFS}']) assert.ok(injecao.caminho.includes(trecho), trecho)
})

test('decodificar: compara o que cada navegador codifica de um jeito', () => {
  assert.equal(decodificar('/a%C3%A7%C3%A3o/caf%C3%A9?q=%C3%BCn%C3%AF'), '/ação/café?q=ünï')
  assert.equal(decodificar('/x?a=$%7BIFS%7D'), '/x?a=${IFS}')
  // Um `%` solto não derruba a comparação: volta como veio.
  assert.equal(decodificar('/x?a=%E0%A4%A'), '/x?a=%E0%A4%A')
})

test('julgarCaso: um pedido do navegador, no caminho esperado', () => {
  const { julgarCaso } = require('./packaged-links-check.cjs')
  const chrome = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0 Safari/537.36'
  const app = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/146.0 Electron/41.10.7 Safari/537.36'
  assert.equal(julgarCaso([{ caminho: '/simples', agente: chrome }], '/simples').ok, true)
  // O pedido do `<webview>` do app não conta, nem para o bem nem para o mal.
  assert.equal(julgarCaso([{ caminho: '/pagina', agente: app }, { caminho: '/simples', agente: chrome }], '/simples').ok, true)
  assert.equal(julgarCaso([{ caminho: '/pagina', agente: app }], '/pagina').ok, false)
  // Duas aberturas, caminho errado ou nada: reprova.
  assert.equal(julgarCaso([{ caminho: '/simples', agente: chrome }, { caminho: '/simples', agente: chrome }], '/simples').ok, false)
  assert.equal(julgarCaso([{ caminho: '/outro', agente: chrome }], '/simples').ok, false)
  assert.equal(julgarCaso([], '/simples').ok, false)
  // Codificações diferentes do mesmo endereço valem igual.
  assert.equal(julgarCaso([{ caminho: '/a%C3%A7%C3%A3o', agente: 'curl/8.5.0' }], '/ação').ok, true)
})

test('pedidoDoApp: reconhece o user-agent do Electron', () => {
  const { pedidoDoApp } = require('./packaged-links-check.cjs')
  assert.equal(pedidoDoApp({ agente: 'Mozilla/5.0 Chrome/146.0 Electron/41.10.7 Safari/537.36' }), true)
  assert.equal(pedidoDoApp({ agente: 'Mozilla/5.0 (Macintosh) Version/18.0 Safari/605.1.15' }), false)
  assert.equal(pedidoDoApp({ agente: 'curl/8.5.0' }), false)
  assert.equal(pedidoDoApp({ agente: '' }), false)
})
