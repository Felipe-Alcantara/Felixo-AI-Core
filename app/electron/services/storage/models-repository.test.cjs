const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createStorageDatabase } = require('./sqlite-database.cjs')
const { createModelsRepository, normalizeModel } = require('./models-repository.cjs')

const BASE = {
  id: 'm-codex',
  name: 'Codex sol',
  command: 'codex',
  source: 'official',
  cliType: 'codex',
  providerModel: 'gpt-5.6-sol',
  reasoningEffort: 'high',
}

function comBanco(run) {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-models-'))
  const database = createStorageDatabase({ databaseDir })
  try {
    return run(createModelsRepository(database))
  } finally {
    // No Windows o arquivo SQLite não pode ser apagado com a conexão aberta.
    database.close()
    fs.rmSync(databaseDir, { recursive: true, force: true })
  }
}

test('fastMode sobrevive ao ciclo salvar → listar; sem ele o campo nem aparece', () => {
  comBanco((repo) => {
    repo.save({ ...BASE, fastMode: true })
    repo.save({ ...BASE, id: 'm-normal', name: 'Codex normal' })

    const porId = Object.fromEntries(repo.list().map((model) => [model.id, model]))
    assert.equal(porId['m-codex'].fastMode, true)
    assert.equal('fastMode' in porId['m-normal'], false)
  })
})

test('desligar o fast num modelo já salvo persiste (o upsert atualiza a coluna)', () => {
  comBanco((repo) => {
    repo.save({ ...BASE, fastMode: true })
    repo.save({ ...BASE, fastMode: false })
    assert.equal('fastMode' in repo.get('m-codex'), false)
  })
})

test('normalizeModel: só o booleano true liga o fast', () => {
  assert.equal(normalizeModel({ ...BASE, fastMode: true }).fastMode, true)
  for (const valor of ['true', 1, 'priority', {}, null]) {
    assert.equal('fastMode' in normalizeModel({ ...BASE, fastMode: valor }), false)
  }
})
