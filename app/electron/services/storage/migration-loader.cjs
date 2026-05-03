const fs = require('node:fs')
const path = require('node:path')

const STORAGE_MIGRATIONS_DIR = path.join(__dirname, 'migrations')
const MIGRATION_FILE_PATTERN = /^(\d{3,})_([a-z0-9_]+)\.sql$/

function listStorageMigrations(migrationsDir = STORAGE_MIGRATIONS_DIR) {
  const migrations = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => parseMigrationFileName(entry.name))
    .filter(Boolean)
    .sort((a, b) => a.version - b.version)
    .map((migration) => ({
      ...migration,
      filePath: path.join(migrationsDir, migration.fileName),
      sql: fs.readFileSync(path.join(migrationsDir, migration.fileName), 'utf8'),
    }))

  validateStorageMigrations(migrations)
  return migrations
}

function parseMigrationFileName(fileName) {
  const match = MIGRATION_FILE_PATTERN.exec(fileName)

  if (!match) {
    return null
  }

  return {
    version: Number(match[1]),
    name: match[2],
    fileName,
  }
}

function validateStorageMigrations(migrations) {
  const versions = new Set()

  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version <= 0) {
      throw new Error(`Migration invalida: ${migration.fileName}`)
    }

    if (versions.has(migration.version)) {
      throw new Error(`Migration duplicada para versao ${migration.version}.`)
    }

    if (!migration.sql || !migration.sql.trim()) {
      throw new Error(`Migration sem SQL: ${migration.fileName}`)
    }

    versions.add(migration.version)
  }
}

function getLatestMigrationVersion(migrations = listStorageMigrations()) {
  return migrations.reduce(
    (latestVersion, migration) => Math.max(latestVersion, migration.version),
    0,
  )
}

module.exports = {
  MIGRATION_FILE_PATTERN,
  STORAGE_MIGRATIONS_DIR,
  getLatestMigrationVersion,
  listStorageMigrations,
  parseMigrationFileName,
  validateStorageMigrations,
}
