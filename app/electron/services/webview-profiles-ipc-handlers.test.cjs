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
    return { ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, session: {} }
  }
  return originalLoad.call(this, request, parent, isMain)
}
const { createStorageDatabase } = require('./storage/sqlite-database.cjs')
const { registerWebviewProfilesIpcHandlers } = require('./webview-profiles-ipc-handlers.cjs')
Module._load = originalLoad

function setup(clearProfileStorage) {
  handlers.clear()
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-webview-ipc-'))
  const database = createStorageDatabase({ databaseDir })
  registerWebviewProfilesIpcHandlers({ database, clearProfileStorage })
  return {
    cleanup: () => {
      database.close()
      fs.rmSync(databaseDir, { recursive: true, force: true })
    },
  }
}

test('excluir limpa a sessão da partição do perfil e só então o tira da lista', async () => {
  const limpezas = []
  const { cleanup } = setup(async (partition) => { limpezas.push(partition) })
  try {
    await handlers.get('webview-profiles:save')(null, { id: 'trabalho-ab12', name: 'Trabalho' })
    const result = await handlers.get('webview-profiles:delete')(null, 'trabalho-ab12')
    assert.equal(result.ok, true)
    assert.equal(result.deleted, true)
    assert.deepEqual(limpezas, ['persist:felixo-webview-trabalho-ab12'])
    assert.deepEqual((await handlers.get('webview-profiles:list')()).profiles, [])
  } finally { cleanup() }
})

test('se a limpeza falha, o perfil continua existindo (não sobra sessão sem dono)', async () => {
  const { cleanup } = setup(async () => { throw new Error('disco travado') })
  try {
    await handlers.get('webview-profiles:save')(null, { id: 'trabalho-ab12', name: 'Trabalho' })
    const result = await handlers.get('webview-profiles:delete')(null, 'trabalho-ab12')
    assert.equal(result.ok, false)
    assert.match(result.message, /disco travado/)
    assert.equal((await handlers.get('webview-profiles:list')()).profiles.length, 1)
  } finally { cleanup() }
})

test('excluir o Padrão é recusado e NUNCA limpa a sessão que já existia', async () => {
  const limpezas = []
  const { cleanup } = setup(async (partition) => { limpezas.push(partition) })
  try {
    for (const id of ['default', '../x', '', null]) {
      const result = await handlers.get('webview-profiles:delete')(null, id)
      assert.equal(result.ok, false, String(id))
    }
    assert.deepEqual(limpezas, [])
  } finally { cleanup() }
})

test('salvar devolve o erro legível de nome repetido', async () => {
  const { cleanup } = setup(async () => {})
  try {
    await handlers.get('webview-profiles:save')(null, { id: 'trabalho-ab12', name: 'Trabalho' })
    const result = await handlers.get('webview-profiles:save')(null, { id: 'outro-1234', name: 'trabalho' })
    assert.equal(result.ok, false)
    assert.match(result.message, /Ja existe/)
  } finally { cleanup() }
})
