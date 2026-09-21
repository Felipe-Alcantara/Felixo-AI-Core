const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

const handlers = new Map()
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) } }
  }

  return originalLoad.call(this, request, parent, isMain)
}
const {
  defaultConfig,
  normalizeConfig,
  SYSTEM_DESIGN_CONFIG_KEY,
  registerSystemDesignIpcHandlers,
} = require('./system-design-ipc-handlers.cjs')
const { registerQaLoggerIpcHandlers } = require('./qa-logger.cjs')
const { createStorageDatabase } = require('./storage/sqlite-database.cjs')
Module._load = originalLoad

function appPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-system-design-ipc-'))

  return {
    root,
    config: path.join(root, 'config'),
  }
}

test('SYSTEM_DESIGN_CONFIG_KEY is the expected settings key', () => {
  assert.equal(SYSTEM_DESIGN_CONFIG_KEY, 'system-design.config')
})

test('defaultConfig enables Felixo-System-Design by default and points to upstream repo', () => {
  const config = defaultConfig()
  assert.equal(config.enabled, true)
  assert.match(config.repoUrl, /Felixo-System-Design/)
  assert.equal(config.branch, 'main')
  assert.equal(config.lastSha, null)
  assert.equal(config.lastSyncedAt, null)
  assert.equal(config.lastError, null)
})

test('normalizeConfig coerces invalid input into defaults', () => {
  assert.deepEqual(normalizeConfig(null), defaultConfig())
  assert.deepEqual(normalizeConfig('texto'), defaultConfig())
  assert.deepEqual(normalizeConfig({}), defaultConfig())
})

test('normalizeConfig preserves valid fields and accepts custom repoUrl/branch', () => {
  const result = normalizeConfig({
    enabled: true,
    repoUrl: 'https://github.com/user/repo.git',
    branch: 'develop',
    lastSha: 'abc1234',
    lastSyncedAt: '2026-05-08T00:00:00Z',
    lastError: 'erro de teste',
  })
  assert.equal(result.enabled, true)
  assert.equal(result.repoUrl, 'https://github.com/user/repo.git')
  assert.equal(result.branch, 'develop')
  assert.equal(result.lastSha, 'abc1234')
  assert.equal(result.lastSyncedAt, '2026-05-08T00:00:00Z')
  assert.equal(result.lastError, 'erro de teste')
})

test('normalizeConfig never preserves credential-bearing remote or command error', () => {
  const token = `ghp_${'b'.repeat(30)}`
  const result = normalizeConfig({
    repoUrl: `https://deploy:${token}@github.com/acme/private.git?access_token=${token}`,
    branch: 'main',
    lastError: `Command failed: git clone https://deploy:${token}@github.com/acme/private.git repo\nfatal: token=${token}`,
  })

  assert.equal(result.repoUrl, 'https://github.com/acme/private.git')
  assert.equal(result.lastError, 'fatal: token=***')
  assert.doesNotMatch(JSON.stringify(result), new RegExp(token))
})

test('normalizeConfig falls back to default enabled for invalid enabled values', () => {
  assert.equal(normalizeConfig({ enabled: 'sim' }).enabled, true)
  assert.equal(normalizeConfig({ enabled: 1 }).enabled, true)
  assert.equal(normalizeConfig({ enabled: false }).enabled, false)
  assert.equal(normalizeConfig({ enabled: true }).enabled, true)
})

test('sync redige credenciais antes de config SQLite, log QA e resposta IPC', async (t) => {
  handlers.clear()
  const paths = appPaths()
  const database = createStorageDatabase({ databaseDir: path.join(paths.root, 'database') })
  const token = `ghp_${'c'.repeat(30)}`
  const repoUrl = `https://deploy:${token}@github.com/acme/private.git?access_token=${token}&scope=repo`
  let syncOptions = null
  const error = new Error(
    `Command failed: git clone ${repoUrl} repo\nfatal: Authentication failed for '${repoUrl}'\nAuthorization: Bearer ${token}`,
  )
  error.code = 128
  error.stage = 'clone'
  error.stderr = `fatal: Authentication failed for '${repoUrl}'\nAuthorization: Bearer ${token}`

  registerQaLoggerIpcHandlers(() => null)
  handlers.get('qa-logger:clear')()
  registerSystemDesignIpcHandlers(paths, {
    database,
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    syncSystemDesignRepository: async (options) => {
      syncOptions = options
      throw error
    },
  })

  t.after(() => {
    database.close()
    fs.rmSync(paths.root, { recursive: true, force: true })
  })

  const saved = handlers.get('system-design:save-config')(null, { repoUrl })
  assert.equal(saved.ok, true)
  assert.equal(saved.config.repoUrl, 'https://github.com/acme/private.git?scope=repo')

  const syncResult = await handlers.get('system-design:sync')()
  assert.equal(syncResult.ok, false)
  assert.equal(syncOptions.repoUrl, 'https://github.com/acme/private.git?scope=repo')
  assert.match(syncResult.message, /Falha no Git durante clone/)
  assert.match(syncResult.message, /Código: 128/)
  assert.doesNotMatch(JSON.stringify(syncResult), new RegExp(token))
  assert.doesNotMatch(syncResult.message, /Command failed: git clone/)

  const settingsRow = database.connection
    .prepare('SELECT value_json FROM settings WHERE key = ?')
    .get(SYSTEM_DESIGN_CONFIG_KEY)
  assert.ok(settingsRow)
  assert.doesNotMatch(settingsRow.value_json, new RegExp(token))
  assert.doesNotMatch(settingsRow.value_json, /Command failed: git clone/)

  const entries = handlers.get('qa-logger:get')()
  assert.ok(entries.some((entry) => entry.scope === 'system-design:sync'))
  assert.doesNotMatch(JSON.stringify(entries), new RegExp(token))
  assert.doesNotMatch(JSON.stringify(entries), /Command failed: git clone/)
})

test('ler uma configuração legada remove credencial já persistida', (t) => {
  handlers.clear()
  const paths = appPaths()
  const database = createStorageDatabase({ databaseDir: path.join(paths.root, 'database') })
  const token = `ghp_${'d'.repeat(30)}`
  const rawConfig = {
    enabled: true,
    repoUrl: `https://deploy:${token}@github.com/acme/private.git`,
    branch: 'main',
    lastSha: null,
    lastSyncedAt: null,
    lastError: `Command failed: git clone https://deploy:${token}@github.com/acme/private.git repo\nfatal: token=${token}`,
  }

  database.connection
    .prepare(
      'INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)',
    )
    .run(SYSTEM_DESIGN_CONFIG_KEY, JSON.stringify(rawConfig), new Date().toISOString())

  registerSystemDesignIpcHandlers(paths, {
    database,
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
  })

  t.after(() => {
    database.close()
    fs.rmSync(paths.root, { recursive: true, force: true })
  })

  const result = handlers.get('system-design:get-config')()
  assert.equal(result.ok, true)
  assert.equal(result.config.repoUrl, 'https://github.com/acme/private.git')
  assert.equal(result.config.lastError, 'fatal: token=***')

  const persisted = database.connection
    .prepare('SELECT value_json FROM settings WHERE key = ?')
    .get(SYSTEM_DESIGN_CONFIG_KEY)
  assert.doesNotMatch(persisted.value_json, new RegExp(token))
  assert.doesNotMatch(persisted.value_json, /Command failed: git clone/)
})

// ---------------------------------------------------------------------------
// Contrato da fonte (core/system-design-source.cjs) exercitado pelos handlers.
// ---------------------------------------------------------------------------

const LEGACY_SHA = 'a'.repeat(40)

function setupHandlers(t, { rawConfig, syncSystemDesignRepository } = {}) {
  handlers.clear()
  const paths = appPaths()
  const database = createStorageDatabase({ databaseDir: path.join(paths.root, 'database') })

  if (rawConfig) {
    database.connection
      .prepare('INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)')
      .run(SYSTEM_DESIGN_CONFIG_KEY, JSON.stringify(rawConfig), new Date().toISOString())
  }

  registerSystemDesignIpcHandlers(paths, {
    database,
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    ...(syncSystemDesignRepository ? { syncSystemDesignRepository } : {}),
  })

  t.after(() => {
    database.close()
    fs.rmSync(paths.root, { recursive: true, force: true })
  })

  const readStored = () =>
    JSON.parse(
      database.connection
        .prepare('SELECT value_json FROM settings WHERE key = ?')
        .get(SYSTEM_DESIGN_CONFIG_KEY).value_json,
    )

  return { database, readStored }
}

const legacyDefault = () => ({
  enabled: true,
  repoUrl: 'https://github.com/Felipe-Alcantara/Felixo-System-Design.git',
  branch: 'main',
  lastSha: LEGACY_SHA,
  lastSyncedAt: '2026-09-01T10:00:00.000Z',
  lastError: null,
})

test('config legada igual ao default é migrada para "segue o padrão" e gravada uma vez', (t) => {
  const { readStored } = setupHandlers(t, { rawConfig: legacyDefault() })

  const first = handlers.get('system-design:get-config')()
  assert.equal(first.config.sourceMode, 'default')
  assert.equal(first.config.syncState, 'synced')
  assert.equal(first.config.lastSha, LEGACY_SHA)

  const stored = readStored()
  assert.equal(stored.schemaVersion, 2)
  assert.equal(stored.sourceMode, 'default')
  assert.equal(stored.customSource, null)
  assert.equal('repoUrl' in stored, false, 'o default não deve mais ser copiado para o disco')

  const second = handlers.get('system-design:get-config')()
  assert.deepEqual(second.config, first.config)
  assert.deepEqual(readStored(), stored, 'a segunda leitura não regrava nada diferente')
})

test('config legada com fonte própria continua própria e sem reset', (t) => {
  const { readStored } = setupHandlers(t, {
    rawConfig: {
      ...legacyDefault(),
      enabled: false,
      repoUrl: 'https://github.com/acme/padroes.git',
      branch: 'develop',
    },
  })

  const { config } = handlers.get('system-design:get-config')()
  assert.equal(config.sourceMode, 'custom')
  assert.equal(config.repoUrl, 'https://github.com/acme/padroes.git')
  assert.equal(config.branch, 'develop')
  assert.equal(config.enabled, false)
  assert.equal(config.delivered.repoUrl, 'https://github.com/acme/padroes.git')
  assert.equal(readStored().customSource.branch, 'develop')
})

test('save-config recusa URL inválida sem gravar e ignora campos que só o app escreve', (t) => {
  const { readStored } = setupHandlers(t, { rawConfig: legacyDefault() })
  handlers.get('system-design:get-config')()
  const before = readStored()

  for (const repoUrl of ['', 'não é url', '--upload-pack=calc', 'file:///etc/passwd']) {
    const result = handlers.get('system-design:save-config')(null, { repoUrl })
    assert.equal(result.ok, false, repoUrl)
    assert.ok(result.message)
  }
  assert.deepEqual(readStored(), before)

  const forged = handlers.get('system-design:save-config')(null, {
    enabled: false,
    lastSha: 'forjado',
    lastError: 'forjado',
    delivered: { repoUrl: 'https://x/y.git', branch: 'x', sha: 'forjado' },
  })
  assert.equal(forged.ok, true)
  assert.equal(forged.config.enabled, false)
  assert.equal(forged.config.lastSha, LEGACY_SHA)
  assert.equal(forged.config.lastError, null)
})

test('escolher uma fonte é explícito e "voltar ao padrão" a descarta', (t) => {
  const { readStored } = setupHandlers(t, { rawConfig: legacyDefault() })

  const chosen = handlers.get('system-design:save-config')(null, {
    repoUrl: 'https://github.com/acme/padroes.git',
    branch: 'release',
  })
  assert.equal(chosen.config.sourceMode, 'custom')
  // A fonte configurada mudou, mas o conteúdo em cache ainda é do default.
  assert.equal(chosen.config.syncState, 'pending-source-change')
  assert.equal(chosen.config.delivered.repoUrl.includes('Felixo-System-Design'), true)

  const reset = handlers.get('system-design:save-config')(null, { sourceMode: 'default' })
  assert.equal(reset.config.sourceMode, 'default')
  assert.equal(reset.config.syncState, 'synced')
  assert.equal(readStored().customSource, null)
})

test('sync registra a fonte realmente sincronizada e a falha seguinte mantém o fallback offline', async (t) => {
  let outcome = { headSha: 'b'.repeat(40), indexedCount: 3, removedCount: 0 }
  const { readStored } = setupHandlers(t, {
    rawConfig: { ...legacyDefault(), lastSha: null, lastSyncedAt: null },
    syncSystemDesignRepository: async () => {
      if (outcome instanceof Error) throw outcome
      return outcome
    },
  })

  assert.equal(handlers.get('system-design:get-config')().config.syncState, 'never-synced')

  const ok = await handlers.get('system-design:sync')()
  assert.equal(ok.ok, true)
  assert.equal(ok.config.syncState, 'synced')
  assert.equal(ok.config.delivered.sha, 'b'.repeat(40))
  assert.match(ok.config.delivered.syncedAt, /^\d{4}-\d{2}-\d{2}T/)

  outcome = Object.assign(new Error('fatal: unable to access remote'), { stage: 'fetch' })
  const failed = await handlers.get('system-design:sync')()
  assert.equal(failed.ok, false)

  const { config } = handlers.get('system-design:get-config')()
  assert.equal(config.syncState, 'offline-fallback')
  assert.equal(config.delivered.sha, 'b'.repeat(40), 'o conteúdo anterior segue sendo o entregue')
  assert.ok(config.lastError)
  assert.equal(readStored().delivered.sha, 'b'.repeat(40))
})

test('trocar a fonte durante o clone não faz a entrega ser registrada com a fonte errada', async (t) => {
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const { readStored } = setupHandlers(t, {
    rawConfig: legacyDefault(),
    syncSystemDesignRepository: async () => {
      await gate
      return { headSha: 'c'.repeat(40), indexedCount: 1, removedCount: 0 }
    },
  })

  const pending = handlers.get('system-design:sync')()
  handlers.get('system-design:save-config')(null, {
    repoUrl: 'https://github.com/acme/outra.git',
    branch: 'main',
  })
  release()
  const result = await pending

  assert.equal(result.ok, true)
  // Entregue: o default (a fonte sincronizada). Configurada: a nova.
  assert.match(result.config.delivered.repoUrl, /Felixo-System-Design/)
  assert.equal(result.config.repoUrl, 'https://github.com/acme/outra.git')
  assert.equal(result.config.syncState, 'pending-source-change')
  assert.equal(readStored().sourceMode, 'custom', 'a escolha feita durante o clone não foi desfeita')
})

test('limpar o cache esquece o conteúdo entregue', (t) => {
  setupHandlers(t, { rawConfig: legacyDefault() })
  const result = handlers.get('system-design:reset-cache')()

  assert.equal(result.ok, true)
  assert.equal(result.config.delivered, null)
  assert.equal(result.config.syncState, 'never-synced')
})
