const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const Module = require('node:module')
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { shell: { openExternal: async () => {} } }
  }
  return originalLoad.call(this, request, parent, isMain)
}
const {
  BROWSER_OPEN_CHANNEL,
  registerAgentBrowserIpcHandlers,
} = require('./agent-browser-ipc-handlers.cjs')
Module._load = originalLoad

function appPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-agent-browser-'))
  return { root, agentRequests: path.join(root, 'agent-requests') }
}

test('consome o pedido externo pela mesma fila do Fetch All', async () => {
  const paths = appPaths()
  const opened = []
  const controller = registerAgentBrowserIpcHandlers(() => undefined, paths, {
    openExternal: async (url) => opened.push(url),
  })
  const pedido = controller.pedidos.registrar('abrir-pagina', {
    url: 'https://example.com',
  })

  try {
    await controller.processPending()

    assert.deepEqual(opened, ['https://example.com'])
    assert.equal(controller.pedidos.ler(pedido.id).estado, 'aceito')
    assert.equal(controller.pedidos.ler(pedido.id).resultado.modo, 'externo')
  } finally {
    controller.pararDeObservarPedidos()
    fs.rmSync(paths.root, { recursive: true, force: true })
  }
})

test('entrega o pedido embutido ao renderer e resolve a intenção', async () => {
  const paths = appPaths()
  const events = []
  const window = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      isLoadingMainFrame: () => false,
      send: (channel, data) => events.push({ channel, data }),
    },
  }
  const controller = registerAgentBrowserIpcHandlers(() => window, paths)
  const pedido = controller.pedidos.registrar('abrir-pagina', {
    url: 'http://localhost:4173',
    modo: 'embutido',
  })

  try {
    await controller.processPending()

    assert.deepEqual(events, [{
      channel: BROWSER_OPEN_CHANNEL,
      data: { requestId: pedido.id, url: 'http://localhost:4173' },
    }])
    assert.equal(controller.pedidos.ler(pedido.id).estado, 'aceito')
    assert.equal(controller.pedidos.ler(pedido.id).resultado.modo, 'embutido')
  } finally {
    controller.pararDeObservarPedidos()
    fs.rmSync(paths.root, { recursive: true, force: true })
  }
})

test('nao mistura pedido do Fetch All com abertura de pagina', async () => {
  const paths = appPaths()
  let opened = 0
  const controller = registerAgentBrowserIpcHandlers(() => undefined, paths, {
    openExternal: async () => {
      opened += 1
    },
  })
  const fetchAll = controller.pedidos.registrar('executar-plano')
  const browser = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com' })

  try {
    await controller.processPending()

    assert.equal(opened, 1)
    assert.equal(controller.pedidos.ler(browser.id).estado, 'aceito')
    assert.equal(controller.pedidos.ler(fetchAll.id).estado, 'pendente')
  } finally {
    controller.pararDeObservarPedidos()
    fs.rmSync(paths.root, { recursive: true, force: true })
  }
})
