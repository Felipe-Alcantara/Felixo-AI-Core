const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// Stub electron so the real registration function can be exercised under node:test.
const Module = require('node:module')
const originalLoad = Module._load
const handlers = new Map()
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { ipcMain: { handle: (name, handler) => handlers.set(name, handler) } }
  }
  return originalLoad.call(this, request, parent, isMain)
}
const { registerFetchAllIpcHandlers } = require('./fetch-all-ipc-handlers.cjs')
Module._load = originalLoad

function appPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-fetch-all-ipc-'))

  return {
    root,
    config: path.join(root, 'config'),
    cache: path.join(root, 'cache'),
    reports: path.join(root, 'reports'),
    agentRequests: path.join(root, 'agent-requests'),
  }
}

test('execução falha não resolve o pedido como aceito nem o tira da fila', async () => {
  handlers.clear()
  const paths = appPaths()
  let executions = 0
  const service = {
    execute: async () => {
      executions += 1
      return { ok: false, message: 'O plano não tem nenhuma ação segura.' }
    },
  }
  const controller = registerFetchAllIpcHandlers(
    () => undefined,
    paths,
    { createService: () => service },
  )
  const pedido = controller.pedidos.registrar('executar-plano')

  try {
    const resolveRequest = handlers.get('fetch-all:resolve-request')
    const result = await resolveRequest(null, { id: pedido.id, aceito: true })

    assert.equal(executions, 1)
    assert.equal(result.ok, false)
    assert.equal(result.resolved, null)
    assert.equal(result.resultado.ok, false)
    assert.equal(result.message, 'O plano não tem nenhuma ação segura.')
    assert.equal(controller.pedidos.ler(pedido.id).estado, 'pendente')
    assert.deepEqual(
      controller.pedidos.listarPendentes().map((item) => item.id),
      [pedido.id],
    )
  } finally {
    controller.pararDeObservarPedidos()
    fs.rmSync(paths.root, { recursive: true, force: true })
  }
})
