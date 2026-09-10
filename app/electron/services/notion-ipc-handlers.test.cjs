const test = require('node:test')
const assert = require('node:assert/strict')

const Module = require('node:module')
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { ipcMain: { handle: () => {} }, safeStorage: null }
  }
  return originalLoad.call(this, request, parent, isMain)
}
const { registerNotionIpcHandlers } = require('./notion-ipc-handlers.cjs')
Module._load = originalLoad

const TOKEN = 'secret_ipc_jamais_deveria_vazar'

/**
 * Monta o registro de handlers real (guard() de verdade, service real,
 * connectionStore real com um fake safeStorage) usando o notion-client.cjs
 * REAL — só a camada HTTP (`fetchImpl`) é falsa, devolvendo uma resposta 401
 * realista do Notion. A fronteira que importa aqui é o QUE CHEGA AO
 * RENDERER via ipcRenderer.invoke (todo o caminho real: client → service →
 * guard), não o notion-client isolado (isso já é coberto em
 * notion-client.test.cjs).
 */
function setupHandlers() {
  const { createNotionClient } = require('./notion-client.cjs')
  const { createNotionService } = require('./notion-service.cjs')
  const handlers = new Map()
  const fakeIpc = { handle: (name, handler) => handlers.set(name, handler) }
  const fakeSafeStorage = {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'os_crypt',
    encryptString: (value) => Buffer.from(value, 'utf8'),
    decryptString: (value) => Buffer.from(value).toString('utf8'),
  }

  registerNotionIpcHandlers({
    appPaths: { userData: globalThis.__felixoTestUserData },
    database: { connection: fakeSqliteConnection() },
    ipc: fakeIpc,
    electronSafeStorage: fakeSafeStorage,
    createService: ({ connectionStore, cacheRepository }) =>
      createNotionService({
        connectionStore,
        cacheRepository,
        clientFactory: ({ token }) =>
          createNotionClient({
            token,
            maxRetries: 0,
            fetchImpl: async () => ({
              ok: false,
              status: 401,
              headers: { get: () => null },
              text: async () =>
                JSON.stringify({ object: 'error', code: 'unauthorized', message: 'API token is invalid.' }),
            }),
          }),
      }),
  })

  return handlers
}

function fakeSqliteConnection() {
  // Só o suficiente pra notion-cache-repository não quebrar ao construir —
  // este teste nunca chega a tocar o cache de tarefas.
  const noop = { run: () => {}, get: () => undefined, all: () => [] }
  return { prepare: () => noop, exec: () => {} }
}

test('nenhuma resposta de IPC (guard) vaza o token — fim a fim, com o client e o service reais', async () => {
  const fs = require('node:fs')
  const os = require('node:os')
  const path = require('node:path')
  globalThis.__felixoTestUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-notion-ipc-'))
  try {
    const handlers = setupHandlers()

    const salvo = await handlers.get('notion:connections:save')(null, {
      label: 'Teste',
      token: TOKEN,
    })
    assert.equal(salvo.ok, true)
    assert.equal(JSON.stringify(salvo).includes(TOKEN), false)
    const connectionId = salvo.connection.id

    // listConnections nunca inclui o token de nenhuma conexão salva.
    const listagem = await handlers.get('notion:connections:list')(null)
    assert.equal(JSON.stringify(listagem).includes(TOKEN), false)

    // testConnection chama getCurrentUser, que recebe um 401 real do fake
    // fetchImpl — o token vai na Authorization do REQUEST (nunca visto pelo
    // renderer), a resposta 401 do "servidor" nunca ecoa o token de volta.
    // Fim a fim: client real → service real → guard() real, sem mock no meio.
    const teste = await handlers.get('notion:connections:test')(null, connectionId)
    assert.equal(teste.ok, false)
    assert.equal(
      JSON.stringify(teste).includes(TOKEN),
      false,
      'VAZAMENTO: o token apareceu na resposta de IPC de notion:connections:test',
    )

    const schema = await handlers.get('notion:database:schema')(null, {
      connectionId,
      dataSourceId: 'source-1',
    })
    assert.equal(schema.ok, false)
    assert.equal(JSON.stringify(schema).includes(TOKEN), false)
  } finally {
    fs.rmSync(globalThis.__felixoTestUserData, { recursive: true, force: true })
  }
})
