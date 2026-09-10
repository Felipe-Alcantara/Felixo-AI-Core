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

test('loja isola completamente duas conexões da mesma pessoa — token, metadados e remoção não vazam entre elas', () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-notion-store-multi-'))
  try {
    const ids = ['connection-a', 'connection-b']
    let nextId = 0
    const store = createNotionConnectionStore({
      userData,
      safeStorage: fakeSafeStorage(),
      idFactory: () => ids[nextId++],
      now: () => '2026-09-10T12:00:00.000Z',
    })

    store.save({ label: 'Conta pessoal', profileId: 'felipe', token: 'token_secreto_A' })
    store.save({ label: 'Conta do trabalho', profileId: 'felipe', token: 'token_secreto_B' })

    // Cada conexão só devolve o PRÓPRIO token, nunca o da outra.
    assert.equal(store.getCredential('connection-a').token, 'token_secreto_A')
    assert.equal(store.getCredential('connection-b').token, 'token_secreto_B')

    // A listagem pública nunca inclui nenhum dos dois tokens em texto — nem
    // por engano cruzado (o token de B aparecendo na entrada de A ou vice-versa).
    const listagem = store.list()
    assert.equal(listagem.length, 2)
    const listagemTexto = JSON.stringify(listagem)
    assert.equal(listagemTexto.includes('token_secreto_A'), false)
    assert.equal(listagemTexto.includes('token_secreto_B'), false)
    assert.deepEqual(listagem.map((c) => c.hasToken), [true, true])

    // Nenhum arquivo em disco (metadados nem segredo cifrado) contém o
    // texto plano de NENHUM dos dois tokens.
    const storeFileTexto = fs.readFileSync(store.storePath, 'utf8')
    const secretsFileTexto = fs.readFileSync(store.secretsPath, 'utf8')
    for (const token of ['token_secreto_A', 'token_secreto_B']) {
      assert.equal(storeFileTexto.includes(token), false)
      assert.equal(secretsFileTexto.includes(token), false)
    }

    // Atualizar só o rótulo de A não toca o token de B nem o expõe.
    store.save({ id: 'connection-a', label: 'Conta pessoal (renomeada)' })
    assert.equal(store.getCredential('connection-b').token, 'token_secreto_B')

    // Remover A não apaga nem corrompe o token de B — a conexão B continua
    // 100% funcional depois.
    assert.equal(store.remove('connection-a'), true)
    assert.equal(store.getCredential('connection-a'), null)
    assert.equal(store.getCredential('connection-b').token, 'token_secreto_B')
    assert.deepEqual(store.list().map((c) => c.id), ['connection-b'])
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
