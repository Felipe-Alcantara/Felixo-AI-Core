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
  'agent usage repository persists account identity as a fingerprint and keeps samples separate',
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
        identityDisplay: 'a***@example.com',
      })
      assert.equal(repository.getLatestSample(account.id).metrics[0].used, 0)
      assert.equal(repository.getLatestSample(account.id).errorMessage, 'Falha sem detalhes seguros.')

      const rawRows = {
        accounts: database.connection
          .prepare('SELECT * FROM agent_usage_accounts')
          .all(),
        samples: database.connection
          .prepare('SELECT * FROM agent_usage_samples')
          .all(),
      }
      assert.doesNotMatch(JSON.stringify(rawRows), /alice@example\.com/)
      assert.doesNotMatch(JSON.stringify(rawRows), /sk-never-persist-this/)

      assert.equal(repository.archiveAccount(account.id), true)
      assert.deepEqual(repository.listAccounts(), [])
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
