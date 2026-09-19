const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createStorageDatabase } = require('./sqlite-database.cjs')
const { createWebviewProfilesRepository, NAME_MAX } = require('./webview-profiles-repository.cjs')

function comBanco(run) {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-webview-profiles-'))
  const database = createStorageDatabase({ databaseDir })
  try {
    return run(createWebviewProfilesRepository(database))
  } finally {
    // No Windows o arquivo SQLite não pode ser apagado com a conexão aberta.
    database.close()
    fs.rmSync(databaseDir, { recursive: true, force: true })
  }
}

test('salva e lista na ordem de criação; cor fora da paleta some', () => {
  comBanco((repo) => {
    repo.save({ id: 'trabalho-ab12', name: 'Trabalho', color: 'sky' })
    repo.save({ id: 'pessoal-cd34', name: 'Pessoal', color: '#ff0000' })
    assert.deepEqual(repo.list(), [
      { id: 'trabalho-ab12', name: 'Trabalho', color: 'sky' },
      { id: 'pessoal-cd34', name: 'Pessoal' },
    ])
  })
})

test('renomear (mesmo id) atualiza sem duplicar', () => {
  comBanco((repo) => {
    repo.save({ id: 'trabalho-ab12', name: 'Trabalho' })
    repo.save({ id: 'trabalho-ab12', name: 'Trabalho 2', color: 'rose' })
    assert.deepEqual(repo.list(), [{ id: 'trabalho-ab12', name: 'Trabalho 2', color: 'rose' }])
  })
})

test('nome repetido (sem diferenciar maiúscula) é recusado; o mesmo perfil pode se regravar', () => {
  comBanco((repo) => {
    repo.save({ id: 'trabalho-ab12', name: 'Trabalho' })
    assert.throws(() => repo.save({ id: 'outro-1234', name: 'TRABALHO' }), /Ja existe/)
    assert.doesNotThrow(() => repo.save({ id: 'trabalho-ab12', name: 'Trabalho', color: 'amber' }))
  })
})

test('recusa o Padrão, id inválido, nome vazio ou grande demais', () => {
  comBanco((repo) => {
    assert.throws(() => repo.save({ id: 'default', name: 'Padrao' }), /ID de perfil/)
    assert.throws(() => repo.save({ id: '../x', name: 'X' }), /ID de perfil/)
    assert.throws(() => repo.save({ id: 'ok-1234', name: '   ' }), /Nome de perfil/)
    assert.throws(() => repo.save({ id: 'ok-1234', name: 'x'.repeat(NAME_MAX + 1) }), /ate 40/)
    assert.throws(() => repo.save(null), /Perfil invalido/)
    assert.deepEqual(repo.list(), [])
  })
})

test('excluir tira da lista (soft-delete); findByName acha sem diferenciar maiúscula', () => {
  comBanco((repo) => {
    repo.save({ id: 'trabalho-ab12', name: 'Trabalho' })
    assert.equal(repo.findByName('  trabalho ')?.id, 'trabalho-ab12')
    assert.equal(repo.findByName('nao-existe'), null)
    assert.equal(repo.delete('trabalho-ab12'), true)
    assert.equal(repo.delete('trabalho-ab12'), false)
    assert.deepEqual(repo.list(), [])
    assert.throws(() => repo.delete('default'), /ID de perfil/)
  })
})

test('sobrevive a reabrir o banco (o critério "depois de reiniciar o app")', () => {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-webview-profiles-restart-'))
  try {
    const primeira = createStorageDatabase({ databaseDir })
    createWebviewProfilesRepository(primeira).save({ id: 'trabalho-ab12', name: 'Trabalho', color: 'sky' })
    primeira.close()
    const segunda = createStorageDatabase({ databaseDir })
    try {
      assert.deepEqual(createWebviewProfilesRepository(segunda).list(), [
        { id: 'trabalho-ab12', name: 'Trabalho', color: 'sky' },
      ])
    } finally {
      segunda.close()
    }
  } finally {
    fs.rmSync(databaseDir, { recursive: true, force: true })
  }
})
