const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const {
  getLatestMigrationVersion,
  listStorageMigrations,
  parseMigrationFileName,
} = require('./storage/migration-loader.cjs')
const {
  createStorageDatabase,
  getAppliedStorageMigrations,
} = require('./storage/sqlite-database.cjs')
const {
  createSettingsRepository,
} = require('./storage/settings-repository.cjs')
const {
  createNotesRepository,
} = require('./storage/notes-repository.cjs')
const {
  createProjectsRepository,
} = require('./storage/projects-repository.cjs')
const {
  MESSAGE_STORAGE_TIERS,
  resolveMessageStorageTier,
  shouldCompactMessage,
} = require('./storage/memory-tier-policy.cjs')
const {
  ORCHESTRATOR_SETTINGS_KEY,
  createOrchestratorSettingsStore,
} = require('./orchestrator-settings-store.cjs')

const EXPECTED_TABLES = [
  'schema_migrations',
  'projects',
  'chats',
  'messages',
  'threads',
  'terminal_events',
  'agent_results',
  'notes',
  'settings',
  'memory_items',
  'conversation_summaries',
  'message_archives',
]

test('storage migrations are versioned and include initial schema', () => {
  const migrations = listStorageMigrations()

  assert.equal(getLatestMigrationVersion(migrations), 1)
  assert.equal(migrations[0].name, 'initial_persistence')

  for (const tableName of EXPECTED_TABLES) {
    assert.match(
      migrations[0].sql,
      new RegExp(`CREATE TABLE ${tableName} \\(`),
      `missing table ${tableName}`,
    )
  }
})

test('storage migration parser ignores non-migration files', () => {
  assert.deepEqual(parseMigrationFileName('001_initial_persistence.sql'), {
    version: 1,
    name: 'initial_persistence',
    fileName: '001_initial_persistence.sql',
  })
  assert.equal(parseMigrationFileName('README.md'), null)
})

test('storage migration loader rejects duplicate versions', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-migrations-'))

  try {
    fs.writeFileSync(path.join(tempDir, '001_first.sql'), 'SELECT 1;', 'utf8')
    fs.writeFileSync(path.join(tempDir, '001_second.sql'), 'SELECT 2;', 'utf8')

    assert.throws(() => listStorageMigrations(tempDir), /duplicada/)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test(
  'storage database opens sqlite file and applies migrations once',
  sqliteTestOptions(),
  () => {
    const databaseDir = createTempDir('felixo-storage-db-')

    try {
      const database = createStorageDatabase({ databaseDir })

      assert.ok(fs.existsSync(database.path))
      assert.deepEqual(getAppliedStorageMigrations(database.connection), [1])
      assert.equal(
        database.connection
          .prepare('SELECT COUNT(*) AS count FROM schema_migrations')
          .get().count,
        1,
      )
      database.close()

      const reopenedDatabase = createStorageDatabase({ databaseDir })
      assert.equal(
        reopenedDatabase.connection
          .prepare('SELECT COUNT(*) AS count FROM schema_migrations')
          .get().count,
        1,
      )
      reopenedDatabase.close()
    } finally {
      removeTempDir(databaseDir)
    }
  },
)

test(
  'settings repository stores json values in sqlite',
  sqliteTestOptions(),
  () => {
    const databaseDir = createTempDir('felixo-storage-settings-')

    try {
      const database = createStorageDatabase({ databaseDir })
      const repository = createSettingsRepository(database)

      repository.set('theme', { value: 'dark' })

      assert.deepEqual(repository.get('theme'), { value: 'dark' })
      assert.deepEqual(repository.listKeys(), ['theme'])

      repository.delete('theme')

      assert.equal(repository.get('theme'), null)
      database.close()
    } finally {
      removeTempDir(databaseDir)
    }
  },
)

test(
  'notes repository stores lists and soft deletes notes',
  sqliteTestOptions(),
  () => {
    const databaseDir = createTempDir('felixo-storage-notes-')
    const now = '2026-05-03T12:00:00.000Z'

    try {
      const database = createStorageDatabase({ databaseDir })
      const repository = createNotesRepository(database)
      const note = {
        id: 'note-1',
        title: 'Nota de projeto',
        content: '',
        projectIds: ['project-a', 'project-a', 'project-b'],
        createdAt: now,
        updatedAt: now,
      }

      repository.save(note)

      assert.deepEqual(repository.get('note-1'), {
        ...note,
        projectIds: ['project-a', 'project-b'],
      })
      assert.deepEqual(repository.list(), [
        {
          ...note,
          projectIds: ['project-a', 'project-b'],
        },
      ])

      assert.equal(repository.delete('note-1'), true)
      assert.equal(repository.get('note-1'), null)
      assert.deepEqual(repository.list(), [])
      database.close()
    } finally {
      removeTempDir(databaseDir)
    }
  },
)

test(
  'projects repository stores lists and deletes projects',
  sqliteTestOptions(),
  () => {
    const databaseDir = createTempDir('felixo-storage-projects-')

    try {
      const database = createStorageDatabase({ databaseDir })
      const repository = createProjectsRepository(database)
      const project = {
        id: 'project-1',
        name: 'Felixo',
        path: '/tmp/felixo',
      }

      repository.save(project)

      assert.deepEqual(repository.get('project-1'), project)
      assert.deepEqual(repository.list(), [project])

      assert.equal(repository.delete('project-1'), true)
      assert.equal(repository.get('project-1'), null)
      assert.deepEqual(repository.list(), [])
      database.close()
    } finally {
      removeTempDir(databaseDir)
    }
  },
)

test(
  'orchestrator settings store migrates legacy json into sqlite settings',
  sqliteTestOptions(),
  async () => {
    const configDir = createTempDir('felixo-config-')
    const databaseDir = createTempDir('felixo-storage-orchestrator-')
    const legacySettings = {
      mode: 'semi_auto',
      customContext: 'Usar memoria quente primeiro.',
    }

    try {
      fs.writeFileSync(
        path.join(configDir, 'orchestrator-settings.json'),
        JSON.stringify(legacySettings),
        'utf8',
      )

      const database = createStorageDatabase({ databaseDir })
      const store = createOrchestratorSettingsStore({ configDir, database })
      const repository = createSettingsRepository(database)

      assert.deepEqual(await store.load(), legacySettings)
      assert.deepEqual(repository.get(ORCHESTRATOR_SETTINGS_KEY), legacySettings)

      const nextSettings = { ...legacySettings, mode: 'manual' }
      await store.save(nextSettings)

      assert.deepEqual(repository.get(ORCHESTRATOR_SETTINGS_KEY), nextSettings)
      database.close()
    } finally {
      removeTempDir(configDir)
      removeTempDir(databaseDir)
    }
  },
)

test('memory tier policy keeps recent messages hot', () => {
  assert.equal(
    resolveMessageStorageTier(
      { createdAt: '2026-05-01T12:00:00.000Z' },
      { now: '2026-05-03T12:00:00.000Z' },
    ),
    MESSAGE_STORAGE_TIERS.HOT,
  )
})

test('memory tier policy keeps useful old messages warm', () => {
  assert.equal(
    resolveMessageStorageTier(
      {
        createdAt: '2026-01-01T12:00:00.000Z',
        usefulnessScore: 0.6,
      },
      { now: '2026-05-03T12:00:00.000Z' },
    ),
    MESSAGE_STORAGE_TIERS.WARM,
  )
})

test('memory tier policy marks stale unused messages cold', () => {
  assert.equal(
    resolveMessageStorageTier(
      {
        createdAt: '2025-01-01T12:00:00.000Z',
        usefulnessScore: 0.1,
        useCount: 0,
      },
      { now: '2026-05-03T12:00:00.000Z' },
    ),
    MESSAGE_STORAGE_TIERS.COLD,
  )
})

test('memory tier policy compacts only large cold messages', () => {
  const coldLargeMessage = {
    createdAt: '2025-01-01T12:00:00.000Z',
    content: 'x'.repeat(9000),
    totalTokens: 1300,
    usefulnessScore: 0,
  }
  const hotLargeMessage = {
    ...coldLargeMessage,
    createdAt: '2026-05-02T12:00:00.000Z',
  }

  assert.equal(
    shouldCompactMessage(coldLargeMessage, {
      now: '2026-05-03T12:00:00.000Z',
    }),
    true,
  )
  assert.equal(
    shouldCompactMessage(hotLargeMessage, {
      now: '2026-05-03T12:00:00.000Z',
    }),
    false,
  )
})

function sqliteTestOptions() {
  return {
    skip: hasNodeSqlite() ? false : 'node:sqlite indisponivel neste runtime',
  }
}

function hasNodeSqlite() {
  try {
    require('node:sqlite')
    return true
  } catch {
    return false
  }
}

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function removeTempDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true })
}
