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

/** Diálogo nativo falso: registra a chamada e devolve a resposta programada. */
function fakeDialog(response) {
  const calls = []

  return {
    calls,
    showOpenDialog: async (...args) => {
      calls.push(args)
      if (response instanceof Error) throw response
      return response
    },
  }
}

/** Registra os handlers com um serviço vazio e o diálogo informado. */
function registerWithDialog(dialog, getMainWindow = () => undefined) {
  handlers.clear()
  const paths = appPaths()
  const controller = registerFetchAllIpcHandlers(getMainWindow, paths, {
    createService: () => ({}),
    dialog,
  })

  return {
    pickRoots: handlers.get('fetch-all:pick-roots'),
    cleanup() {
      controller.pararDeObservarPedidos()
      fs.rmSync(paths.root, { recursive: true, force: true })
    },
  }
}

test('escolher raízes abre o seletor de pastas preso à janela e devolve os caminhos', async () => {
  const window = { isDestroyed: () => false }
  const dialog = fakeDialog({ canceled: false, filePaths: ['/home/pessoa/repos', '/dados/git'] })
  const { pickRoots, cleanup } = registerWithDialog(dialog, () => window)

  try {
    const result = await pickRoots(null)

    assert.deepEqual(result, { ok: true, paths: ['/home/pessoa/repos', '/dados/git'] })
    assert.equal(dialog.calls.length, 1)
    const [parent, options] = dialog.calls[0]
    assert.equal(parent, window)
    // Só pastas, e várias de uma vez: a pessoa costuma ter mais de um lugar
    // onde guarda repositórios.
    assert.deepEqual(options.properties, ['openDirectory', 'multiSelections'])
  } finally {
    cleanup()
  }
})

test('cancelar o seletor de raízes devolve lista vazia, sem erro', async () => {
  const dialog = fakeDialog({ canceled: true, filePaths: [] })
  const { pickRoots, cleanup } = registerWithDialog(dialog)

  try {
    assert.deepEqual(await pickRoots(null), { ok: true, paths: [] })
    // Sem janela viva, o diálogo abre solto em vez de quebrar.
    assert.equal(dialog.calls[0].length, 1)
  } finally {
    cleanup()
  }
})

test('falha do seletor de raízes vira mensagem legível', async () => {
  const dialog = fakeDialog(new Error('Portal de arquivos indisponível.'))
  const { pickRoots, cleanup } = registerWithDialog(dialog)

  try {
    assert.deepEqual(await pickRoots(null), {
      ok: false,
      message: 'Portal de arquivos indisponível.',
    })
  } finally {
    cleanup()
  }
})

test('IPC repassa a confirmação do escopo e sua identidade ao serviço', async () => {
  handlers.clear()
  const paths = appPaths()
  let received = null
  const service = {
    scan: async (params) => {
      received = params
      return { ok: true, plan: null }
    },
  }
  const controller = registerFetchAllIpcHandlers(
    () => undefined,
    paths,
    { createService: () => service },
  )

  try {
    const result = await handlers.get('fetch-all:scan')(null, {
      useCache: true,
      confirmUnconfiguredScope: true,
      scopeKey: 'escopo-da-tela',
    })

    assert.equal(result.ok, true)
    assert.deepEqual(received, {
      useCache: true,
      confirmUnconfiguredScope: true,
      scopeKey: 'escopo-da-tela',
    })
  } finally {
    controller.pararDeObservarPedidos()
    fs.rmSync(paths.root, { recursive: true, force: true })
  }
})
