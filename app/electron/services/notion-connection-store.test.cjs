const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createNotionConnectionStore } = require('./notion-connection-store.cjs')

test('loja Notion separa metadados públicos do token cifrado', () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-notion-store-'))
  try {
    const store = createNotionConnectionStore({
      userData,
      safeStorage: fakeSafeStorage(),
      idFactory: () => 'connection-1',
      now: () => '2026-09-08T12:00:00.000Z',
    })

    const saved = store.save({ label: 'Pessoal', profileId: 'felipe', token: 'secret_token' })
    assert.deepEqual(saved, {
      id: 'connection-1',
      label: 'Pessoal',
      profileId: 'felipe',
      createdAt: '2026-09-08T12:00:00.000Z',
      updatedAt: '2026-09-08T12:00:00.000Z',
      lastTestedAt: null,
      hasToken: true,
    })
    assert.deepEqual(store.list(), [saved])
    assert.equal(fs.readFileSync(store.storePath, 'utf8').includes('secret_token'), false)
    assert.equal(fs.readFileSync(store.secretsPath, 'utf8').includes('secret_token'), false)
    assert.equal(store.getCredential('connection-1').token, 'secret_token')

    const updated = store.save({ id: 'connection-1', label: 'Pessoal atualizada' })
    assert.equal(updated.label, 'Pessoal atualizada')
    assert.equal(store.getCredential('connection-1').token, 'secret_token')
    assert.equal(store.markTested('connection-1').lastTestedAt, '2026-09-08T12:00:00.000Z')
    assert.equal(store.remove('connection-1'), true)
    assert.deepEqual(store.list(), [])
    assert.equal(store.getCredential('connection-1'), null)
  } finally {
    fs.rmSync(userData, { recursive: true, force: true })
  }
})

test('loja recusa salvar quando o chaveiro não é cifrado', () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-notion-store-basic-'))
  try {
    const store = createNotionConnectionStore({
      userData,
      safeStorage: fakeSafeStorage('basic'),
    })
    assert.equal(store.canStoreSecret().ok, false)
    assert.throws(() => store.save({ label: 'Pessoal', token: 'secret_token' }), /chaveiro|backend basic/)
    assert.deepEqual(store.list(), [])
  } finally {
    fs.rmSync(userData, { recursive: true, force: true })
  }
})

function fakeSafeStorage(backend = 'os_crypt') {
  return {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => backend,
    encryptString: (value) => Buffer.from(value, 'utf8').toString('base64'),
    decryptString: (value) => Buffer.from(Buffer.isBuffer(value) ? value.toString('utf8') : value, 'base64').toString('utf8'),
  }
}
