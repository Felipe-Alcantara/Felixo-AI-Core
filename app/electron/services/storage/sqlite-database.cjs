const fs = require('node:fs')
const path = require('node:path')
const {
  getLatestMigrationVersion,
  listStorageMigrations,
} = require('./migration-loader.cjs')

const STORAGE_DATABASE_FILE = 'felixo.sqlite'

function createStorageDatabase(options = {}) {
  const databasePath = resolveDatabasePath(options)
  const sqlite = options.sqlite ?? loadNodeSqlite()

  fs.mkdirSync(path.dirname(databasePath), { recursive: true })

  const connection = new sqlite.DatabaseSync(databasePath)
  const migrations = options.migrations ?? listStorageMigrations()

  configureConnection(connection)
  applyStorageMigrations(connection, migrations)

  return {
    path: databasePath,
    connection,
    latestMigrationVersion: getLatestMigrationVersion(migrations),
    close() {
      connection.close()
    },
  }
}

function applyStorageMigrations(connection, migrations) {
  const appliedVersions = new Set(getAppliedStorageMigrations(connection))

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) {
      continue
    }

    runMigration(connection, migration)
    appliedVersions.add(migration.version)
  }
}

function getAppliedStorageMigrations(connection) {
  const hasMigrationTable = connection
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
    )
    .get()

  if (!hasMigrationTable) {
    return []
  }

  return connection
    .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
    .all()
    .map((row) => Number(row.version))
}

function runMigration(connection, migration) {
  try {
    connection.exec('BEGIN IMMEDIATE')
    connection.exec(migration.sql)
    connection
      .prepare(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
      )
      .run(migration.version, migration.name, new Date().toISOString())
    connection.exec('COMMIT')
  } catch (error) {
    try {
      connection.exec('ROLLBACK')
    } catch {
      // Keep the original migration error; rollback can fail if SQLite already aborted.
    }

    throw error
  }
}

function configureConnection(connection) {
  connection.exec('PRAGMA foreign_keys = ON')
  connection.exec('PRAGMA busy_timeout = 5000')
}

function resolveDatabasePath(options) {
  if (typeof options.databasePath === 'string' && options.databasePath.trim()) {
    return options.databasePath
  }

  if (typeof options.databaseDir === 'string' && options.databaseDir.trim()) {
    return path.join(options.databaseDir, STORAGE_DATABASE_FILE)
  }

  throw new Error('Diretorio ou caminho do banco SQLite nao informado.')
}

function loadNodeSqlite() {
  try {
    return require('node:sqlite')
  } catch (error) {
    throw new Error(
      `Runtime atual nao oferece node:sqlite. Use Node/Electron com suporte a SQLite nativo. Detalhe: ${
        error instanceof Error ? error.message : 'erro desconhecido'
      }`,
    )
  }
}

module.exports = {
  STORAGE_DATABASE_FILE,
  applyStorageMigrations,
  createStorageDatabase,
  getAppliedStorageMigrations,
  resolveDatabasePath,
}
