const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  DEFAULT_BRANCH,
  DEFAULT_REPO_URL,
  SOURCE_MODES,
  SYNC_STATES,
  applyConfigChange,
  migrateStoredConfig,
  recordClearedCache,
  recordFailedSync,
  recordSuccessfulSync,
  sourcesEqual,
  toPublicConfig,
  validateSourceUrl,
} = require('./system-design-source.cjs')

const CUSTOM_URL = 'https://github.com/acme/engineering-standards.git'
const NEXT_DEFAULT = { repoUrl: 'https://github.com/acme/novo-padrao.git', branch: 'main' }

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

describe('migração v1 → v2', () => {
  it('gravado igual ao default vira "segue o padrão" e não grava a fonte', () => {
    const stored = migrateStoredConfig(v1())

    assert.equal(stored.schemaVersion, 2)
    assert.equal(stored.sourceMode, SOURCE_MODES.DEFAULT)
    assert.equal(stored.customSource, null)
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
    assert.deepEqual(stored.customSource, { repoUrl: CUSTOM_URL, branch: 'develop' })
  })

  it('só a branch diferente já é escolha explícita', () => {
    const stored = migrateStoredConfig(v1({ branch: 'develop' }))

    assert.equal(stored.sourceMode, SOURCE_MODES.CUSTOM)
    assert.equal(stored.customSource.repoUrl, DEFAULT_REPO_URL)
    assert.equal(stored.customSource.branch, 'develop')
  })

  it('URL própria com branch ausente continua própria (sem reset silencioso)', () => {
    const stored = migrateStoredConfig({ enabled: true, repoUrl: CUSTOM_URL })

    assert.equal(stored.sourceMode, SOURCE_MODES.CUSTOM)
    assert.equal(stored.customSource.repoUrl, CUSTOM_URL)
    assert.equal(stored.customSource.branch, DEFAULT_BRANCH)
  })

  it('config antiga carrega sem reset: enabled, sha, data e erro sobrevivem', () => {
    const stored = migrateStoredConfig(
      v1({ enabled: false, lastError: 'fatal: repositório indisponível' }),
    )

    assert.equal(stored.enabled, false)
    assert.equal(stored.delivered.sha, 'a'.repeat(40))
    assert.equal(stored.delivered.syncedAt, '2026-09-01T10:00:00.000Z')
    assert.match(stored.lastError, /indispon/)
  })

  it('a fonte entregue no v1 é a que estava gravada na hora', () => {
    const stored = migrateStoredConfig(v1({ repoUrl: CUSTOM_URL, branch: 'develop' }))

    assert.equal(stored.delivered.repoUrl, CUSTOM_URL)
    assert.equal(stored.delivered.branch, 'develop')
  })

  it('sem sha gravado não inventa conteúdo entregue', () => {
    assert.equal(migrateStoredConfig(v1({ lastSha: null })).delivered, null)
  })

  it('lixo, nulo e vazio caem no default habilitado', () => {
    for (const raw of [null, undefined, 'x', 42, [], {}]) {
      const stored = migrateStoredConfig(raw)
      assert.equal(stored.sourceMode, SOURCE_MODES.DEFAULT)
      assert.equal(stored.enabled, true)
      assert.equal(stored.delivered, null)
    }
  })

  it('é idempotente: migrar o resultado não muda nada', () => {
    const once = migrateStoredConfig(v1({ repoUrl: CUSTOM_URL, branch: 'develop' }))

    assert.deepEqual(migrateStoredConfig(once), once)
  })

  it('não carrega credencial de URL nem de erro para o v2', () => {
    const stored = migrateStoredConfig(
      v1({
        repoUrl: 'https://usuario:SEGREDO123@github.com/acme/repo.git',
        lastError: 'clone falhou em https://usuario:SEGREDO123@github.com/acme/repo.git',
      }),
    )

    assert.equal(JSON.stringify(stored).includes('SEGREDO123'), false)
  })
})

describe('novo default do app', () => {
  it('quem segue o padrão passa a receber o novo default; quem escolheu, não', () => {
    const following = migrateStoredConfig(v1())
    const chose = migrateStoredConfig(v1({ repoUrl: CUSTOM_URL, branch: 'develop' }))

    assert.equal(toPublicConfig(following, NEXT_DEFAULT).repoUrl, NEXT_DEFAULT.repoUrl)
    assert.equal(toPublicConfig(chose, NEXT_DEFAULT).repoUrl, CUSTOM_URL)
    assert.equal(toPublicConfig(chose, NEXT_DEFAULT).sourceMode, SOURCE_MODES.CUSTOM)
  })

  it('um v1 com o default ANTIGO gravado não vira escolha explícita quando o default muda', () => {
    // Pulou de uma versão v1 direto para uma com novo default.
    const stored = migrateStoredConfig(v1(), NEXT_DEFAULT)

    assert.equal(stored.sourceMode, SOURCE_MODES.DEFAULT)
  })

  it('a mudança de default deixa o conteúdo antigo como entregue até sincronizar', () => {
    const stored = migrateStoredConfig(v1())
    const publicConfig = toPublicConfig(stored, NEXT_DEFAULT)

    assert.equal(publicConfig.syncState, SYNC_STATES.PENDING_SOURCE_CHANGE)
    assert.equal(publicConfig.delivered.repoUrl, DEFAULT_REPO_URL)
    assert.equal(publicConfig.repoUrl, NEXT_DEFAULT.repoUrl)
  })
})

describe('estado de sincronização', () => {
  const synced = () => migrateStoredConfig(v1())

  it('nunca sincronizou, sincronizada, offline e desligada', () => {
    assert.equal(toPublicConfig(migrateStoredConfig(v1({ lastSha: null }))).syncState, SYNC_STATES.NEVER_SYNCED)
    assert.equal(toPublicConfig(synced()).syncState, SYNC_STATES.SYNCED)
    assert.equal(
      toPublicConfig(recordFailedSync(synced(), 'fatal: sem rede')).syncState,
      SYNC_STATES.OFFLINE_FALLBACK,
    )
    assert.equal(
      toPublicConfig({ ...synced(), enabled: false }).syncState,
      SYNC_STATES.DISABLED,
    )
  })

  it('falha de sincronização não apaga o conteúdo entregue (fallback offline)', () => {
    const failed = recordFailedSync(synced(), 'fatal: sem rede')

    assert.equal(failed.delivered.sha, 'a'.repeat(40))
  })

  it('sucesso registra a fonte realmente usada e limpa o erro', () => {
    const failed = recordFailedSync(synced(), 'fatal: sem rede')
    const ok = recordSuccessfulSync(failed, {
      repoUrl: CUSTOM_URL,
      branch: 'develop',
      sha: 'b'.repeat(40),
      syncedAt: '2026-09-21T10:00:00.000Z',
    })

    assert.equal(ok.lastError, null)
    assert.equal(ok.delivered.repoUrl, CUSTOM_URL)
    assert.equal(ok.delivered.sha, 'b'.repeat(40))
  })

  it('trocar a fonte e falhar deixa dito que o conteúdo é da fonte anterior', () => {
    const changed = applyConfigChange(synced(), { repoUrl: CUSTOM_URL, branch: 'develop' })
    const failed = recordFailedSync(changed.stored, 'fatal: autenticação recusada')
    const publicConfig = toPublicConfig(failed)

    assert.equal(publicConfig.syncState, SYNC_STATES.PENDING_SOURCE_CHANGE)
    assert.equal(publicConfig.delivered.repoUrl, DEFAULT_REPO_URL)
    assert.equal(publicConfig.repoUrl, CUSTOM_URL)
  })

  it('limpar o cache esquece o que foi entregue', () => {
    assert.equal(recordClearedCache(synced()).delivered, null)
  })

  it('o contrato público nunca leva o texto do erro, só o estado', () => {
    const failed = recordFailedSync(synced(), 'fatal: https://usuario:SEGREDO123@github.com/x')
    const serialized = JSON.stringify(toPublicConfig(failed))

    assert.equal(serialized.includes('SEGREDO123'), false)
  })
})

describe('applyConfigChange', () => {
  const base = () => migrateStoredConfig(v1())

  it('só a lista branca é aceita: o renderer não escreve sha, data, erro nem fonte entregue', () => {
    const result = applyConfigChange(base(), {
      enabled: false,
      lastSha: 'forjado',
      lastSyncedAt: '1999-01-01',
      lastError: 'forjado',
      delivered: { repoUrl: CUSTOM_URL, branch: 'x', sha: 'forjado' },
    })

    assert.equal(result.ok, true)
    assert.equal(result.stored.enabled, false)
    assert.equal(result.stored.delivered.sha, 'a'.repeat(40))
    assert.equal(result.stored.lastError, null)
  })

  it('escolher uma URL é escolha explícita, mesmo igual ao default de hoje', () => {
    const result = applyConfigChange(base(), { repoUrl: DEFAULT_REPO_URL, branch: DEFAULT_BRANCH })

    assert.equal(result.stored.sourceMode, SOURCE_MODES.CUSTOM)
    assert.equal(toPublicConfig(result.stored, NEXT_DEFAULT).repoUrl, DEFAULT_REPO_URL)
  })

  it('sourceMode default volta ao padrão e descarta a fonte própria', () => {
    const custom = applyConfigChange(base(), { repoUrl: CUSTOM_URL, branch: 'develop' }).stored
    const reset = applyConfigChange(custom, { sourceMode: 'default' })

    assert.equal(reset.stored.sourceMode, SOURCE_MODES.DEFAULT)
    assert.equal(reset.stored.customSource, null)
  })

  it('mudar só a branch mantém a URL escolhida', () => {
    const custom = applyConfigChange(base(), { repoUrl: CUSTOM_URL, branch: 'develop' }).stored
    const next = applyConfigChange(custom, { branch: 'release' })

    assert.equal(next.stored.customSource.repoUrl, CUSTOM_URL)
    assert.equal(next.stored.customSource.branch, 'release')
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
      repoUrl: 'https://usuario:SEGREDO123@github.com/acme/repo.git',
      branch: 'main',
    })

    assert.equal(JSON.stringify(result.stored).includes('SEGREDO123'), false)
  })

  it('não altera o objeto de entrada', () => {
    const original = base()
    const snapshot = JSON.stringify(original)
    applyConfigChange(original, { repoUrl: CUSTOM_URL, branch: 'develop' })

    assert.equal(JSON.stringify(original), snapshot)
  })
})

describe('validateSourceUrl / sourcesEqual', () => {
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
})
