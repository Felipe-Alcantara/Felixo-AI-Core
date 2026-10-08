const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  CONFIG_SCHEMA_VERSION,
  DEFAULT_BRANCH,
  DEFAULT_REPO_URL,
  MAX_GUIDES,
  SOURCE_MODES,
  SYNC_STATES,
  applyConfigChange,
  extractLegacySyncEntries,
  mergeSyncEntries,
  migrateStoredConfig,
  normalizeGuideList,
  normalizeSyncStore,
  recordClearedCache,
  recordFailedSync,
  recordSuccessfulSync,
  sourceDirName,
  sourceKey,
  sourcesEqual,
  toPublicConfig,
  validateSourceUrl,
} = require('./system-design-source.cjs')

const CUSTOM_URL = 'https://github.com/acme/engineering-standards.git'
const DOKTOR_URL = 'https://github.com/acme/Doktor-SystemDesign.git'
const NEXT_DEFAULT = { repoUrl: 'https://github.com/acme/novo-padrao.git', branch: 'main' }
const DEFAULT = { repoUrl: DEFAULT_REPO_URL, branch: DEFAULT_BRANCH }

function v1(overrides = {}) {
  return {
    enabled: true,
    repoUrl: DEFAULT_REPO_URL,
    branch: DEFAULT_BRANCH,
    lastSha: 'a'.repeat(40),
    lastSyncedAt: '2026-09-01T10:00:00.000Z',
    lastError: null,
    ...overrides,
  }
}

function v2(overrides = {}) {
  return {
    schemaVersion: 2,
    enabled: true,
    sourceMode: 'default',
    customSource: null,
    delivered: {
      repoUrl: DEFAULT_REPO_URL,
      branch: DEFAULT_BRANCH,
      sha: 'a'.repeat(40),
      syncedAt: '2026-09-21T10:00:00.000Z',
    },
    lastError: null,
    ...overrides,
  }
}

const emptyStore = () => normalizeSyncStore(null)
const syncedDefault = () =>
  recordSuccessfulSync(emptyStore(), { ...DEFAULT, sha: 'a'.repeat(40), syncedAt: '2026-09-21T10:00:00.000Z' })

describe('migração v1 → v3', () => {
  it('gravado igual ao default vira "segue o padrão" e não grava a fonte', () => {
    const stored = migrateStoredConfig(v1())

    assert.equal(stored.schemaVersion, CONFIG_SCHEMA_VERSION)
    assert.equal(stored.sourceMode, SOURCE_MODES.DEFAULT)
    assert.deepEqual(stored.customSources, [])
  })

  it('tolera .git, barra final e caixa do host ao comparar com o default', () => {
    for (const repoUrl of [
      'https://github.com/Felipe-Alcantara/Felixo-System-Design',
      'https://GITHUB.com/Felipe-Alcantara/Felixo-System-Design.git/',
      `  ${DEFAULT_REPO_URL}  `,
    ]) {
      assert.equal(migrateStoredConfig(v1({ repoUrl })).sourceMode, SOURCE_MODES.DEFAULT, repoUrl)
    }
  })

  it('URL diferente do default vira escolha explícita e preserva a fonte', () => {
    const stored = migrateStoredConfig(v1({ repoUrl: CUSTOM_URL, branch: 'develop' }))

    assert.equal(stored.sourceMode, SOURCE_MODES.CUSTOM)
    assert.deepEqual(stored.customSources, [{ repoUrl: CUSTOM_URL, branch: 'develop' }])
  })

  it('só a branch diferente já é escolha explícita', () => {
    const stored = migrateStoredConfig(v1({ branch: 'develop' }))

    assert.equal(stored.sourceMode, SOURCE_MODES.CUSTOM)
    assert.deepEqual(stored.customSources, [{ repoUrl: DEFAULT_REPO_URL, branch: 'develop' }])
  })

  it('URL própria com branch ausente continua própria (sem reset silencioso)', () => {
    const stored = migrateStoredConfig({ enabled: true, repoUrl: CUSTOM_URL })

    assert.deepEqual(stored.customSources, [{ repoUrl: CUSTOM_URL, branch: DEFAULT_BRANCH }])
  })

  it('config antiga carrega sem reset: enabled sobrevive e o sincronizado vai para o store', () => {
    const raw = v1({ enabled: false, lastError: 'fatal: repositório indisponível' })
    const stored = migrateStoredConfig(raw)
    const legacy = extractLegacySyncEntries(raw)

    assert.equal(stored.enabled, false)
    assert.equal(legacy.entries.length, 1)
    assert.equal(legacy.entries[0].sha, 'a'.repeat(40))
    assert.equal(legacy.entries[0].syncedAt, '2026-09-01T10:00:00.000Z')
    assert.match(legacy.entries[0].lastError, /indispon/)
    assert.ok(sourcesEqual(legacy.documentsSource, DEFAULT))
  })

  it('a fonte entregue no v1 é a que estava gravada na hora', () => {
    const legacy = extractLegacySyncEntries(v1({ repoUrl: CUSTOM_URL, branch: 'develop' }))

    assert.equal(legacy.entries[0].repoUrl, CUSTOM_URL)
    assert.equal(legacy.entries[0].branch, 'develop')
    assert.equal(legacy.documentsSource.repoUrl, CUSTOM_URL)
  })

  it('sem sha gravado não inventa conteúdo entregue', () => {
    const legacy = extractLegacySyncEntries(v1({ lastSha: null }))

    assert.deepEqual(legacy.entries, [])
    assert.equal(legacy.documentsSource, null)
  })

  it('lixo, nulo e vazio caem no default habilitado, sem nada a migrar', () => {
    for (const raw of [null, undefined, 'x', 42, [], {}]) {
      const stored = migrateStoredConfig(raw)
      assert.equal(stored.sourceMode, SOURCE_MODES.DEFAULT)
      assert.equal(stored.enabled, true)
      assert.deepEqual(extractLegacySyncEntries(raw).entries, [])
    }
  })

  it('é idempotente: migrar o resultado não muda nada e não tem o que migrar de novo', () => {
    const once = migrateStoredConfig(v1({ repoUrl: CUSTOM_URL, branch: 'develop' }))

    assert.deepEqual(migrateStoredConfig(once), once)
    assert.deepEqual(extractLegacySyncEntries(once), { entries: [], documentsSource: null })
  })

  it('não carrega credencial de URL nem de erro para a v3', () => {
    const raw = v1({
      repoUrl: 'https://usuario:SEGREDO123@github.com/acme/repo.git',
      lastError: 'clone falhou em https://usuario:SEGREDO123@github.com/acme/repo.git',
    })

    assert.equal(JSON.stringify(migrateStoredConfig(raw)).includes('SEGREDO123'), false)
    assert.equal(JSON.stringify(extractLegacySyncEntries(raw)).includes('SEGREDO123'), false)
  })
})

describe('migração v2 → v3', () => {
  it('fonte própria vira lista de um guia; o padrão continua padrão', () => {
    const custom = migrateStoredConfig(v2({ sourceMode: 'custom', customSource: { repoUrl: CUSTOM_URL, branch: 'develop' } }))

    assert.equal(custom.sourceMode, SOURCE_MODES.CUSTOM)
    assert.deepEqual(custom.customSources, [{ repoUrl: CUSTOM_URL, branch: 'develop' }])
    assert.deepEqual(migrateStoredConfig(v2()).customSources, [])
  })

  it('o entregue e o erro vão para a chave da fonte certa', () => {
    // Fonte trocada para CUSTOM, conteúdo ainda do default e a tentativa falhou.
    const raw = v2({
      sourceMode: 'custom',
      customSource: { repoUrl: CUSTOM_URL, branch: 'develop' },
      lastError: 'fatal: autenticação recusada',
    })
    const legacy = extractLegacySyncEntries(raw)
    const store = mergeSyncEntries(emptyStore(), legacy.entries)

    const defaultEntry = store.sources[sourceKey(DEFAULT)]
    const customEntry = store.sources[sourceKey({ repoUrl: CUSTOM_URL, branch: 'develop' })]
    assert.equal(defaultEntry.sha, 'a'.repeat(40))
    assert.equal(defaultEntry.lastError, null)
    assert.equal(customEntry.sha, null)
    assert.match(customEntry.lastError, /autentica/)
    assert.ok(sourcesEqual(legacy.documentsSource, DEFAULT))
  })

  it('mesclar entradas migradas não sobrescreve o que o store já sabe', () => {
    const store = recordSuccessfulSync(emptyStore(), { ...DEFAULT, sha: 'b'.repeat(40), syncedAt: '2026-10-08T10:00:00.000Z' })
    const merged = mergeSyncEntries(store, extractLegacySyncEntries(v2()).entries)

    assert.equal(merged.sources[sourceKey(DEFAULT)].sha, 'b'.repeat(40))
  })
})

describe('lista de guias da camada do usuário', () => {
  const base = () => migrateStoredConfig(null)

  it('dois padrões ao mesmo tempo: os dois aparecem, cada um com o próprio estado', () => {
    const chose = applyConfigChange(base(), {
      guides: [{ repoUrl: DEFAULT_REPO_URL, branch: 'main' }, { repoUrl: DOKTOR_URL, branch: 'main' }],
    })
    const publicConfig = toPublicConfig(chose.stored, syncedDefault())

    assert.equal(chose.ok, true)
    assert.equal(publicConfig.sourceMode, SOURCE_MODES.CUSTOM)
    assert.deepEqual(publicConfig.guides.map((guide) => guide.syncState), [SYNC_STATES.SYNCED, SYNC_STATES.NEVER_SYNCED])
    assert.equal(publicConfig.guides[1].label, 'System Design (Doktor-SystemDesign)')
  })

  it('a mesma fonte escrita de outro jeito conta uma vez', () => {
    const result = normalizeGuideList([
      { repoUrl: DOKTOR_URL, branch: 'main' },
      { repoUrl: 'https://GITHUB.com/acme/Doktor-SystemDesign/', branch: 'main' },
    ])

    assert.equal(result.guides.length, 1)
  })

  it(`no máximo ${MAX_GUIDES} guias`, () => {
    const many = Array.from({ length: MAX_GUIDES + 1 }, (_, index) => ({ repoUrl: `https://github.com/acme/g${index}`, branch: 'main' }))

    assert.equal(applyConfigChange(base(), { guides: many }).ok, false)
  })

  it('lista vazia volta ao padrão do app', () => {
    const custom = applyConfigChange(base(), { guides: [{ repoUrl: DOKTOR_URL, branch: 'main' }] }).stored
    const empty = applyConfigChange(custom, { guides: [] }).stored

    assert.equal(empty.sourceMode, SOURCE_MODES.DEFAULT)
    assert.equal(toPublicConfig(empty).guides[0].repoUrl, DEFAULT_REPO_URL)
  })

  it('um guia inválido recusa a lista inteira e diz qual', () => {
    const result = applyConfigChange(base(), {
      guides: [{ repoUrl: DOKTOR_URL, branch: 'main' }, { repoUrl: 'file:///etc', branch: 'main' }],
    })

    assert.equal(result.ok, false)
    assert.match(result.message, /^Guia 2:/)
  })
})

describe('novo default do app', () => {
  it('quem segue o padrão passa a receber o novo default; quem escolheu, não', () => {
    const following = migrateStoredConfig(v1())
    const chose = migrateStoredConfig(v1({ repoUrl: CUSTOM_URL, branch: 'develop' }))

    assert.equal(toPublicConfig(following, emptyStore(), NEXT_DEFAULT).repoUrl, NEXT_DEFAULT.repoUrl)
    assert.equal(toPublicConfig(chose, emptyStore(), NEXT_DEFAULT).repoUrl, CUSTOM_URL)
    assert.equal(toPublicConfig(chose, emptyStore(), NEXT_DEFAULT).sourceMode, SOURCE_MODES.CUSTOM)
  })

  it('um v1 com o default ANTIGO gravado não vira escolha explícita quando o default muda', () => {
    assert.equal(migrateStoredConfig(v1(), NEXT_DEFAULT).sourceMode, SOURCE_MODES.DEFAULT)
  })

  it('com um cache por fonte, o novo default aparece como ainda não sincronizado', () => {
    // Decisão da v3: o conteúdo do default antigo segue no cache dele, mas não
    // é apresentado como o novo — cada fonte diz o próprio estado.
    const publicConfig = toPublicConfig(migrateStoredConfig(v1()), syncedDefault(), NEXT_DEFAULT)

    assert.equal(publicConfig.syncState, SYNC_STATES.NEVER_SYNCED)
    assert.equal(publicConfig.delivered, null)
  })
})

describe('estado de sincronização por fonte', () => {
  const stored = () => migrateStoredConfig(v1())

  it('nunca sincronizou, sincronizada, offline e desligada', () => {
    assert.equal(toPublicConfig(stored(), emptyStore()).syncState, SYNC_STATES.NEVER_SYNCED)
    assert.equal(toPublicConfig(stored(), syncedDefault()).syncState, SYNC_STATES.SYNCED)
    assert.equal(
      toPublicConfig(stored(), recordFailedSync(syncedDefault(), DEFAULT, 'fatal: sem rede')).syncState,
      SYNC_STATES.OFFLINE_FALLBACK,
    )
    assert.equal(toPublicConfig({ ...stored(), enabled: false }, syncedDefault()).syncState, SYNC_STATES.DISABLED)
  })

  it('falha de sincronização não apaga o conteúdo anterior (fallback offline)', () => {
    const failed = recordFailedSync(syncedDefault(), DEFAULT, 'fatal: sem rede')

    assert.equal(failed.sources[sourceKey(DEFAULT)].sha, 'a'.repeat(40))
    assert.equal(toPublicConfig(stored(), failed).delivered.sha, 'a'.repeat(40))
  })

  it('a falha de uma fonte não mexe na outra', () => {
    const doktor = { repoUrl: DOKTOR_URL, branch: 'main' }
    const store = recordFailedSync(syncedDefault(), doktor, 'fatal: sem rede')

    assert.equal(store.sources[sourceKey(DEFAULT)].lastError, null)
    assert.equal(store.sources[sourceKey(doktor)].sha, null)
  })

  it('sucesso registra a fonte realmente usada e limpa o erro dela', () => {
    const failed = recordFailedSync(syncedDefault(), DEFAULT, 'fatal: sem rede')
    const ok = recordSuccessfulSync(failed, { ...DEFAULT, sha: 'b'.repeat(40), syncedAt: '2026-10-08T10:00:00.000Z' })

    assert.equal(ok.sources[sourceKey(DEFAULT)].lastError, null)
    assert.equal(ok.sources[sourceKey(DEFAULT)].sha, 'b'.repeat(40))
  })

  it('limpar o cache esquece tudo que foi sincronizado', () => {
    assert.deepEqual(recordClearedCache(syncedDefault()).sources, {})
  })

  it('o contrato público nunca leva credencial, nem do erro', () => {
    const failed = recordFailedSync(syncedDefault(), DEFAULT, 'fatal: https://usuario:SEGREDO123@github.com/x')

    assert.equal(JSON.stringify(toPublicConfig(stored(), failed)).includes('SEGREDO123'), false)
  })
})

describe('applyConfigChange', () => {
  const base = () => migrateStoredConfig(v1())

  it('só a lista branca é aceita: o renderer não escreve sha, data, erro nem estado', () => {
    const result = applyConfigChange(base(), {
      enabled: false,
      lastSha: 'forjado',
      lastSyncedAt: '1999-01-01',
      lastError: 'forjado',
      delivered: { repoUrl: CUSTOM_URL, branch: 'x', sha: 'forjado' },
    })

    assert.equal(result.ok, true)
    assert.deepEqual(Object.keys(result.stored).sort(), ['customSources', 'enabled', 'schemaVersion', 'sourceMode'])
    assert.equal(result.stored.enabled, false)
  })

  it('escolher uma URL é escolha explícita, mesmo igual ao default de hoje', () => {
    const result = applyConfigChange(base(), { repoUrl: DEFAULT_REPO_URL, branch: DEFAULT_BRANCH })

    assert.equal(result.stored.sourceMode, SOURCE_MODES.CUSTOM)
    assert.equal(toPublicConfig(result.stored, emptyStore(), NEXT_DEFAULT).repoUrl, DEFAULT_REPO_URL)
  })

  it('sourceMode default volta ao padrão e descarta a lista própria', () => {
    const custom = applyConfigChange(base(), { repoUrl: CUSTOM_URL, branch: 'develop' }).stored
    const reset = applyConfigChange(custom, { sourceMode: 'default' })

    assert.equal(reset.stored.sourceMode, SOURCE_MODES.DEFAULT)
    assert.deepEqual(reset.stored.customSources, [])
  })

  it('mudar só a branch mantém a URL escolhida', () => {
    const custom = applyConfigChange(base(), { repoUrl: CUSTOM_URL, branch: 'develop' }).stored
    const next = applyConfigChange(custom, { branch: 'release' })

    assert.deepEqual(next.stored.customSources, [{ repoUrl: CUSTOM_URL, branch: 'release' }])
  })

  it('URL inválida é recusada sem gravar', () => {
    for (const repoUrl of ['', '   ', 'não é url', '--upload-pack=calc', 'file:///etc/passwd', 'javascript:alert(1)']) {
      const result = applyConfigChange(base(), { repoUrl })
      assert.equal(result.ok, false, repoUrl)
      assert.ok(result.message.length > 0)
    }
  })

  it('branch inválida é recusada', () => {
    assert.equal(applyConfigChange(base(), { repoUrl: CUSTOM_URL, branch: '' }).ok, false)
    assert.equal(applyConfigChange(base(), { repoUrl: CUSTOM_URL, branch: '--exec' }).ok, false)
  })

  it('credencial digitada na URL nunca é gravada', () => {
    const result = applyConfigChange(base(), {
      guides: [{ repoUrl: 'https://usuario:SEGREDO123@github.com/acme/repo.git', branch: 'main' }],
    })

    assert.equal(JSON.stringify(result.stored).includes('SEGREDO123'), false)
  })

  it('não altera o objeto de entrada', () => {
    const original = base()
    const snapshot = JSON.stringify(original)
    applyConfigChange(original, { guides: [{ repoUrl: CUSTOM_URL, branch: 'develop' }] })

    assert.equal(JSON.stringify(original), snapshot)
  })
})

describe('validateSourceUrl / sourcesEqual / sourceKey', () => {
  it('aceita https, ssh, git e a forma scp', () => {
    for (const url of [
      'https://github.com/acme/repo.git',
      'ssh://git@github.com/acme/repo.git',
      'git@github.com:acme/repo.git',
      'git://example.com/acme/repo.git',
    ]) {
      assert.equal(validateSourceUrl(url), null, url)
    }
  })

  it('fontes iguais ignoram .git, barra e caixa do host, mas não a branch', () => {
    assert.equal(
      sourcesEqual(
        { repoUrl: 'https://GitHub.com/acme/repo.git', branch: 'main' },
        { repoUrl: 'https://github.com/acme/repo/', branch: 'main' },
      ),
      true,
    )
    assert.equal(
      sourcesEqual(
        { repoUrl: 'https://github.com/acme/repo', branch: 'main' },
        { repoUrl: 'https://github.com/acme/repo', branch: 'develop' },
      ),
      false,
    )
  })

  it('a chave e a pasta do cache são as mesmas para escritas equivalentes', () => {
    const a = { repoUrl: 'https://GitHub.com/acme/repo.git', branch: 'main' }
    const b = { repoUrl: 'https://github.com/acme/repo/', branch: 'main' }

    assert.equal(sourceKey(a), sourceKey(b))
    assert.equal(sourceDirName(sourceKey(a)), sourceDirName(sourceKey(b)))
    assert.match(sourceDirName(sourceKey(a)), /^[0-9a-f]{16}$/)
    assert.notEqual(sourceKey(a), sourceKey({ ...a, branch: 'develop' }))
  })
})
