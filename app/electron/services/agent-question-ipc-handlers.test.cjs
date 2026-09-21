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
  if (request === 'electron') return { ipcMain: { handle: (name, handler) => handlers.set(name, handler) } }
  return originalLoad.call(this, request, parent, isMain)
}
const { PERGUNTAR_ACTION, registerAgentQuestionIpcHandlers } = require('./agent-question-ipc-handlers.cjs')
Module._load = originalLoad

function setup() {
  handlers.clear()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-question-'))
  const controller = registerAgentQuestionIpcHandlers({
    getMainWindow: () => undefined,
    appPaths: { agentRequests: path.join(root, 'agent-requests') },
  })
  const pedido = controller.pedidos.registrar(PERGUNTAR_ACTION, { pergunta: 'Qual banco?', opcoes: ['SQLite', 'Postgres'] })
  const cleanup = () => { controller.pararDeObservarPedidos(); fs.rmSync(root, { recursive: true, force: true }) }
  return { controller, pedido, cleanup }
}

test('escolher uma opção resolve como aceito com o texto do PEDIDO, não do renderer', async () => {
  const { controller, pedido, cleanup } = setup()
  try {
    const result = await handlers.get('canvas:answer-question')(null, { id: pedido.id, indice: 1, label: 'texto forjado' })
    assert.equal(result.ok, true)
    assert.deepEqual(result.resultado, { ok: true, indice: 1, label: 'Postgres' })
    assert.equal(controller.pedidos.ler(pedido.id).estado, 'aceito')
  } finally { cleanup() }
})

test('dispensar a pergunta resolve como recusado', async () => {
  const { controller, pedido, cleanup } = setup()
  try {
    const result = await handlers.get('canvas:answer-question')(null, { id: pedido.id, indice: null })
    assert.equal(result.resolved.estado, 'recusado')
    assert.equal(controller.pedidos.ler(pedido.id).estado, 'recusado')
  } finally { cleanup() }
})

test('índice fora do intervalo é recusado e a pergunta continua pendente', async () => {
  const { controller, pedido, cleanup } = setup()
  try {
    for (const indice of [2, -1, 1.5, '0']) {
      const result = await handlers.get('canvas:answer-question')(null, { id: pedido.id, indice })
      assert.equal(result.resolved, null)
      assert.match(result.message, /Opção inválida/)
    }
    assert.equal(controller.pedidos.ler(pedido.id).estado, 'pendente')
  } finally { cleanup() }
})

test('pergunta já respondida ou inexistente não é respondida de novo', async () => {
  const { pedido, cleanup } = setup()
  try {
    await handlers.get('canvas:answer-question')(null, { id: pedido.id, indice: 0 })
    const again = await handlers.get('canvas:answer-question')(null, { id: pedido.id, indice: 1 })
    assert.match(again.message, /não está mais pendente/)
    const missing = await handlers.get('canvas:answer-question')(null, { id: 'nao-existe', indice: 0 })
    assert.match(missing.message, /não está mais pendente/)
  } finally { cleanup() }
})

test('lista só perguntas pendentes, sem misturar outras ações da fila', async () => {
  const { controller, pedido, cleanup } = setup()
  try {
    controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com' })
    const result = await handlers.get('canvas:list-questions')()
    assert.deepEqual(result.requests.map((item) => item.id), [pedido.id])
  } finally { cleanup() }
})
