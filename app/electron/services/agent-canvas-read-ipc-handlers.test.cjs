'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const Module = require('node:module')
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') return {}
  return originalLoad.call(this, request, parent, isMain)
}
const { LER_ACTION, LISTAR_ACTION, registerAgentCanvasReadIpcHandlers } = require('./agent-canvas-read-ipc-handlers.cjs')
const { PtyProcessManager } = require('./pty-process-manager.cjs')
Module._load = originalLoad

function appPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-agent-canvas-read-'))
  return { root, agentRequests: path.join(root, 'agent-requests'), canvasFiles: path.join(root, 'canvas-files') }
}

function fakeCanvasRepository(nodes) {
  return { list: () => nodes }
}

test('canvas-listar: resolve com os elementos do canvas, sem confirmação humana', async () => {
  const paths = appPaths()
  const nodes = [
    { id: 't1', type: 'terminal', data: { label: 'Claude · local' } },
    { id: 'n1', type: 'note', data: { text: 'anotação' } },
  ]
  const controller = registerAgentCanvasReadIpcHandlers({
    database: {},
    appPaths: paths,
    getTerminalLogStore: () => null,
    dependencies: { canvasRepository: fakeCanvasRepository(nodes) },
  })
  const pedido = controller.pedidos.registrar(LISTAR_ACTION)

  try {
    await controller.processPending()
    const resolvido = controller.pedidos.ler(pedido.id)

    assert.equal(resolvido.estado, 'aceito')
    assert.equal(resolvido.resultado.ok, true)
    assert.deepEqual(resolvido.resultado.elementos.map((item) => item.id), ['t1', 'n1'])
  } finally {
    controller.pararDeObservarPedidos()
    fs.rmSync(paths.root, { recursive: true, force: true })
  }
})

test('canvas-ler: lê o terminal certo e redige o resultado com a função injetada', async () => {
  const paths = appPaths()
  const nodes = [{ id: 't1', type: 'terminal', data: {} }]
  const fakeStore = { getSessions: async () => [{ sessionId: 't1', chunks: [{ chunk: 'token=segredo123' }] }] }
  const redigido = []
  const controller = registerAgentCanvasReadIpcHandlers({
    database: {},
    appPaths: paths,
    getTerminalLogStore: () => fakeStore,
    dependencies: {
      canvasRepository: fakeCanvasRepository(nodes),
      redact: (texto) => { redigido.push(texto); return 'REDIGIDO' },
    },
  })
  const pedido = controller.pedidos.registrar(LER_ACTION, { idDoElemento: 't1' })

  try {
    await controller.processPending()
    const resolvido = controller.pedidos.ler(pedido.id)

    assert.equal(resolvido.estado, 'aceito')
    assert.equal(resolvido.resultado.ok, true)
    assert.equal(resolvido.resultado.content, 'REDIGIDO')
    assert.deepEqual(redigido, ['token=segredo123'])
  } finally {
    controller.pararDeObservarPedidos()
    fs.rmSync(paths.root, { recursive: true, force: true })
  }
})

test('canvas-ler: id inexistente ainda resolve o pedido (aceito), só o resultado interno é ok:false', async () => {
  const paths = appPaths()
  const controller = registerAgentCanvasReadIpcHandlers({
    database: {},
    appPaths: paths,
    getTerminalLogStore: () => null,
    dependencies: { canvasRepository: fakeCanvasRepository([]) },
  })
  const pedido = controller.pedidos.registrar(LER_ACTION, { idDoElemento: 'nao-existe' })

  try {
    await controller.processPending()
    const resolvido = controller.pedidos.ler(pedido.id)

    assert.equal(resolvido.estado, 'aceito')
    assert.equal(resolvido.resultado.ok, false)
  } finally {
    controller.pararDeObservarPedidos()
    fs.rmSync(paths.root, { recursive: true, force: true })
  }
})

test('getTerminalLogStore ausente (log store ainda não existe no boot) não derruba canvas-ler de terminal', async () => {
  const paths = appPaths()
  const nodes = [{ id: 't1', type: 'terminal', data: {} }]
  const controller = registerAgentCanvasReadIpcHandlers({
    database: {},
    appPaths: paths,
    getTerminalLogStore: () => null,
    dependencies: { canvasRepository: fakeCanvasRepository(nodes) },
  })
  const pedido = controller.pedidos.registrar(LER_ACTION, { idDoElemento: 't1' })

  try {
    await controller.processPending()
    const resolvido = controller.pedidos.ler(pedido.id)

    assert.equal(resolvido.estado, 'aceito')
    assert.equal(resolvido.resultado.ok, true)
    assert.match(resolvido.resultado.message, /sem saída registrada/)
  } finally {
    controller.pararDeObservarPedidos()
    fs.rmSync(paths.root, { recursive: true, force: true })
  }
})

test('nao mistura pedido de leitura de canvas com outros pedidos da mesma fila (abrir-pagina)', async () => {
  const paths = appPaths()
  const controller = registerAgentCanvasReadIpcHandlers({
    database: {},
    appPaths: paths,
    getTerminalLogStore: () => null,
    dependencies: { canvasRepository: fakeCanvasRepository([]) },
  })
  const outraAcao = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com' })
  const listar = controller.pedidos.registrar(LISTAR_ACTION)

  try {
    await controller.processPending()

    assert.equal(controller.pedidos.ler(listar.id).estado, 'aceito')
    assert.equal(controller.pedidos.ler(outraAcao.id).estado, 'pendente')
  } finally {
    controller.pararDeObservarPedidos()
    fs.rmSync(paths.root, { recursive: true, force: true })
  }
})

// ESC e CRLF montados por código: o texto do teste é a saída crua de um PTY.
const ESC = String.fromCharCode(27)
const CRLF = String.fromCharCode(13, 10)

function criarManagerComPty() {
  let pty
  const manager = new PtyProcessManager({
    spawnPty: () => {
      pty = { pid: 1, dataListeners: [], write() {}, resize() {}, kill() {}, onData(l) { this.dataListeners.push(l) }, onExit() {} }
      return pty
    },
  })
  // O PTY de um bloco do canvas usa canvas:<id>, nunca o id puro que o listar devolve.
  manager.spawn('canvas:terminal-1', {})
  return { manager, emitir: (texto) => pty.dataListeners.forEach((l) => l(texto)) }
}

async function lerTerminal1({ manager }) {
  const paths = appPaths()
  const controller = registerAgentCanvasReadIpcHandlers({
    database: {},
    appPaths: paths,
    getTerminalLogStore: () => null,
    getPtyManager: () => manager,
    dependencies: {
      canvasRepository: fakeCanvasRepository([{ id: 'terminal-1', type: 'terminal', data: {} }]),
      redact: (texto) => texto.replace(/token=[^ ]+/, 'token=***'),
    },
  })
  const pedido = controller.pedidos.registrar(LER_ACTION, { idDoElemento: 'terminal-1' })
  try {
    await controller.processPending()
    return controller.pedidos.ler(pedido.id).resultado
  } finally {
    controller.pararDeObservarPedidos()
    fs.rmSync(paths.root, { recursive: true, force: true })
  }
}

test('canvas-ler: terminal do canvas em tela normal devolve as linhas sem ANSI e com segredo mascarado', async () => {
  const pty = criarManagerComPty()
  pty.emitir(ESC + '[32mprimeira' + ESC + '[0m' + CRLF + 'token=segredo123' + CRLF)

  const resultado = await lerTerminal1(pty)

  assert.equal(resultado.ok, true)
  assert.equal(resultado.content, 'primeira' + String.fromCharCode(10) + 'token=***')
})

test('canvas-ler: terminal do canvas em tela alternativa devolve o que está visível', async () => {
  const pty = criarManagerComPty()
  pty.emitir('antes' + CRLF)
  pty.emitir(ESC + '[?1049h' + ESC + '[2J' + ESC + '[1;1Htela cheia do agente' + ESC + '[3;1Hrodape')

  const resultado = await lerTerminal1(pty)

  assert.match(resultado.content, /tela cheia do agente/)
  assert.match(resultado.content, /rodape/)
  assert.ok(!resultado.content.includes(ESC))
  assert.equal(resultado.message, undefined)
})

test('canvas-ler: terminal do canvas sem PTY vivo continua respondendo "sem saída"', async () => {
  const resultado = await lerTerminal1({ manager: new PtyProcessManager({ spawnPty: () => ({}) }) })

  assert.equal(resultado.ok, true)
  assert.equal(resultado.message, 'Terminal sem saída registrada ainda.')
})
