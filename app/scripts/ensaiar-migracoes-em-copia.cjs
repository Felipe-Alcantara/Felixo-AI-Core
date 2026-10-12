'use strict'

/**
 * Ensaia as migrações pendentes numa CÓPIA do banco real, antes de elas rodarem
 * de verdade na máquina de alguém.
 *
 * Código se reverte com um commit; dado perdido não volta. Esta é a "prova em
 * cópia dos dados reais" que a skill de migração segura pede: copia o banco (e os
 * arquivos `-wal`/`-shm`), aplica as migrações pendentes só na cópia, e confere
 * que nenhuma tabela perdeu linhas, que o `integrity_check` está ok e que não há
 * violação de chave estrangeira. O banco original nunca é aberto para escrita, e
 * o relatório só tem nomes de tabela e contagens, nunca o conteúdo.
 *
 * Uso (de dentro de `app/`):
 *   node scripts/ensaiar-migracoes-em-copia.cjs [--banco <caminho do felixo.sqlite>]
 *
 * Sem `--banco`, usa o banco do perfil do app neste computador. Sai com código 1
 * se alguma tabela perder linhas, se o `integrity_check` não vier "ok", se houver
 * violação de chave estrangeira ou se a migração falhar. Funciona em Windows,
 * macOS e Linux.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')
const { getAppPaths } = require('../electron/core/app-paths.cjs')
const { createStorageDatabase, STORAGE_DATABASE_FILE } = require('../electron/services/storage/sqlite-database.cjs')
const { listStorageMigrations } = require('../electron/services/storage/migration-loader.cjs')

const SIDECAR_SUFFIXES = ['-wal', '-shm']

function quoteIdentifier(name) {
  return `"${String(name).replace(/"/g, '""')}"`
}

/** Contagem de linhas de cada tabela do usuário (sem as internas do SQLite). */
function summarizeTables(connection) {
  const names = connection
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => row.name)

  return Object.fromEntries(
    names.map((name) => [name, connection.prepare(`SELECT COUNT(*) AS n FROM ${quoteIdentifier(name)}`).get().n]),
  )
}

/** Maior versão de migração aplicada; 0 se a tabela de controle ainda não existe. */
function readVersion(connection) {
  try {
    return connection.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v ?? 0
  } catch {
    return 0
  }
}

/**
 * Tabela que perdeu linhas ou sumiu é perda de dado. Tabela nova e contagem que
 * cresceu não são problema.
 *
 * @param {Record<string, number>} before
 * @param {Record<string, number>} after
 */
function compareSummaries(before, after) {
  const lost = Object.keys(before)
    .sort()
    .filter((table) => (after[table] ?? 0) < before[table])
    .map((table) => ({ table, before: before[table], after: after[table] ?? 0 }))
  return { ok: lost.length === 0, lost }
}

function copyDatabase(databasePath, directory) {
  const target = path.join(directory, path.basename(databasePath))
  fs.copyFileSync(databasePath, target)
  for (const suffix of SIDECAR_SUFFIXES) {
    if (fs.existsSync(databasePath + suffix)) fs.copyFileSync(databasePath + suffix, target + suffix)
  }
  return target
}

function readSnapshot(databasePath) {
  const connection = new DatabaseSync(databasePath, { readOnly: true })
  try {
    return { version: readVersion(connection), tables: summarizeTables(connection) }
  } finally {
    connection.close()
  }
}

/**
 * @param {{ databasePath: string, migrations?: Array<{ version: number, sql: string }> }} options
 * @returns {{
 *   ok: boolean,
 *   before: { version: number, tables: Record<string, number> },
 *   after: { version: number, tables: Record<string, number> },
 *   lost: Array<{ table: string, before: number, after: number }>,
 *   integrity: string,
 *   foreignKeyViolations: number,
 *   copyDir: string,
 * }}
 */
function ensaiarMigracoes({ databasePath, migrations = listStorageMigrations() }) {
  if (!fs.existsSync(databasePath)) {
    throw new Error(`Não encontrei o banco em ${databasePath}. Passe o caminho com --banco.`)
  }

  const copyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-ensaio-migracao-'))
  try {
    const copy = copyDatabase(databasePath, copyDir)
    const before = readSnapshot(copy)

    // `createStorageDatabase` aplica as migrações pendentes, como o app faria.
    const database = createStorageDatabase({ databasePath: copy, migrations })
    let integrity
    let foreignKeyViolations
    try {
      integrity = database.connection.prepare('PRAGMA integrity_check').all()[0]?.integrity_check ?? 'desconhecido'
      foreignKeyViolations = database.connection.prepare('PRAGMA foreign_key_check').all().length
    } finally {
      database.close()
    }

    const after = readSnapshot(copy)
    const { lost } = compareSummaries(before.tables, after.tables)
    return {
      ok: lost.length === 0 && integrity === 'ok' && foreignKeyViolations === 0,
      before,
      after,
      lost,
      integrity,
      foreignKeyViolations,
      copyDir,
    }
  } finally {
    fs.rmSync(copyDir, { recursive: true, force: true })
  }
}

function parseArgs(argv) {
  const index = argv.indexOf('--banco')
  return { databasePath: index >= 0 ? argv[index + 1] : undefined }
}

function defaultDatabasePath() {
  return path.join(getAppPaths().userData, 'database', STORAGE_DATABASE_FILE)
}

function formatReport(report) {
  const lines = [
    `Versão das migrações: ${report.before.version} → ${report.after.version}`,
    `integrity_check: ${report.integrity} · violações de chave estrangeira: ${report.foreignKeyViolations}`,
    'Tabelas (antes → depois):',
    ...Object.keys(report.before.tables)
      .sort()
      .map((table) => `  ${table}: ${report.before.tables[table]} → ${report.after.tables[table] ?? 0}`),
  ]
  if (report.lost.length > 0) {
    lines.push('PERDA DE DADOS:', ...report.lost.map((item) => `  ${item.table}: ${item.before} → ${item.after}`))
  }
  lines.push(report.ok ? 'Resultado: OK. A cópia migrou sem perder nada.' : 'Resultado: REPROVADO. Não aplique estas migrações.')
  return lines.join('\n')
}

function main(argv = process.argv.slice(2)) {
  const { databasePath = defaultDatabasePath() } = parseArgs(argv)
  try {
    const report = ensaiarMigracoes({ databasePath })
    console.log(formatReport(report))
    return report.ok ? 0 : 1
  } catch (error) {
    console.error(`Falha no ensaio: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

if (require.main === module) {
  process.exitCode = main()
}

module.exports = { compareSummaries, ensaiarMigracoes, formatReport, summarizeTables }
