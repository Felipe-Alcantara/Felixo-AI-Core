const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { criarRepositorioDePedidos } = require('./fetch-all/agent-requests.cjs')
const { registerAgentWebpageInspectIpcHandlers } = require('./agent-webpage-inspect-ipc-handlers.cjs')
const { guestValido, redigirDom, lerDomNaPagina, inspecionarPagina } = require('./agent-webpage-inspect.cjs')

const JANELA = { webContents: { id: 1, send() {} }, isDestroyed: () => false }
const GUEST = { id: 7, isDestroyed: () => false, getType: () => 'webview', hostWebContents: { id: 1 } }

function montar(extras = {}) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-inspect-'))
  const appPaths = { agentRequests: path.join(raiz, 'agent-requests') }
  const chamadas = []
  const controller = registerAgentWebpageInspectIpcHandlers({
    getMainWindow: () => JANELA,
    appPaths,
    dependencies: {
      ipcMain: { handle() {} },
      observeRequests: () => null,
      fromId: (id) => (id === 7 ? GUEST : id === 8 ? { ...GUEST, getType: () => 'window' } : null),
      inspecionarPagina: async (args) => {
        chamadas.push(args)
        return { ok: true, tipo: args.tipo, url: 'https://example.com/' }
      },
      ...extras,
    },
  })
  const repositorio = criarRepositorioDePedidos({ pasta: appPaths.agentRequests, agora: extras.agora })
  const pedir = (tipo = 'dom', idDoElemento = 'w1') => repositorio.registrar('pagina-inspecionar', { idDoElemento, tipo })
  return { controller, repositorio, pedir, chamadas }
}

test('o pedido fica pendente e nada é olhado até a pessoa permitir', () => {
  const { controller, pedir, chamadas, repositorio } = montar()
  const pedido = pedir()
  assert.equal(controller.listRequests().length, 1)
  assert.equal(chamadas.length, 0)
  assert.equal(repositorio.ler(pedido.id).estado, 'pendente')
})

test('permitir olha o webview e grava o resultado no pedido', async () => {
  const { controller, pedir, chamadas, repositorio } = montar()
  const pedido = pedir('captura')
  await controller.decide({ id: pedido.id, aprovar: true, idDoElemento: 'w1', tipo: 'captura', webContentsId: 7 })
  assert.equal(chamadas.length, 1)
  assert.equal(chamadas[0].guest, GUEST)
  const gravado = repositorio.ler(pedido.id)
  assert.equal(gravado.estado, 'aceito')
  assert.equal(gravado.resultado.tipo, 'captura')
})

test('recusar não olha nada e marca a recusa como da pessoa', async () => {
  const { controller, pedir, chamadas, repositorio } = montar()
  const pedido = pedir()
  await controller.decide({ id: pedido.id, aprovar: false, idDoElemento: 'w1', tipo: 'dom' })
  assert.equal(chamadas.length, 0)
  const gravado = repositorio.ler(pedido.id)
  assert.equal(gravado.estado, 'recusado')
  assert.equal(gravado.resultado.recusadoPor, 'pessoa')
})

test('webContents que não é webview da janela é rejeitado e o pedido continua pendente', async () => {
  const { controller, pedir, chamadas, repositorio } = montar()
  const pedido = pedir()
  for (const webContentsId of [8, 99, undefined, '7']) {
    const r = await controller.decide({ id: pedido.id, aprovar: true, idDoElemento: 'w1', tipo: 'dom', webContentsId })
    assert.equal(r.ok, false)
  }
  assert.equal(chamadas.length, 0)
  assert.equal(repositorio.ler(pedido.id).estado, 'pendente')
})

test('o que o cartão mostrou precisa ser o que está gravado', async () => {
  const { controller, pedir, chamadas } = montar()
  const pedido = pedir('dom', 'w1')
  const r = await controller.decide({ id: pedido.id, aprovar: true, idDoElemento: 'w2', tipo: 'dom', webContentsId: 7 })
  assert.match(r.message, /mudou/)
  const r2 = await controller.decide({ id: pedido.id, aprovar: true, idDoElemento: 'w1', tipo: 'captura', webContentsId: 7 })
  assert.match(r2.message, /mudou/)
  assert.equal(chamadas.length, 0)
})

test('pedido vencido não é atendido nem aparece no cartão', async () => {
  let agora = Date.parse('2026-11-18T10:00:00Z')
  const { controller, pedir, chamadas, repositorio } = montar({ agora: () => agora })
  const pedido = pedir()
  agora += 61 * 60 * 1000
  assert.equal(controller.listRequests().length, 0)
  const r = await controller.decide({ id: pedido.id, aprovar: true, idDoElemento: 'w1', tipo: 'dom', webContentsId: 7 })
  assert.match(r.message, /expirou/)
  assert.equal(chamadas.length, 0)
  assert.equal(repositorio.ler(pedido.id).estado, 'recusado')
})

test('pedido resolvido não pode ser aprovado de novo', async () => {
  const { controller, pedir, chamadas } = montar()
  const pedido = pedir()
  const params = { id: pedido.id, aprovar: true, idDoElemento: 'w1', tipo: 'dom', webContentsId: 7 }
  await controller.decide(params)
  const outra = await controller.decide(params)
  assert.match(outra.message, /não está mais pendente/)
  assert.equal(chamadas.length, 1)
})

test('guestValido recusa destruído, outra janela e outro tipo', () => {
  assert.equal(guestValido(GUEST, JANELA), true)
  assert.equal(guestValido({ ...GUEST, isDestroyed: () => true }, JANELA), false)
  assert.equal(guestValido({ ...GUEST, hostWebContents: { id: 2 } }, JANELA), false)
  assert.equal(guestValido({ ...GUEST, getType: () => 'window' }, JANELA), false)
  assert.equal(guestValido(null, JANELA), false)
})

test('o DOM que vai ao agente sai sem token, e o endereço sem query nem hash', () => {
  const dom = redigirDom({
    viewport: { largura: 1, altura: 1, devicePixelRatio: 1, rolagemX: 0, rolagemY: 0 },
    titulo: 'Conta',
    elementos: [{ tag: 'a', nome: 'Entrar', href: 'https://example.com/a?token=abc123#x', retangulo: {} }],
    texto: 'Authorization: Bearer abcdef1234567890',
  })
  assert.equal(dom.elementos[0].href, 'https://example.com/a')
  assert.doesNotMatch(dom.texto, /abcdef1234567890/)
})

test('lerDomNaPagina não lê valor de campo e marca senha como sensível sem nome', () => {
  const casos = [
    { tag: 'input', type: 'password', label: 'Senha secreta', top: 0 },
    { tag: 'input', type: 'text', label: 'Nome', top: 40, value: 'valor-digitado' },
    { tag: 'input', type: 'hidden', top: 80 },
  ]
  const elementos = casos.map((c) => ({
    tagName: c.tag.toUpperCase(),
    value: c.value,
    labels: [{ textContent: c.label }],
    innerText: '',
    getAttribute: (n) => (n === 'type' ? c.type : null),
    getBoundingClientRect: () => ({ x: 0, y: c.top, width: 10, height: 10 }),
  }))
  const documento = { querySelectorAll: () => elementos, getElementById: () => null, title: 'T', body: { innerText: 'corpo' } }
  const janela = { innerWidth: 800, innerHeight: 600, devicePixelRatio: 2, scrollX: 0, scrollY: 0 }
  const estilo = () => ({ visibility: 'visible', display: 'block' })
  const rodar = new Function(
    'document',
    'getComputedStyle',
    'window',
    `return (${lerDomNaPagina.toString()})({ elementos: 200, nome: 120, texto: 8000 })`,
  )
  const dom = rodar(documento, estilo, janela)
  assert.equal(dom.elementos.length, 2)
  assert.deepEqual([dom.elementos[0].nome, dom.elementos[0].sensivel], ['', true])
  assert.equal(dom.elementos[1].nome, 'Nome')
  assert.doesNotMatch(JSON.stringify(dom), /valor-digitado|Senha secreta/)
  assert.equal(dom.viewport.devicePixelRatio, 2)
})

test('inspecionarPagina captura grava o PNG com o id do pedido e devolve tamanho e devicePixelRatio', async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-capt-'))
  const guest = {
    getURL: () => 'https://example.com/p?token=zzz',
    capturePage: async () => ({ getSize: () => ({ width: 1600, height: 1000 }), toPNG: () => Buffer.from('png') }),
    executeJavaScriptInIsolatedWorld: async () => ({ dpr: 2, w: 800, h: 500 }),
  }
  const r = await inspecionarPagina({ guest, tipo: 'captura', pastaCapturas: pasta, idDoPedido: 'abc' })
  assert.equal(r.arquivo, path.join(pasta, 'abc.png'))
  assert.equal(fs.readFileSync(r.arquivo, 'utf8'), 'png')
  assert.deepEqual(r.imagem, { largura: 1600, altura: 1000 })
  assert.equal(r.viewport.devicePixelRatio, 2)
  assert.doesNotMatch(r.url, /zzz/)
})
