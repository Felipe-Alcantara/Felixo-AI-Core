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
  MESSAGE_STORAGE_TIERS,
  resolveMessageStorageTier,
  shouldCompactMessage,
} = require('./storage/memory-tier-policy.cjs')

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
