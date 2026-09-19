const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createStorageDatabase } = require('./sqlite-database.cjs')
const { createAgentPresetsRepository, MAX_DATA_BYTES } = require('./agent-presets-repository.cjs')

const PRESET = {
  id: 'p1',
  name: 'Revisor',
  agentId: 'claude',
  model: 'opus',
  contextPrompt: 'Contexto',
  skillIds: ['builtin-revisar-pull-request'],
}

function comBanco(run, options = {}) {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-presets-'))
  const database = createStorageDatabase({ databaseDir })
  try {
    return run(createAgentPresetsRepository(database), database, databaseDir)
  } finally {
    // No Windows o arquivo SQLite não pode ser apagado com a conexão aberta.
    database.close()
    fs.rmSync(databaseDir, { recursive: true, force: true })
  }
}

test('salva e lista o preset inteiro, na ordem de criação', () => {
  comBanco((repo) => {
    repo.save(PRESET)
    repo.save({ ...PRESET, id: 'p2', name: 'Depurador' })
    assert.deepEqual(repo.list().map((item) => item.id), ['p1', 'p2'])
    assert.deepEqual(repo.list()[0], PRESET)
  })
})

test('salvar de novo o mesmo id atualiza (upsert), sem duplicar', () => {
  comBanco((repo) => {
    repo.save(PRESET)
    repo.save({ ...PRESET, name: 'Revisor v2', model: 'sonnet' })
    const lista = repo.list()
    assert.equal(lista.length, 1)
    assert.equal(lista[0].name, 'Revisor v2')
    assert.equal(lista[0].model, 'sonnet')
  })
})

test('excluir tira da lista (soft-delete) e salvar o mesmo id o traz de volta', () => {
  comBanco((repo) => {
    repo.save(PRESET)
    assert.equal(repo.delete('p1'), true)
    assert.equal(repo.delete('p1'), false)
    assert.deepEqual(repo.list(), [])
    repo.save(PRESET)
    assert.equal(repo.list().length, 1)
  })
})

test('sobrevive a reabrir o banco (o critério "reiniciar o app")', () => {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-presets-restart-'))
  try {
    const primeira = createStorageDatabase({ databaseDir })
    createAgentPresetsRepository(primeira).save(PRESET)
    primeira.close()

    const segunda = createStorageDatabase({ databaseDir })
    try {
      assert.deepEqual(createAgentPresetsRepository(segunda).list(), [PRESET])
    } finally {
      segunda.close()
    }
  } finally {
    fs.rmSync(databaseDir, { recursive: true, force: true })
  }
})

test('recusa o que não é preset, o nativo e o grande demais', () => {
  comBanco((repo) => {
    assert.throws(() => repo.save(null), /Preset invalido/)
    assert.throws(() => repo.save({ ...PRESET, id: '' }), /ID de preset/)
    assert.throws(() => repo.save({ ...PRESET, name: '  ' }), /Nome de preset/)
    assert.throws(() => repo.save({ ...PRESET, id: 'native:x' }), /nativos/)
    assert.throws(() => repo.save({ ...PRESET, native: true }), /nativos/)
    assert.throws(() => repo.save({ ...PRESET, contextPrompt: 'x'.repeat(MAX_DATA_BYTES) }), /grande demais/)
    assert.deepEqual(repo.list(), [])
  })
})

test('uma linha corrompida não esconde os outros presets', () => {
  comBanco((repo, database) => {
    repo.save(PRESET)
    database.connection
      .prepare("INSERT INTO agent_presets (id, name, data_json, created_at, updated_at) VALUES ('ruim', 'Ruim', '{ nao json', 'a', 'b')")
      .run()
    assert.deepEqual(repo.list().map((item) => item.id), ['p1'])
  })
})
