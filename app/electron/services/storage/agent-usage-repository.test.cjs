'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStorageDatabase } = require('./sqlite-database.cjs')
const { createAgentUsageRepository } = require('./agent-usage-repository.cjs')
const { createIdentityFingerprint } = require('../agent-usage-model.cjs')

test(
  'agent usage repository keeps a stable fingerprint, the readable identity and no secret',
  { skip: hasNodeSqlite() ? false : 'node:sqlite indisponível neste runtime' },
  () => {
    const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-agent-usage-'))
    const database = createStorageDatabase({ databaseDir })

    try {
      const repository = createAgentUsageRepository(database)
      const identity = createIdentityFingerprint('codex', 'alice@example.com')
      const account = repository.createAccount({
        id: 'account-alice',
        providerId: 'codex',
        label: 'Codex principal',
        identityKey: identity.identityKey,
        identityDisplay: identity.identityDisplay,
        identitySource: 'manual',
        createdAt: '2026-08-28T12:00:00.000Z',
        updatedAt: '2026-08-28T12:00:00.000Z',
      })

      repository.saveSample({
        id: 'sample-alice',
        accountId: account.id,
        status: 'current',
        sourceKind: 'cli-command',
        sourceLabel: 'codex login status',
        sourceCommand: 'codex login status',
        sourceUrl: 'https://developers.openai.com/codex/cli',
        collectedAt: '2026-08-28T12:01:00.000Z',
        metrics: [
          {
            key: 'five_hour',
            label: 'Janela de 5 horas',
            used: 0,
            limit: 100,
            remaining: 100,
            unit: '%',
            precision: 'percentage',
            resetAt: null,
          },
        ],
        observedIdentityKey: identity.identityKey,
        observedIdentityDisplay: identity.identityDisplay,
        errorMessage: 'sk-never-persist-this',
        metadata: { authStatus: 'logged_in', identityMatched: true },
      })

      assert.deepEqual(repository.getAccount(account.id), {
        ...account,
        identityKey: identity.identityKey,
        // A forma de exibição é decisão de `createIdentityFingerprint`; aqui o
        // que importa é que o repositório guarda e devolve o que recebeu.
        identityDisplay: identity.identityDisplay,
      })
      assert.equal(repository.getLatestSample(account.id).metrics[0].used, 0)
      assert.equal(repository.getLatestSample(account.id).errorMessage, 'Falha sem detalhes seguros.')

      repository.saveSample({
        id: 'sample-alice-newer',
        accountId: account.id,
        status: 'unavailable',
        sourceKind: 'cli-command',
        sourceLabel: 'codex login status',
        sourceCommand: 'codex login status',
        sourceUrl: 'https://developers.openai.com/codex/cli',
        collectedAt: '2026-08-28T12:01:00.000Z',
        metrics: [],
        observedIdentityKey: identity.identityKey,
        observedIdentityDisplay: identity.identityDisplay,
        errorMessage: 'A leitura mais recente não trouxe métrica.',
        metadata: { authStatus: 'logged_in', identityMatched: true },
      })

      assert.equal(
        repository.getLatestSample(account.id).id,
        'sample-alice-newer',
        'coleta com mesmo timestamp deve desempatar pela ordem de inserção',
      )

      const rawRows = {
        accounts: database.connection
          .prepare('SELECT * FROM agent_usage_accounts')
          .all(),
        samples: database.connection
          .prepare('SELECT * FROM agent_usage_samples')
          .all(),
      }
      // O identificador da conta é gravado inteiro, por decisão explícita:
      // com duas contas do mesmo provedor, a forma abreviada não dizia qual
      // linha era qual. O que continua proibido é segredo — chave, token,
      // cookie ou senha não entram no banco em hipótese nenhuma.
      assert.match(JSON.stringify(rawRows), /alice@example\.com/)
      assert.doesNotMatch(JSON.stringify(rawRows), /sk-never-persist-this/)
      assert.doesNotMatch(JSON.stringify(rawRows), /sk-[a-z0-9-]+/i)

      assert.equal(repository.archiveAccount(account.id), true)
      assert.deepEqual(repository.listAccounts(), [])
    } finally {
      database.close()
      fs.rmSync(databaseDir, { recursive: true, force: true })
    }
  },
)

test(
  'mesclar ids de contas move amostras e arquiva a linha duplicada',
  { skip: hasNodeSqlite() ? false : 'node:sqlite indisponível neste runtime' },
  () => {
    const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-agent-usage-merge-'))
    const database = createStorageDatabase({ databaseDir })

    try {
      const repository = createAgentUsageRepository(database)
      repository.createAccount({
        id: 'conta-canonica',
        providerId: 'codex',
        label: 'Pessoal',
        createdAt: '2026-08-28T12:00:00.000Z',
        updatedAt: '2026-08-28T12:00:00.000Z',
      })
      const duplicate = repository.createAccount({
        id: 'conta-duplicada',
        providerId: 'codex',
        label: 'Pessoal',
        createdAt: '2026-08-28T12:01:00.000Z',
        updatedAt: '2026-08-28T12:01:00.000Z',
      })
      repository.saveSample({
        id: 'amostra-duplicada',
        accountId: duplicate.id,
        status: 'current',
        sourceKind: 'cli-command',
        sourceLabel: 'codex login status',
        sourceCommand: 'codex login status',
        sourceUrl: null,
        collectedAt: '2026-08-28T12:02:00.000Z',
        metrics: [],
        observedIdentityKey: null,
        observedIdentityDisplay: null,
        errorMessage: null,
        metadata: {},
      })

      assert.deepEqual(
        repository.mergeAccountIds({
          canonicalId: 'conta-canonica',
          duplicateIds: ['conta-duplicada'],
          nowIso: '2026-08-28T12:03:00.000Z',
        }),
        { accounts: 1, samples: 1 },
      )
      assert.deepEqual(repository.listAccounts().map((account) => account.id), ['conta-canonica'])
      assert.equal(repository.getLatestSample('conta-canonica').accountId, 'conta-canonica')
      assert.equal(
        database.connection
          .prepare('SELECT archived_at FROM agent_usage_accounts WHERE id = ?')
          .get('conta-duplicada').archived_at,
        '2026-08-28T12:03:00.000Z',
      )
    } finally {
      database.close()
      fs.rmSync(databaseDir, { recursive: true, force: true })
    }
  },
)

function usageSample(accountId, index, overrides = {}) {
  return {
    id: `${accountId}-${String(index).padStart(4, '0')}`,
    accountId,
    status: 'current',
    sourceKind: 'assisted-event',
    sourceLabel: 'status line do Claude Code',
    collectedAt: new Date(Date.parse('2026-11-01T00:00:00.000Z') + index * 60_000).toISOString(),
    metrics: [{ key: 'five_hour', label: 'Janela de 5 horas', used: index % 100, limit: 100, remaining: 100 - (index % 100), unit: '%', precision: 'percentage', resetAt: null }],
    metadata: {},
    ...overrides,
  }
}

test(
  'retenção: acima do teto sobram as mais recentes de cada conta e sempre a última com métrica',
  { skip: hasNodeSqlite() ? false : 'node:sqlite indisponível neste runtime' },
  () => {
    const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-agent-usage-retencao-'))
    const database = createStorageDatabase({ databaseDir })

    try {
      const repository = createAgentUsageRepository(database)
      repository.createAccount({ id: 'conta-erros', providerId: 'codex', label: 'Codex' })
      repository.createAccount({ id: 'conta-claude', providerId: 'claude', label: 'Claude' })
      const count = (accountId) =>
        database.connection.prepare('SELECT count(*) n FROM agent_usage_samples WHERE account_id = ?').get(accountId).n

      // Uma leitura boa e, depois dela, 250 falhas seguidas: o painel mostra a boa como "último valor conhecido".
      repository.saveSample(usageSample('conta-erros', 0))
      for (let index = 1; index <= 250; index += 1) {
        repository.saveSample(usageSample('conta-erros', index, { status: 'error', metrics: [], errorMessage: 'falhou' }))
      }
      for (let index = 0; index < 230; index += 1) {
        repository.saveSample(usageSample('conta-claude', index))
      }

      assert.equal(count('conta-erros'), 201)
      assert.equal(count('conta-claude'), 200)
      assert.equal(repository.getLatestSample('conta-erros').id, 'conta-erros-0250')
      assert.equal(repository.getLastAvailableSample('conta-erros').id, 'conta-erros-0000')
      assert.equal(repository.getLatestSample('conta-claude').id, 'conta-claude-0229')
      assert.equal(repository.listSamples('conta-claude', { limit: 200 }).at(-1).id, 'conta-claude-0030')
    } finally {
      database.close()
      fs.rmSync(databaseDir, { recursive: true, force: true })
    }
  },
)

test(
  'manutenção do boot: poda o que já estava gravado e compacta o arquivo só depois de uma poda grande',
  { skip: hasNodeSqlite() ? false : 'node:sqlite indisponível neste runtime' },
  () => {
    const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-agent-usage-manutencao-'))
    const database = createStorageDatabase({ databaseDir })

    try {
      const repository = createAgentUsageRepository(database)
      repository.createAccount({ id: 'conta-claude', providerId: 'claude', label: 'Claude' })
      // Linhas de antes da retenção: gravadas direto, como estavam no banco.
      const insert = database.connection.prepare(
        `INSERT INTO agent_usage_samples (id, account_id, status, source_kind, source_label, collected_at, metrics_json, metadata_json)
         VALUES (?, ?, 'current', 'assisted-event', 'status line', ?, '[{"key":"five_hour"}]', '{}')`,
      )
      for (let index = 0; index < 600; index += 1) {
        insert.run(`antiga-${index}`, 'conta-claude', new Date(Date.parse('2026-10-01T00:00:00.000Z') + index * 1000).toISOString())
      }

      assert.deepEqual(repository.maintainSamples({ vacuumAfter: 300 }), { deleted: 400, vacuumed: true })
      assert.deepEqual(repository.maintainSamples({ vacuumAfter: 300 }), { deleted: 0, vacuumed: false })
      assert.equal(repository.getLatestSample('conta-claude').id, 'antiga-599')
    } finally {
      database.close()
      fs.rmSync(databaseDir, { recursive: true, force: true })
    }
  },
)

function hasNodeSqlite() {
  try {
    require('node:sqlite')
    return true
  } catch {
    return false
  }
}
