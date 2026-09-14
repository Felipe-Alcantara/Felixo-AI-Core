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
