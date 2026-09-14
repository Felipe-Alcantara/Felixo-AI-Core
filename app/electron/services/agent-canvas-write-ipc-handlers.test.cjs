'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const Module = require('node:module')
const originalLoad = Module._load
const handlers = new Map()
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { ipcMain: { handle: (name, handler) => handlers.set(name, handler) } }
  }
  return originalLoad.call(this, request, parent, isMain)
}
const { ESCREVER_ACTION, NODE_UPDATED_CHANNEL, registerAgentCanvasWriteIpcHandlers } = require('./agent-canvas-write-ipc-handlers.cjs')
Module._load = originalLoad

function appPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-agent-canvas-write-'))
  return { root, agentRequests: path.join(root, 'agent-requests') }
}

function fakeCanvasRepository(nodes) {
  const saved = []
  return {
    list: () => nodes,
    save: (node) => { saved.push(node) },
    saved,
  }
}

function fakeWindow() {
  const sent = []
  return {
    isDestroyed: () => false,
    webContents: { send: (channel, payload) => sent.push({ channel, payload }) },
    sent,
  }
}

test('escrita recusada: pedido fica recusado, nada é persistido', async () => {
  handlers.clear()
  const paths = appPaths()
  const repo = fakeCanvasRepository([{ id: 'n1', type: 'note', data: { text: 'antigo' } }])
  const controller = registerAgentCanvasWriteIpcHandlers({
    getMainWindow: () => undefined,
    database: {},
    appPaths: paths,
    dependencies: { canvasRepository: repo },
  })
  const pedido = controller.pedidos.registrar(ESCREVER_ACTION, { idDoElemento: 'n1', conteudo: 'novo' })

  try {
    const resolveRequest = handlers.get('canvas:resolve-write-request')
    const result = await resolveRequest(null, { id: pedido.id, aceito: false })

    assert.equal(result.ok, true)
    assert.equal(result.resolved.estado, 'recusado')
    assert.deepEqual(repo.saved, [])
  } finally {
    controller.pararDeObservarPedidos()
    fs.rmSync(paths.root, { recursive: true, force: true })
  }
})

test('escrita aceita: persiste a nova data, avisa a janela e resolve como aceito', async () => {
  handlers.clear()
  const paths = appPaths()
  const repo = fakeCanvasRepository([{ id: 'n1', type: 'note', data: { text: 'antigo', label: 'Minha nota' } }])
  const window = fakeWindow()
  const controller = registerAgentCanvasWriteIpcHandlers({
    getMainWindow: () => window,
    database: {},
    appPaths: paths,
    dependencies: { canvasRepository: repo },
  })
  const pedido = controller.pedidos.registrar(ESCREVER_ACTION, { idDoElemento: 'n1', conteudo: 'texto do agente' })

  try {
    const resolveRequest = handlers.get('canvas:resolve-write-request')
    const result = await resolveRequest(null, { id: pedido.id, aceito: true })

    assert.equal(result.ok, true)
    assert.equal(result.resultado.ok, true)
    assert.equal(result.resolved.estado, 'aceito')
    assert.equal(repo.saved.length, 1)
    assert.equal(repo.saved[0].data.text, 'texto do agente')
    assert.equal(repo.saved[0].data.label, 'Minha nota')
    assert.equal(window.sent.length, 1)
    assert.equal(window.sent[0].channel, NODE_UPDATED_CHANNEL)
    assert.deepEqual(window.sent[0].payload, { id: 'n1', data: { text: 'texto do agente', label: 'Minha nota' } })
  } finally {
    controller.pararDeObservarPedidos()
    fs.rmSync(paths.root, { recursive: true, force: true })
  }
})

test('escrita aceita mas elemento sumiu do canvas: resolve como não aceito, sem persistir', async () => {
  handlers.clear()
  const paths = appPaths()
  const repo = fakeCanvasRepository([])
  const controller = registerAgentCanvasWriteIpcHandlers({
    getMainWindow: () => undefined,
    database: {},
    appPaths: paths,
    dependencies: { canvasRepository: repo },
  })
  const pedido = controller.pedidos.registrar(ESCREVER_ACTION, { idDoElemento: 'nao-existe', conteudo: 'x' })

  try {
    const resolveRequest = handlers.get('canvas:resolve-write-request')
    const result = await resolveRequest(null, { id: pedido.id, aceito: true })

    assert.equal(result.ok, true)
    assert.equal(result.resultado.ok, false)
    assert.match(result.resultado.message, /Nenhum elemento com id/)
    assert.equal(controller.pedidos.ler(pedido.id).estado, 'recusado')
    assert.deepEqual(repo.saved, [])
  } finally {
    controller.pararDeObservarPedidos()
    fs.rmSync(paths.root, { recursive: true, force: true })
  }
})

test('pedido inexistente ou já resolvido não é aceito de novo', async () => {
  handlers.clear()
  const paths = appPaths()
  const controller = registerAgentCanvasWriteIpcHandlers({
    getMainWindow: () => undefined,
    database: {},
    appPaths: paths,
    dependencies: { canvasRepository: fakeCanvasRepository([]) },
  })

  try {
    const resolveRequest = handlers.get('canvas:resolve-write-request')
    const result = await resolveRequest(null, { id: 'id-que-nao-existe', aceito: true })

    assert.equal(result.ok, true)
    assert.equal(result.resolved, null)
    assert.match(result.message, /não está mais pendente/)
  } finally {
    controller.pararDeObservarPedidos()
    fs.rmSync(paths.root, { recursive: true, force: true })
  }
})

test('lista só os pedidos de escrita pendentes, sem misturar com outras ações da fila', async () => {
  handlers.clear()
  const paths = appPaths()
  const controller = registerAgentCanvasWriteIpcHandlers({
    getMainWindow: () => undefined,
    database: {},
    appPaths: paths,
    dependencies: { canvasRepository: fakeCanvasRepository([]) },
  })
  const escrever = controller.pedidos.registrar(ESCREVER_ACTION, { idDoElemento: 'n1', conteudo: 'x' })
  controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com' })

  try {
    const listRequests = handlers.get('canvas:list-write-requests')
    const result = await listRequests()

    assert.equal(result.ok, true)
    assert.deepEqual(result.requests.map((item) => item.id), [escrever.id])
  } finally {
    controller.pararDeObservarPedidos()
    fs.rmSync(paths.root, { recursive: true, force: true })
  }
})
