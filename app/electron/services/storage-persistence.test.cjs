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
  createAutomationsRepository,
  normalizeAutomation: normalizeAutomationRow,
  VALID_SCOPES,
} = require('./storage/automations-repository.cjs')
const {
  scopes: AUTOMATION_SCOPES_JSON,
} = require('./storage/automation-scopes.json')
const {
  createChatHistoryRepository,
} = require('./storage/chat-history-repository.cjs')
const {
  MESSAGE_STORAGE_TIERS,
  resolveMessageStorageTier,
  shouldCompactMessage,
} = require('./storage/memory-tier-policy.cjs')
const {
  ORCHESTRATOR_SETTINGS_KEY,
  createOrchestratorSettingsStore,
} = require('./orchestrator-settings-store.cjs')

const INITIAL_TABLES = [
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

const ADDITIONAL_TABLES_BY_MIGRATION = {
  2: ['automations'],
  3: ['models'],
  4: ['system_design_documents'],
  10: ['agent_usage_accounts', 'agent_usage_samples'],
}

test('storage migrations are versioned and include initial schema', () => {
  const migrations = listStorageMigrations()

  assert.ok(getLatestMigrationVersion(migrations) >= 1)
  assert.equal(migrations[0].name, 'initial_persistence')

  for (const tableName of INITIAL_TABLES) {
    assert.match(
      migrations[0].sql,
      new RegExp(`CREATE TABLE ${tableName} \\(`),
      `missing table ${tableName}`,
    )
  }

  for (const [version, tables] of Object.entries(ADDITIONAL_TABLES_BY_MIGRATION)) {
    const migration = migrations.find((m) => m.version === Number(version))
    assert.ok(migration, `expected migration version ${version}`)
    for (const tableName of tables) {
      assert.match(
        migration.sql,
        new RegExp(`CREATE TABLE ${tableName} \\(`),
        `migration ${version} missing table ${tableName}`,
      )
    }
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
    const expectedMigrationVersions = listStorageMigrations().map(
      (migration) => migration.version,
    )

    try {
      const database = createStorageDatabase({ databaseDir })

      assert.ok(fs.existsSync(database.path))
      assert.deepEqual(
        getAppliedStorageMigrations(database.connection),
        expectedMigrationVersions,
      )
      assert.equal(
        database.connection
          .prepare('SELECT COUNT(*) AS count FROM schema_migrations')
          .get().count,
        expectedMigrationVersions.length,
      )
      database.close()

      const reopenedDatabase = createStorageDatabase({ databaseDir })
      assert.equal(
        reopenedDatabase.connection
          .prepare('SELECT COUNT(*) AS count FROM schema_migrations')
          .get().count,
        expectedMigrationVersions.length,
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

      const expected = {
        id: 'project-1',
        name: 'Felixo',
        path: '/tmp/felixo',
        instructions: undefined,
        docsDirectory: undefined,
      }

      assert.deepEqual(repository.get('project-1'), expected)
      assert.deepEqual(repository.list(), [expected])

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
  'chat history repository stores sessions with messages',
  sqliteTestOptions(),
  () => {
    const databaseDir = createTempDir('felixo-storage-chats-')
    const now = '2026-05-03T12:00:00.000Z'

    try {
      const database = createStorageDatabase({ databaseDir })
      const repository = createChatHistoryRepository(database)
      const session = {
        id: 'chat-1',
        title: 'Resumo do projeto',
        createdAt: now,
        updatedAt: now,
        messages: [
          {
            id: 1,
            role: 'user',
            content: 'O que falta no historico?',
            attachments: [
              {
                id: 'attachment-1',
                name: 'screenshot.png',
                path: '/tmp/screenshot.png',
                type: 'image/png',
                size: 3,
                previewUrl: 'data:image/png;base64,AQID',
              },
            ],
            createdAt: '09:00',
          },
          {
            id: 2,
            role: 'assistant',
            content: 'Persistir chats e mensagens.',
            model: 'codex',
            sessionId: 'cli-session-1',
            isStreaming: true,
            createdAt: '09:01',
          },
        ],
      }

      repository.save(session)

      assert.deepEqual(repository.get('chat-1'), {
        ...session,
        messages: [
          {
            ...session.messages[0],
            model: undefined,
            sessionId: undefined,
            isStreaming: false,
          },
          {
            ...session.messages[1],
            isStreaming: false,
          },
        ],
      })
      assert.deepEqual(repository.list(), [repository.get('chat-1')])

      database.close()
    } finally {
      removeTempDir(databaseDir)
    }
  },
)

test(
  'chat history repository archives sessions',
  sqliteTestOptions(),
  () => {
    const databaseDir = createTempDir('felixo-storage-chats-archive-')
    const now = '2026-05-03T12:00:00.000Z'

    try {
      const database = createStorageDatabase({ databaseDir })
      const repository = createChatHistoryRepository(database)

      repository.save({
        id: 'chat-archive',
        title: 'Chat arquivado',
        createdAt: now,
        updatedAt: now,
        messages: [
          {
            id: 1,
            role: 'user',
            content: 'Arquivar depois',
            createdAt: '10:00',
          },
        ],
      })

      assert.equal(repository.delete('chat-archive'), true)
      assert.equal(repository.get('chat-archive'), null)
      assert.deepEqual(repository.list(), [])
      assert.equal(repository.list({ includeArchived: true }).length, 1)

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


// ---------------------------------------------------------------------------
// Topicos (scope) de um prompt: uma fonte de verdade, quatro lugares que
// precisam concordar. Ver 009_automations_scopes.sql e automation-scopes.json.
// ---------------------------------------------------------------------------

test('os quatro lugares que declaram os topicos de um prompt concordam', () => {
  const esperados = [...AUTOMATION_SCOPES_JSON].sort()

  // 1. O repositorio SQLite valida a partir do JSON.
  assert.deepEqual(
    [...VALID_SCOPES].sort(),
    esperados,
    'VALID_SCOPES do repositorio divergiu de automation-scopes.json',
  )

  // 2. A uniao TypeScript e escrita a mao (TS nao deriva uniao de JSON), entao
  //    e conferida por texto.
  const tiposFonte = fs.readFileSync(
    path.join(__dirname, '../../src/features/shared/types/automations.ts'),
    'utf8',
  )
  const uniao = /export type AutomationScope =([\s\S]*?)\r?\n\r?\n/.exec(tiposFonte)
  assert.ok(uniao, 'nao foi possivel ler a uniao AutomationScope')
  const daUniao = [...uniao[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort()
  assert.deepEqual(
    daUniao,
    esperados,
    'a uniao AutomationScope divergiu de automation-scopes.json',
  )

  // 3. Os rotulos precisam cobrir todos os topicos, senao um deles aparece
  //    sem nome no seletor.
  const rotulos = /AUTOMATION_SCOPE_LABELS[\s\S]*?\{([\s\S]*?)\r?\n\}/.exec(tiposFonte)
  assert.ok(rotulos, 'nao foi possivel ler AUTOMATION_SCOPE_LABELS')
  const rotulados = [...rotulos[1].matchAll(/^\s{2}([a-z]+):/gm)].map((m) => m[1]).sort()
  assert.deepEqual(
    rotulados,
    esperados,
    'AUTOMATION_SCOPE_LABELS nao cobre exatamente os topicos do JSON',
  )

  // 4. O CHECK do SQLite e SQL, nao le JSON: e conferido contra a migracao
  //    mais recente que redefine a tabela.
  const migracoes = listStorageMigrations()
  const comCheck = migracoes
    .filter((migracao) => /CHECK\s*\(\s*scope IN/.test(migracao.sql))
    .pop()
  assert.ok(comCheck, 'nenhuma migracao define o CHECK de scope')
  // So o que esta DENTRO do parenteses do CHECK: os comentarios da migracao
  // tambem citam os topicos entre aspas, e varreriam o arquivo inteiro.
  const trechoCheck = /CHECK\s*\(\s*scope IN\s*\(([^)]*)\)/.exec(comCheck.sql)
  assert.ok(trechoCheck, `nao foi possivel ler o CHECK de ${comCheck.fileName}`)
  const doCheck = [...trechoCheck[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort()
  assert.deepEqual(
    doCheck,
    esperados,
    `o CHECK de ${comCheck.fileName} divergiu de automation-scopes.json — ` +
      'SQLite nao altera constraint, entao acrescentar um topico exige migracao nova',
  )
})

test(
  'um prompt sobrevive a ida e volta ao banco em cada um dos sete topicos',
  sqliteTestOptions(),
  () => {
    const databaseDir = createTempDir('felixo-storage-automation-scopes-')

    try {
      const database = createStorageDatabase({ databaseDir })
      const repository = createAutomationsRepository(database)
      const agora = new Date().toISOString()

      for (const scope of AUTOMATION_SCOPES_JSON) {
        repository.save({
          id: `prompt-${scope}`,
          name: `Prompt de ${scope}`,
          description: '',
          prompt: `conteudo de ${scope}`,
          scope,
          createdAt: agora,
          updatedAt: agora,
        })
      }

      database.close()

      // Reabrir e um teste melhor que ler a mesma conexao: e o que o app faz
      // ao reiniciar, que era exatamente quando os prompts sumiam.
      const reaberto = createStorageDatabase({ databaseDir })
      const recuperados = createAutomationsRepository(reaberto).list()

      assert.deepEqual(
        recuperados.map((automation) => automation.scope).sort(),
        [...AUTOMATION_SCOPES_JSON].sort(),
        'algum topico nao sobreviveu a ida e volta ao banco',
      )
      reaberto.close()
    } finally {
      removeTempDir(databaseDir)
    }
  },
)

test('um topico fora da lista continua sendo recusado', () => {
  assert.throws(
    () =>
      normalizeAutomationRow({
        id: 'prompt-invalido',
        name: 'Invalido',
        prompt: 'texto',
        scope: 'topico-que-nao-existe',
      }),
    /Scope de automation invalido/,
    'a validacao precisa continuar recusando o que nao esta na lista',
  )
})

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
