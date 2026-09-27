'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createStorageDatabase } = require('./sqlite-database.cjs')
const {
  ONBOARDING_STATE_KEY,
  compareAndSetOnboardingState,
  readOnboardingState,
} = require('./onboarding-state-repository.cjs')

const NOW = '2026-09-26T12:00:00.000Z'
const STATE = Object.freeze({ schemaVersion: 1, tours: { inicial: { status: 'ativo' } } })

function withDatabase(action) {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-onboarding-repo-'))
  const opened = []
  const open = () => {
    const database = createStorageDatabase({ databaseDir })
    opened.push(database)
    return database
  }
  try {
    return action({ databaseDir, open })
  } finally {
    for (const database of opened) {
      try {
        database.close()
      } catch {
        // Já fechado pelo próprio teste.
      }
    }
    fs.rmSync(databaseDir, { recursive: true, force: true })
  }
}

test('sem estado gravado: revisão 0, value null, sem corrupção', () => {
  withDatabase(({ open }) => {
    assert.deepEqual(readOnboardingState(open()), { revision: 0, value: null, corrupted: false })
  })
})

test('escrita com a revisão esperada aplica e sobe a revisão; revisão velha conflita com o valor atual', () => {
  withDatabase(({ open }) => {
    const database = open()
    assert.deepEqual(compareAndSetOnboardingState(database, { expectedRevision: 0, value: STATE, nowIso: NOW }), {
      applied: true,
      revision: 1,
    })
    assert.deepEqual(readOnboardingState(database), { revision: 1, value: STATE, corrupted: false })

    const next = { ...STATE, tours: { inicial: { status: 'concluido' } } }
    assert.deepEqual(compareAndSetOnboardingState(database, { expectedRevision: 1, value: next, nowIso: NOW }), {
      applied: true,
      revision: 2,
    })

    const stale = compareAndSetOnboardingState(database, { expectedRevision: 1, value: STATE, nowIso: NOW })
    assert.deepEqual(stale, { applied: false, revision: 2, value: next, corrupted: false })
    assert.deepEqual(readOnboardingState(database).value, next)
  })
})

test('linha corrompida por SQL cru: corrupted sem lançar, e regravável com expectedRevision 0', () => {
  withDatabase(({ open }) => {
    const database = open()
    const corrupt = (valueJson) =>
      database.connection
        .prepare(
          `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`,
        )
        .run(ONBOARDING_STATE_KEY, valueJson, NOW)

    for (const valueJson of ['{nao-json', '[]', '{"revision":0,"value":{}}', '{"revision":"1","value":{}}', '{"revision":3}']) {
      corrupt(valueJson)
      assert.deepEqual(readOnboardingState(database), { revision: 0, value: null, corrupted: true }, valueJson)
      assert.deepEqual(
        compareAndSetOnboardingState(database, { expectedRevision: 1, value: STATE, nowIso: NOW }),
        { applied: false, revision: 0, value: null, corrupted: true },
      )
    }

    assert.deepEqual(compareAndSetOnboardingState(database, { expectedRevision: 0, value: STATE, nowIso: NOW }), {
      applied: true,
      revision: 1,
    })
    assert.deepEqual(readOnboardingState(database), { revision: 1, value: STATE, corrupted: false })
  })
})

test('duas conexões no mesmo arquivo, com leituras intercaladas: uma aplica e a outra conflita', () => {
  withDatabase(({ open }) => {
    const first = open()
    const second = open()
    const readFirst = readOnboardingState(first)
    const readSecond = readOnboardingState(second)
    assert.equal(readFirst.revision, 0)
    assert.equal(readSecond.revision, 0)

    const claimFirst = { ...STATE, origem: 'primeira' }
    const claimSecond = { ...STATE, origem: 'segunda' }
    const resultFirst = compareAndSetOnboardingState(first, {
      expectedRevision: readFirst.revision,
      value: claimFirst,
      nowIso: NOW,
    })
    const resultSecond = compareAndSetOnboardingState(second, {
      expectedRevision: readSecond.revision,
      value: claimSecond,
      nowIso: NOW,
    })

    assert.deepEqual(resultFirst, { applied: true, revision: 1 })
    assert.deepEqual(resultSecond, { applied: false, revision: 1, value: claimFirst, corrupted: false })
  })
})

test('uma transação já aberta na conexão faz a escrita falhar sem desfazer a transação alheia', () => {
  withDatabase(({ open }) => {
    const database = open()
    database.connection.exec('BEGIN')
    database.connection
      .prepare('INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)')
      .run('outro.modulo', '1', NOW)
    assert.throws(() =>
      compareAndSetOnboardingState(database, { expectedRevision: 0, value: STATE, nowIso: NOW }),
    )
    // A transação do outro módulo continua aberta e é dele decidir o COMMIT.
    database.connection.exec('COMMIT')
    const row = database.connection.prepare('SELECT value_json FROM settings WHERE key = ?').get('outro.modulo')
    assert.equal(row.value_json, '1')
    assert.deepEqual(readOnboardingState(database), { revision: 0, value: null, corrupted: false })
  })
})

test('reabrir o banco (restart ou reinstall que preserva o perfil) mantém o estado; diretório novo começa ausente', () => {
  withDatabase(({ open }) => {
    const database = open()
    compareAndSetOnboardingState(database, { expectedRevision: 0, value: STATE, nowIso: NOW })
    database.close()
    assert.deepEqual(readOnboardingState(open()), { revision: 1, value: STATE, corrupted: false })
  })
  withDatabase(({ open }) => {
    assert.deepEqual(readOnboardingState(open()), { revision: 0, value: null, corrupted: false })
  })
})

test('conexão inválida é recusada com erro legível', () => {
  assert.throws(() => readOnboardingState(null), /Conexão SQLite inválida/)
  assert.throws(() => readOnboardingState({}), /Conexão SQLite inválida/)
})
