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
  SYSTEM_DESIGN_SYNC_KEY,
  registerSystemDesignIpcHandlers,
} = require('./system-design-ipc-handlers.cjs')
const { registerQaLoggerIpcHandlers } = require('./qa-logger.cjs')
const { createStorageDatabase } = require('./storage/sqlite-database.cjs')
const { createSystemDesignRepository } = require('./storage/system-design-repository.cjs')
const { createProjectPathAccess } = require('./projects-path-security.cjs')
const { sourceKey } = require('../core/system-design-source.cjs')
Module._load = originalLoad

const DEFAULT_URL = 'https://github.com/Felipe-Alcantara/Felixo-System-Design.git'
const DOKTOR_URL = 'https://github.com/acme/Doktor-SystemDesign'
const LEGACY_SHA = 'a'.repeat(40)

function appPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-system-design-ipc-'))

  return {
    root,
    config: path.join(root, 'config'),
  }
}

test('chaves gravadas e config padrão', () => {
  assert.equal(SYSTEM_DESIGN_CONFIG_KEY, 'system-design.config')
  assert.equal(SYSTEM_DESIGN_SYNC_KEY, 'system-design.sync')
  const config = defaultConfig()
  assert.equal(config.enabled, true)
  assert.match(config.repoUrl, /Felixo-System-Design/)
  assert.equal(config.branch, 'main')
  assert.equal(config.guides.length, 1)
  assert.equal(config.lastSha, null)
  assert.equal(config.lastError, null)
})

test('normalizeConfig lê lixo como padrão e preserva o que um v1 sabia', () => {
  assert.deepEqual(normalizeConfig(null), defaultConfig())
  assert.deepEqual(normalizeConfig('texto'), defaultConfig())
  const result = normalizeConfig({
    enabled: true,
    repoUrl: 'https://github.com/user/repo.git',
    branch: 'develop',
    lastSha: 'abc1234',
    lastSyncedAt: '2026-05-08T00:00:00Z',
    lastError: 'erro de teste',
  })
  assert.equal(result.repoUrl, 'https://github.com/user/repo.git')
  assert.equal(result.branch, 'develop')
  assert.equal(result.lastSha, 'abc1234')
  assert.equal(result.lastSyncedAt, '2026-05-08T00:00:00Z')
  assert.equal(result.lastError, 'erro de teste')
  assert.equal(normalizeConfig({ enabled: 'sim' }).enabled, true)
  assert.equal(normalizeConfig({ enabled: false }).enabled, false)
})

test('normalizeConfig nunca preserva credencial de URL nem de erro', () => {
  const token = `ghp_${'b'.repeat(30)}`
  const result = normalizeConfig({
    repoUrl: `https://deploy:${token}@github.com/acme/private.git?access_token=${token}`,
    branch: 'main',
    lastSha: 'abc1234',
    lastError: `Command failed: git clone https://deploy:${token}@github.com/acme/private.git repo\nfatal: token=${token}`,
  })
  assert.doesNotMatch(JSON.stringify(result), new RegExp(token))
})

// ---------------------------------------------------------------------------
// Bancada: SQLite real, projetos registrados numa pasta temporária.
// ---------------------------------------------------------------------------

function setupHandlers(t, { rawConfig, syncSystemDesignRepository, legacyDocuments = [] } = {}) {
  handlers.clear()
  const paths = appPaths()
  const projectsRoot = path.join(paths.root, 'projetos')
  fs.mkdirSync(projectsRoot, { recursive: true })
  const database = createStorageDatabase({ databaseDir: path.join(paths.root, 'database') })

  if (rawConfig) {
    database.connection
      .prepare('INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)')
      .run(SYSTEM_DESIGN_CONFIG_KEY, JSON.stringify(rawConfig), new Date().toISOString())
  }
  for (const document of legacyDocuments) {
    database.connection
      .prepare(
        `INSERT INTO system_design_documents (path, title, summary, content, byte_size, source_sha, metadata_json, updated_at)
         VALUES (?, ?, '', ?, 0, ?, '{}', ?)`,
      )
      .run(document.path, document.title, document.content, LEGACY_SHA, '2026-09-01T10:00:00.000Z')
  }

  const access = createProjectPathAccess({ listProjectRoots: () => [projectsRoot] })
  const syncCalls = []
  registerSystemDesignIpcHandlers(paths, {
    database,
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    authorizeProjectDirectory: (directory) => access.authorizeProjectDirectory(directory),
    syncSystemDesignRepository: async (options) => {
      syncCalls.push(options)
      if (syncSystemDesignRepository) return syncSystemDesignRepository(options)
      return { headSha: 'b'.repeat(40), indexedCount: 0, removedCount: 0 }
    },
  })

  t.after(() => {
    database.close()
    fs.rmSync(paths.root, { recursive: true, force: true })
  })

  const readSetting = (key) => {
    const row = database.connection.prepare('SELECT value_json FROM settings WHERE key = ?').get(key)
    return row ? JSON.parse(row.value_json) : null
  }

  return { database, paths, projectsRoot, syncCalls, readSetting }
}

const legacyDefault = () => ({
  enabled: true,
  repoUrl: DEFAULT_URL,
  branch: 'main',
  lastSha: LEGACY_SHA,
  lastSyncedAt: '2026-09-01T10:00:00.000Z',
  lastError: null,
})

function makeProject(projectsRoot, name, { guideFile, folders = [], git = true } = {}) {
  const root = path.join(projectsRoot, name)
  fs.mkdirSync(root, { recursive: true })
  if (git) fs.mkdirSync(path.join(root, '.git'), { recursive: true })
  if (guideFile !== undefined) {
    fs.mkdirSync(path.join(root, '.felixo'), { recursive: true })
    fs.writeFileSync(path.join(root, '.felixo', 'system-design.json'), guideFile)
  }
  for (const folder of folders) {
    fs.mkdirSync(path.join(root, folder.name), { recursive: true })
    for (const [file, content] of Object.entries(folder.files ?? {})) {
      fs.mkdirSync(path.dirname(path.join(root, folder.name, file)), { recursive: true })
      fs.writeFileSync(path.join(root, folder.name, file), content)
    }
  }
  return fs.realpathSync(root)
}

// ---------------------------------------------------------------------------

test('sync redige credenciais antes do SQLite, do log QA e da resposta IPC', async (t) => {
  const token = `ghp_${'c'.repeat(30)}`
  const repoUrl = `https://deploy:${token}@github.com/acme/private.git?access_token=${token}&scope=repo`
  const error = new Error(
    `Command failed: git clone ${repoUrl} repo\nfatal: Authentication failed for '${repoUrl}'\nAuthorization: Bearer ${token}`,
  )
  error.code = 128
  error.stage = 'clone'
  error.stderr = `fatal: Authentication failed for '${repoUrl}'\nAuthorization: Bearer ${token}`
  const { syncCalls, readSetting } = setupHandlers(t, {
    syncSystemDesignRepository: async () => {
      throw error
    },
  })
  registerQaLoggerIpcHandlers(() => null)
  handlers.get('qa-logger:clear')()

  const saved = handlers.get('system-design:save-config')(null, { repoUrl })
  assert.equal(saved.ok, true)
  assert.equal(saved.config.repoUrl, 'https://github.com/acme/private.git?scope=repo')

  const syncResult = await handlers.get('system-design:sync')()
  assert.equal(syncResult.ok, false)
  assert.equal(syncCalls[0].repoUrl, 'https://github.com/acme/private.git?scope=repo')
  assert.match(syncResult.message, /Falha no Git durante clone/)
  assert.match(syncResult.message, /Código: 128/)
  assert.doesNotMatch(JSON.stringify(syncResult), new RegExp(token))
  assert.doesNotMatch(syncResult.message, /Command failed: git clone/)

  for (const key of [SYSTEM_DESIGN_CONFIG_KEY, SYSTEM_DESIGN_SYNC_KEY]) {
    const serialized = JSON.stringify(readSetting(key))
    assert.doesNotMatch(serialized, new RegExp(token))
    assert.doesNotMatch(serialized, /Command failed: git clone/)
  }

  const entries = handlers.get('qa-logger:get')()
  assert.ok(entries.some((entry) => entry.scope === 'system-design:sync'))
  assert.doesNotMatch(JSON.stringify(entries), new RegExp(token))
})

test('ler uma configuração legada remove credencial já persistida', (t) => {
  const token = `ghp_${'d'.repeat(30)}`
  const { readSetting } = setupHandlers(t, {
    rawConfig: {
      enabled: true,
      repoUrl: `https://deploy:${token}@github.com/acme/private.git`,
      branch: 'main',
      lastSha: LEGACY_SHA,
      lastSyncedAt: null,
      lastError: `Command failed: git clone https://deploy:${token}@github.com/acme/private.git repo\nfatal: token=${token}`,
    },
  })

  const result = handlers.get('system-design:get-config')()
  assert.equal(result.ok, true)
  assert.equal(result.config.repoUrl, 'https://github.com/acme/private.git')
  assert.equal(result.config.lastError, 'fatal: token=***')
  for (const key of [SYSTEM_DESIGN_CONFIG_KEY, SYSTEM_DESIGN_SYNC_KEY]) {
    assert.doesNotMatch(JSON.stringify(readSetting(key)), new RegExp(token))
  }
})

test('config v1 igual ao default migra para a v3, leva os documentos e grava uma vez', (t) => {
  const { readSetting, database } = setupHandlers(t, {
    rawConfig: legacyDefault(),
    legacyDocuments: [{ path: 'core/GUIA.md', title: 'Guia', content: '# Guia' }],
  })

  const first = handlers.get('system-design:get-config')()
  assert.equal(first.config.sourceMode, 'default')
  assert.equal(first.config.syncState, 'synced')
  assert.equal(first.config.lastSha, LEGACY_SHA)
  assert.equal(first.config.guides[0].documentCount, 1)

  const stored = readSetting(SYSTEM_DESIGN_CONFIG_KEY)
  assert.equal(stored.schemaVersion, 3)
  assert.deepEqual(stored.customSources, [])
  assert.equal('repoUrl' in stored, false, 'o default não é copiado para o disco')
  assert.equal(createSystemDesignRepository(database).countLegacyDocuments(), 0)

  const second = handlers.get('system-design:get-config')()
  assert.deepEqual(second.config, first.config)
  assert.deepEqual(readSetting(SYSTEM_DESIGN_CONFIG_KEY), stored)
  assert.equal(first.config.guides[0].documentCount, second.config.guides[0].documentCount, 'os documentos não duplicam')
})

test('config v1 com fonte própria continua própria e sem reset', (t) => {
  setupHandlers(t, {
    rawConfig: { ...legacyDefault(), enabled: false, repoUrl: 'https://github.com/acme/padroes.git', branch: 'develop' },
  })

  const { config } = handlers.get('system-design:get-config')()
  assert.equal(config.sourceMode, 'custom')
  assert.equal(config.repoUrl, 'https://github.com/acme/padroes.git')
  assert.equal(config.branch, 'develop')
  assert.equal(config.enabled, false)
  assert.equal(config.guides[0].sha, LEGACY_SHA)
})

test('save-config recusa URL inválida sem gravar e ignora campos que só o app escreve', (t) => {
  const { readSetting } = setupHandlers(t, { rawConfig: legacyDefault() })
  handlers.get('system-design:get-config')()
  const before = readSetting(SYSTEM_DESIGN_CONFIG_KEY)

  for (const repoUrl of ['', 'não é url', '--upload-pack=calc', 'file:///etc/passwd']) {
    const result = handlers.get('system-design:save-config')(null, { repoUrl })
    assert.equal(result.ok, false, repoUrl)
    assert.ok(result.message)
  }
  assert.deepEqual(readSetting(SYSTEM_DESIGN_CONFIG_KEY), before)

  const forged = handlers.get('system-design:save-config')(null, {
    enabled: false,
    lastSha: 'forjado',
    lastError: 'forjado',
    delivered: { repoUrl: 'https://x/y.git', branch: 'x', sha: 'forjado' },
  })
  assert.equal(forged.ok, true)
  assert.equal(forged.config.enabled, false)
  assert.equal(forged.config.lastSha, LEGACY_SHA)
})

test('dois guias: cada um sincroniza no próprio cache, e a falha de um não derruba o outro', async (t) => {
  const { syncCalls } = setupHandlers(t, {
    syncSystemDesignRepository: async (options) => {
      if (options.repoUrl.includes('Doktor')) throw Object.assign(new Error('fatal: sem rede'), { stage: 'clone' })
      options.repository.save({ path: 'GUIA.md', title: 'Guia', content: '# Guia' })
      return { headSha: 'e'.repeat(40), indexedCount: 1, removedCount: 0 }
    },
  })

  const saved = handlers.get('system-design:save-config')(null, {
    guides: [{ repoUrl: DEFAULT_URL, branch: 'main' }, { repoUrl: DOKTOR_URL, branch: 'main' }],
  })
  assert.equal(saved.config.guides.length, 2)

  const result = await handlers.get('system-design:sync')()
  assert.equal(result.ok, false)
  assert.deepEqual(result.results.map((item) => item.ok), [true, false])
  assert.notEqual(syncCalls[0].cacheDir, syncCalls[1].cacheDir)
  assert.deepEqual(result.config.guides.map((guide) => guide.syncState), ['synced', 'never-synced'])
  assert.equal(result.config.guides[0].documentCount, 1)
  assert.equal(result.config.guides[1].documentCount, 0)
  assert.match(result.config.guides[1].lastError, /sem rede/)
})

test('a sincronização registra a fonte de fato clonada, mesmo se a lista mudar no meio', async (t) => {
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const { readSetting } = setupHandlers(t, {
    rawConfig: legacyDefault(),
    syncSystemDesignRepository: async () => {
      await gate
      return { headSha: 'c'.repeat(40), indexedCount: 1, removedCount: 0 }
    },
  })

  const pending = handlers.get('system-design:sync')()
  handlers.get('system-design:save-config')(null, { repoUrl: 'https://github.com/acme/outra.git', branch: 'main' })
  release()
  const result = await pending

  assert.equal(result.ok, true)
  const store = readSetting(SYSTEM_DESIGN_SYNC_KEY)
  assert.equal(store.sources[sourceKey({ repoUrl: DEFAULT_URL, branch: 'main' })].sha, 'c'.repeat(40))
  assert.equal(result.config.repoUrl, 'https://github.com/acme/outra.git')
  assert.equal(result.config.syncState, 'never-synced', 'a outra fonte ainda não sincronizou')
  assert.equal(readSetting(SYSTEM_DESIGN_CONFIG_KEY).sourceMode, 'custom', 'a escolha feita no meio não foi desfeita')
})

test('falha depois de sucesso mantém o fallback offline daquela fonte', async (t) => {
  let outcome = { headSha: 'b'.repeat(40), indexedCount: 3, removedCount: 0 }
  setupHandlers(t, {
    rawConfig: { ...legacyDefault(), lastSha: null, lastSyncedAt: null },
    syncSystemDesignRepository: async () => {
      if (outcome instanceof Error) throw outcome
      return outcome
    },
  })

  assert.equal(handlers.get('system-design:get-config')().config.syncState, 'never-synced')
  assert.equal((await handlers.get('system-design:sync')()).config.syncState, 'synced')

  outcome = Object.assign(new Error('fatal: unable to access remote'), { stage: 'fetch' })
  assert.equal((await handlers.get('system-design:sync')()).ok, false)

  const { config } = handlers.get('system-design:get-config')()
  assert.equal(config.syncState, 'offline-fallback')
  assert.equal(config.delivered.sha, 'b'.repeat(40))
  assert.ok(config.lastError)
})

test('limpar o cache esquece o sincronizado e apaga o índice de todas as fontes', (t) => {
  const { database } = setupHandlers(t, {
    rawConfig: legacyDefault(),
    legacyDocuments: [{ path: 'core/GUIA.md', title: 'Guia', content: '# Guia' }],
  })
  handlers.get('system-design:get-config')()
  const result = handlers.get('system-design:reset-cache')()

  assert.equal(result.ok, true)
  assert.equal(result.config.delivered, null)
  assert.equal(result.config.syncState, 'never-synced')
  assert.deepEqual(createSystemDesignRepository(database).listSourceKeys(), [])
})

test('list/get-document do guia do usuário (forma antiga) e de um guia pela chave', async (t) => {
  const { database } = setupHandlers(t)
  const key = sourceKey({ repoUrl: DEFAULT_URL, branch: 'main' })
  createSystemDesignRepository(database).forSource(key).save({
    path: 'core/GUIA_MINIMO_QUALIDADE.md',
    title: 'Guia mínimo de qualidade',
    summary: 'Contrato curto.',
    content: '# Guia mínimo\n\nTexto do guia.',
  })

  const listed = await handlers.get('system-design:list-documents')()
  assert.equal(listed.ok, true)
  assert.equal('content' in listed.documents[0], false, 'o índice só traz o resumo')
  assert.deepEqual((await handlers.get('system-design:list-documents')(null, { guideKey: key })).documents, listed.documents)

  const found = await handlers.get('system-design:get-document')(null, listed.documents[0].path)
  assert.equal(found.document.content, '# Guia mínimo\n\nTexto do guia.')
  assert.equal((await handlers.get('system-design:get-document')(null, 'core/nao-existe.md')).ok, false)
  assert.equal((await handlers.get('system-design:get-document')(null, 42)).ok, false)
})

// ---------------------------------------------------------------------------
// Camada de projeto
// ---------------------------------------------------------------------------

test('pasta fora dos projetos registrados: nada é lido e vale a camada do usuário', async (t) => {
  const { paths } = setupHandlers(t)
  const outside = path.join(paths.root, 'fora')
  fs.mkdirSync(path.join(outside, '.felixo'), { recursive: true })
  fs.writeFileSync(path.join(outside, '.felixo', 'system-design.json'), JSON.stringify({ guias: [{ url: DOKTOR_URL }] }))

  const { project } = await handlers.get('system-design:resolve-project')(null, outside)
  assert.equal(project.authorized, false)
  assert.equal(project.layer, 'padrao')
  assert.equal(project.file, null)

  const saved = await handlers.get('system-design:save-project')(null, outside, { guides: [] })
  assert.equal(saved.ok, false)
})

test('arquivo do repositório: aparece pendente e NENHUM clone acontece antes da confirmação', async (t) => {
  const { projectsRoot, syncCalls } = setupHandlers(t)
  const root = makeProject(projectsRoot, 'cliente-a', { guideFile: JSON.stringify({ guias: [{ url: DOKTOR_URL }] }) })
  const subdir = path.join(root, 'src', 'modulo')
  fs.mkdirSync(subdir, { recursive: true })

  const { project } = await handlers.get('system-design:resolve-project')(null, subdir)
  assert.equal(project.root, root, 'a raiz é achada subindo até o .git')
  assert.equal(project.file.status, 'pendente')
  assert.equal(project.file.guides[0].label, 'System Design (Doktor-SystemDesign)')
  assert.equal(project.layer, 'padrao')

  const sync = await handlers.get('system-design:sync')(null, { projectRoot: root })
  assert.equal(sync.ok, true)
  assert.deepEqual(syncCalls, [], 'guia de arquivo pendente nunca é clonado')
})

test('confirmar o arquivo com o hash atual: vale no projeto, substitui o do usuário e sincroniza', async (t) => {
  const { projectsRoot, syncCalls } = setupHandlers(t)
  const root = makeProject(projectsRoot, 'cliente-b', { guideFile: JSON.stringify({ guias: [{ url: DOKTOR_URL }] }) })
  const { project } = await handlers.get('system-design:resolve-project')(null, root)

  const stale = await handlers.get('system-design:save-project')(null, root, { confirmFile: 'f'.repeat(64) })
  assert.equal(stale.ok, false)

  const confirmed = await handlers.get('system-design:save-project')(null, root, { confirmFile: project.file.hash })
  assert.equal(confirmed.ok, true)
  assert.equal(confirmed.project.layer, 'projeto')
  assert.equal(confirmed.project.guides[0].origin, 'projeto-arquivo')
  assert.match(confirmed.project.replaced[0].repoUrl, /Felixo-System-Design/)

  await handlers.get('system-design:sync')(null, { projectRoot: root })
  assert.deepEqual(syncCalls.map((call) => call.repoUrl), [DOKTOR_URL])

  const after = (await handlers.get('system-design:resolve-project')(null, root)).project
  assert.equal(after.guides[0].syncState, 'synced')
})

test('arquivo alterado depois da confirmação volta a pendente e para de valer', async (t) => {
  const { projectsRoot } = setupHandlers(t)
  const root = makeProject(projectsRoot, 'cliente-c', { guideFile: JSON.stringify({ guias: [{ url: DOKTOR_URL }] }) })
  const { project } = await handlers.get('system-design:resolve-project')(null, root)
  await handlers.get('system-design:save-project')(null, root, { confirmFile: project.file.hash })

  fs.writeFileSync(path.join(root, '.felixo', 'system-design.json'), JSON.stringify({ guias: [{ url: 'https://github.com/atacante/guia' }] }))
  const changed = (await handlers.get('system-design:resolve-project')(null, root)).project
  assert.equal(changed.file.status, 'alterado')
  assert.equal(changed.layer, 'padrao')
})

test('pasta de guias vale por padrão, é lida do disco e não deixa sair dela', async (t) => {
  const { projectsRoot } = setupHandlers(t)
  const root = makeProject(projectsRoot, 'cliente-d', {
    folders: [{ name: 'Padrão de qualidade - Doktor', files: { 'core/GUIA.md': '# Guia do Doktor\n\nResumo.' } }],
  })
  fs.writeFileSync(path.join(root, 'segredo.md'), '# segredo')

  const { project } = await handlers.get('system-design:resolve-project')(null, root)
  assert.equal(project.layer, 'projeto')
  assert.equal(project.guides[0].kind, 'local')
  assert.equal(project.guides[0].label, 'Doktor')

  const key = project.guides[0].key
  const listed = await handlers.get('system-design:list-documents')(null, { guideKey: key })
  assert.deepEqual(listed.documents.map((doc) => doc.path), ['core/GUIA.md'])
  assert.equal((await handlers.get('system-design:get-document')(null, 'core/GUIA.md', key)).document.title, 'Guia do Doktor')
  assert.equal((await handlers.get('system-design:get-document')(null, '../segredo.md', key)).ok, false)

  const off = await handlers.get('system-design:save-project')(null, root, { useGuideFolders: false })
  assert.equal(off.project.layer, 'padrao')
})

test('guia local de uma pasta fora dos projetos não é lido', async (t) => {
  const { paths } = setupHandlers(t)
  const outside = path.join(paths.root, 'fora-local')
  fs.mkdirSync(outside, { recursive: true })
  fs.writeFileSync(path.join(outside, 'x.md'), '# x')

  const listed = await handlers.get('system-design:list-documents')(null, { guideKey: `local:${outside}` })
  assert.equal(listed.ok, false)
})

test('link simbólico no lugar do arquivo ou da pasta .felixo não é seguido', { skip: process.platform === 'win32' }, async (t) => {
  const { projectsRoot, paths } = setupHandlers(t)
  const foreign = path.join(paths.root, 'alheio')
  fs.mkdirSync(foreign, { recursive: true })
  fs.writeFileSync(path.join(foreign, 'system-design.json'), JSON.stringify({ guias: [{ url: DOKTOR_URL }] }))

  const linkedDir = makeProject(projectsRoot, 'link-pasta')
  fs.symlinkSync(foreign, path.join(linkedDir, '.felixo'))
  assert.equal((await handlers.get('system-design:resolve-project')(null, linkedDir)).project.file.status, 'ausente')

  const linkedFile = makeProject(projectsRoot, 'link-arquivo')
  fs.mkdirSync(path.join(linkedFile, '.felixo'))
  fs.symlinkSync(path.join(foreign, 'system-design.json'), path.join(linkedFile, '.felixo', 'system-design.json'))
  const project = (await handlers.get('system-design:resolve-project')(null, linkedFile)).project
  assert.equal(project.file.status, 'invalido')
  assert.match(project.file.problems[0], /link simbólico/)
})

test('escolha no app por projeto: vale só naquele projeto e sincroniza ao pedir', async (t) => {
  const { projectsRoot, syncCalls } = setupHandlers(t)
  const a = makeProject(projectsRoot, 'projeto-a')
  const b = makeProject(projectsRoot, 'projeto-b')

  const saved = await handlers.get('system-design:save-project')(null, a, { guides: [{ repoUrl: DOKTOR_URL, branch: 'main' }] })
  assert.equal(saved.project.layer, 'projeto')
  assert.equal(saved.project.guides[0].origin, 'projeto-app')
  assert.equal((await handlers.get('system-design:resolve-project')(null, b)).project.layer, 'padrao')

  await handlers.get('system-design:sync')(null, { projectRoot: a })
  assert.deepEqual(syncCalls.map((call) => call.repoUrl), [DOKTOR_URL])

  const invalid = await handlers.get('system-design:save-project')(null, a, { guides: [{ repoUrl: 'file:///x', branch: 'main' }] })
  assert.equal(invalid.ok, false)
})
