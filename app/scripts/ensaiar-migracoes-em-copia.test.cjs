'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStorageDatabase } = require('../electron/services/storage/sqlite-database.cjs')
const { listStorageMigrations } = require('../electron/services/storage/migration-loader.cjs')
const { createCanvasRepository } = require('../electron/services/storage/canvas-repository.cjs')
const { compareSummaries, ensaiarMigracoes } = require('./ensaiar-migracoes-em-copia.cjs')

const SEGREDO = 'conteudo-privado-que-nunca-pode-aparecer-no-relatorio'

/** Banco que parou na migração 18, com blocos de vários tipos e uma ligação. */
function criarBancoAntigo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-ensaio-'))
  const antigas = listStorageMigrations().filter((migration) => migration.version <= 18)
  const database = createStorageDatabase({ databaseDir: dir, migrations: antigas })
  const repository = createCanvasRepository(database)
  repository.save({ id: 'g1', type: 'group', position: { x: 0, y: 0 }, data: { label: SEGREDO } })
  repository.save({ id: 't1', type: 'terminal', parentId: 'g1', position: { x: 1, y: 2 }, data: { command: 'claude' } })
  repository.save({ id: 'n1', type: 'note', position: { x: 3, y: 4 }, data: { text: SEGREDO } })
  repository.saveEdge({ id: 'e1', source: 't1', target: 'n1', data: {} })
  const databasePath = database.path
  database.close()
  return { dir, databasePath }
}

const hashDe = (arquivo) => crypto.createHash('sha256').update(fs.readFileSync(arquivo)).digest('hex')

test('compareSummaries acusa tabela que perdeu linhas ou sumiu, e ignora tabela nova ou que cresceu', () => {
  const before = { canvas_nodes: 5, canvas_edges: 2, notas: 3, antiga: 1 }
  const after = { canvas_nodes: 4, canvas_edges: 2, notas: 9, nova: 7 }

  const result = compareSummaries(before, after)

  assert.equal(result.ok, false)
  assert.deepEqual(result.lost, [
    { table: 'antiga', before: 1, after: 0 },
    { table: 'canvas_nodes', before: 5, after: 4 },
  ])
})

test('compareSummaries aprova quando nada diminuiu', () => {
  assert.deepEqual(compareSummaries({ a: 1, b: 0 }, { a: 1, b: 0, c: 4 }), { ok: true, lost: [] })
})

test('aplica as migrações pendentes numa cópia e prova que nenhuma tabela perdeu linhas', () => {
  const { dir, databasePath } = criarBancoAntigo()
  try {
    const report = ensaiarMigracoes({ databasePath })

    assert.equal(report.ok, true)
    assert.ok(report.after.version > report.before.version, 'a migração pendente foi aplicada na cópia')
    assert.deepEqual(report.lost, [])
    assert.equal(report.integrity, 'ok')
    assert.equal(report.foreignKeyViolations, 0)
    assert.equal(report.before.tables.canvas_nodes, 3)
    assert.equal(report.after.tables.canvas_nodes, 3)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('o banco original não é tocado e a cópia temporária é apagada', () => {
  const { dir, databasePath } = criarBancoAntigo()
  try {
    const antes = hashDe(databasePath)

    const report = ensaiarMigracoes({ databasePath })

    assert.equal(hashDe(databasePath), antes, 'o original ficou byte a byte igual')
    assert.equal(fs.existsSync(report.copyDir), false, 'a pasta temporária foi removida')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('uma migração que apaga dados reprova o ensaio e nomeia a tabela', () => {
  const { dir, databasePath } = criarBancoAntigo()
  try {
    const destrutiva = {
      version: 9999,
      name: 'perde_dados',
      fileName: '9999_perde_dados.sql',
      sql: 'DELETE FROM canvas_nodes;',
    }

    const report = ensaiarMigracoes({ databasePath, migrations: [...listStorageMigrations(), destrutiva] })

    assert.equal(report.ok, false)
    assert.deepEqual(report.lost, [{ table: 'canvas_nodes', before: 3, after: 0 }])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('o relatório só tem nomes de tabela e contagens, nunca o conteúdo dos blocos', () => {
  const { dir, databasePath } = criarBancoAntigo()
  try {
    const report = ensaiarMigracoes({ databasePath })

    assert.doesNotMatch(JSON.stringify(report), new RegExp(SEGREDO))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('um banco que não existe devolve erro claro em vez de criar um vazio', () => {
  const inexistente = path.join(os.tmpdir(), 'felixo-ensaio-nao-existe', 'felixo.sqlite')

  assert.throws(() => ensaiarMigracoes({ databasePath: inexistente }), /não encontrei o banco/i)
  assert.equal(fs.existsSync(inexistente), false)
})
