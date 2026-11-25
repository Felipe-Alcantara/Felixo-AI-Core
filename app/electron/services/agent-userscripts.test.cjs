'use strict'
require('../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

const originalLoad = Module._load
const handlers = new Map()
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') return { ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, webContents: { getAllWebContents: () => [] } }
  return originalLoad.call(this, request, parent, isMain)
}
const { registerAgentScriptIpcHandlers } = require('./agent-script-ipc-handlers.cjs')
Module._load = originalLoad

const {
  MAX_SCRIPTS,
  casaUrl,
  compilarPadrao,
  criarGerenciadorDeScripts,
  descreverAlcance,
  embrulhar,
  executarScriptsEm,
  normalizarScript,
} = require('./agent-userscripts.cjs')
const { VALIDADE_MS } = require('./fetch-all/agent-requests.cjs')

function pasta() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-us-'))
}
const base = { nome: 'Esconder banner', match: ['https://*.exemplo.com/*'], codigo: "GM_addStyle('.x{display:none}')" }

test('@match: esquema, host com curinga e caminho', () => {
  assert.equal(casaUrl(['https://*.exemplo.com/*'], 'https://a.b.exemplo.com/p?q=1'), true)
  assert.equal(casaUrl(['https://*.exemplo.com/*'], 'https://exemplo.com/'), true)
  assert.equal(casaUrl(['https://*.exemplo.com/*'], 'https://exemploXcom.evil.test/'), false)
  assert.equal(casaUrl(['https://*.exemplo.com/*'], 'http://a.exemplo.com/'), false)
  assert.equal(casaUrl(['*://*.exemplo.com/*'], 'http://a.exemplo.com/'), true)
  assert.equal(casaUrl(['https://exemplo.com/app/*'], 'https://exemplo.com/outra'), false)
  assert.equal(casaUrl(['*://localhost:8765/*'], 'http://localhost:8765/a'), true)
  assert.equal(casaUrl(['*://localhost:8765/*'], 'http://localhost:9999/a'), false)
})

test('@match nunca casa esquema que não é web e o padrão torto é recusado', () => {
  assert.equal(casaUrl(['*://*/*'], 'file:///etc/hosts'), false)
  assert.equal(casaUrl(['*://*/*'], 'javascript:alert(1)'), false)
  assert.equal(casaUrl(['*://*/*'], 'not a url'), false)
  for (const ruim of ['', 'exemplo.com', 'file://*/*', 'https://exemplo.com', 'https://ex emplo.com/*', 'x'.repeat(201)]) {
    assert.throws(() => compilarPadrao(ruim), /inválido/)
  }
})

test('o alcance de todas as páginas é dito com todas as letras', () => {
  assert.equal(descreverAlcance(['*://*/*']), 'TODAS as páginas web')
  assert.equal(descreverAlcance(['https://a.test/*', 'https://b.test/*']), 'https://a.test/*, https://b.test/*')
})

test('normalizarScript valida nome, padrões, código e mundo', () => {
  assert.deepEqual(normalizarScript({ ...base, mundo: 'isolado' }).mundo, 'isolado')
  assert.equal(normalizarScript(base).mundo, 'pagina')
  assert.throws(() => normalizarScript({ ...base, nome: '' }), /nome/)
  assert.throws(() => normalizarScript({ ...base, match: [] }), /1 a 10/)
  assert.throws(() => normalizarScript({ ...base, match: ['nada'] }), /inválido/)
  assert.throws(() => normalizarScript({ ...base, codigo: '  ' }), /vazio/)
  assert.throws(() => normalizarScript({ ...base, codigo: 'x'.repeat(100_001) }), /grande demais/)
  assert.throws(() => normalizarScript({ ...base, mundo: 'main' }), /Mundo inválido/)
})

test('o nome do script entra no código só como literal, sem escapar do console.log', () => {
  const codigo = embrulhar({ id: 'us-1', nome: 'a`);alert(1);//${1}', codigo: 'x()' })
  assert.match(codigo, /console\.log\("\[felixo-script a`\);alert\(1\);\/\/\$\{1\}\]"/)
  assert.match(codigo, /sourceURL=felixo-userscript-us-1/)
})

test('o gerenciador grava, lista, liga, desliga, remove e respeita o limite', () => {
  const dir = pasta()
  try {
    const g = criarGerenciadorDeScripts({ arquivo: path.join(dir, 'u.json') })
    assert.deepEqual(g.listar(), [])
    const s = g.adicionar(base, { novoId: () => 'abc' })
    assert.equal(s.id, 'us-abc')
    assert.equal(g.paraUrl('https://a.exemplo.com/x').length, 1)
    assert.equal(g.paraUrl('https://outro.test/').length, 0)
    assert.equal(g.definirAtivo('us-abc', false), true)
    assert.equal(g.paraUrl('https://a.exemplo.com/x').length, 0)
    assert.equal(g.definirAtivo('us-nao', true), false)
    assert.equal(g.remover('us-abc'), true)
    assert.equal(g.remover('us-abc'), false)
    for (let i = 0; i < MAX_SCRIPTS; i += 1) g.adicionar(base, { novoId: () => `n${i}` })
    assert.throws(() => g.adicionar(base), /Limite de 50/)
  } finally {
    for (const n of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, n))
    fs.rmdirSync(dir)
  }
})

test('executarScriptsEm roda no mundo escolhido e um script com erro não impede os outros', async () => {
  const chamadas = []
  const wc = {
    isDestroyed: () => false,
    getURL: () => 'https://a.exemplo.com/',
    executeJavaScript: async (codigo) => {
      chamadas.push(['pagina', codigo])
      if (codigo.includes('quebra')) throw new Error('boom')
    },
    executeJavaScriptInIsolatedWorld: async (mundo, [{ code }]) => chamadas.push(['isolado', mundo, code]),
  }
  const g = { paraUrl: () => [{ id: 'us-1', nome: 'um', mundo: 'pagina', codigo: 'quebra()' }, { id: 'us-2', nome: 'dois', mundo: 'isolado', codigo: 'ok()' }] }
  const avisos = []
  const rodados = await executarScriptsEm(wc, g, (_wc, script, erro) => avisos.push([script.nome, Boolean(erro)]))

  assert.equal(rodados, 1)
  assert.deepEqual(chamadas.map((c) => c[0]), ['pagina', 'isolado'])
  assert.equal(chamadas[1][1], 1158)
  assert.deepEqual(avisos, [['um', true], ['dois', false]])
})

function setupHandler({ agora } = {}) {
  handlers.clear()
  const dir = pasta()
  const webviews = []
  const controller = registerAgentScriptIpcHandlers({
    getMainWindow: () => undefined,
    appPaths: { agentRequests: path.join(dir, 'req'), config: path.join(dir, 'cfg') },
    dependencies: { listarWebviews: () => webviews, ...(agora ? { agora } : {}) },
  })
  const cleanup = () => {
    controller.pararDeObservarPedidos()
    fs.rmSync(dir, { recursive: true, force: true })
  }
  return { controller, webviews, cleanup, decidir: (p) => handlers.get('canvas:decide-agent-script')(null, p), listar: () => handlers.get('canvas:list-agent-scripts')(null) }
}

test('aceitar instala o código do PEDIDO e roda nas páginas abertas que casam', async () => {
  const { controller, webviews, cleanup, decidir, listar } = setupHandler()
  try {
    const executados = []
    webviews.push({ isDestroyed: () => false, getURL: () => 'https://a.exemplo.com/', executeJavaScript: async (c) => executados.push(c) }, { isDestroyed: () => false, getURL: () => 'https://outro.test/', executeJavaScript: async () => executados.push('NAO') })
    const pedido = controller.pedidos.registrar('pagina-script', { operacao: 'registrar', ...base })
    assert.equal((await listar()).requests.length, 1)

    const r = await decidir({ id: pedido.id, aceitar: true, codigo: 'forjado()' })
    assert.equal(r.ok, true)
    const gravado = controller.pedidos.ler(pedido.id)
    assert.equal(gravado.estado, 'aceito')
    assert.equal(gravado.resultado.aplicadoEmPaginasAbertas, 1)
    assert.equal(controller.gerenciador.listar()[0].codigo, base.codigo)
    assert.equal(executados.length, 1)
    assert.doesNotMatch(executados[0], /forjado/)
  } finally {
    cleanup()
  }
})

test('recusar não instala; pedido vencido vira recusa do app; decidir de novo não repete', async () => {
  let agora = Date.now()
  const { controller, cleanup, decidir } = setupHandler({ agora: () => agora })
  try {
    const recusado = controller.pedidos.registrar('pagina-script', { operacao: 'registrar', ...base })
    await decidir({ id: recusado.id, aceitar: false })
    assert.equal(controller.pedidos.ler(recusado.id).resultado.recusadoPor, 'pessoa')
    assert.deepEqual(controller.gerenciador.listar(), [])
    assert.match((await decidir({ id: recusado.id, aceitar: true })).message, /não está mais pendente/)

    const velho = controller.pedidos.registrar('pagina-script', { operacao: 'registrar', ...base })
    agora += VALIDADE_MS + 1000
    await decidir({ id: velho.id, aceitar: true })
    assert.equal(controller.pedidos.ler(velho.id).resultado.expirou, true)
    assert.deepEqual(controller.gerenciador.listar(), [])
  } finally {
    cleanup()
  }
})

test('remover, desativar e ativar são atendidos pelo app sem cartão, e id desconhecido é recusado', () => {
  handlers.clear()
  const dir = pasta()
  try {
    const { criarRepositorioDePedidos } = require('./fetch-all/agent-requests.cjs')
    const pedidos = criarRepositorioDePedidos({ pasta: path.join(dir, 'req') })
    const gerenciador = criarGerenciadorDeScripts({ arquivo: path.join(dir, 'u.json') })
    const s = gerenciador.adicionar(base, { novoId: () => 'zz1' })
    const desativar = pedidos.registrar('pagina-script', { operacao: 'desativar', scriptId: s.id })
    const inexistente = pedidos.registrar('pagina-script', { operacao: 'remover', scriptId: 'us-nao' })

    // O handler atende as operações simples ao subir e a cada mudança na pasta de pedidos.
    const controller = registerAgentScriptIpcHandlers({
      getMainWindow: () => undefined,
      appPaths: { agentRequests: path.join(dir, 'req'), config: dir },
      dependencies: { createRequests: () => pedidos, gerenciador, listarWebviews: () => [] },
    })
    controller.pararDeObservarPedidos()

    assert.equal(gerenciador.listar()[0].ativo, false)
    assert.equal(pedidos.ler(desativar.id).estado, 'aceito')
    assert.equal(pedidos.ler(inexistente.id).estado, 'recusado')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
