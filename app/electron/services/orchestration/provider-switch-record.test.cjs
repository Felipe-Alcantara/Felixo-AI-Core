const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  buildProviderSwitchEventRecord,
  getProviderIdForCliType,
} = require('./provider-switch-record.cjs')
const { createStorageDatabase } = require('../storage/sqlite-database.cjs')
const { createAccountChainRepository } = require('../storage/account-chain-repository.cjs')

function decision(overrides = {}) {
  return {
    decisionId: '6f1b1c1e-6a8e-4f4e-9a36-0f9d6f0c2b11',
    state: 'accepted',
    outcome: 'accepted',
    runId: 'run-1',
    agentId: 'reviewer-1',
    fromCliType: 'claude',
    toCliType: 'codex-app-server',
    toModelName: 'Codex App Server',
    reason: 'Claude com limite de uso.',
    note: null,
    requestedAt: '2026-05-01T12:00:00.000Z',
    decidedAt: '2026-05-01T12:03:00.000Z',
    expiresAt: '2026-05-01T12:10:00.000Z',
    ...overrides,
  }
}

test('getProviderIdForCliType grava o provedor, não o transporte', () => {
  assert.equal(getProviderIdForCliType('codex-app-server'), 'codex')
  assert.equal(getProviderIdForCliType('gemini-acp'), 'gemini')
  assert.equal(getProviderIdForCliType('claude'), 'claude')
  assert.equal(getProviderIdForCliType(''), null)
})

test('buildProviderSwitchEventRecord monta a linha provider_switch com motivo e horários', () => {
  const record = buildProviderSwitchEventRecord(decision())

  assert.deepEqual(record, {
    id: '6f1b1c1e-6a8e-4f4e-9a36-0f9d6f0c2b11',
    kind: 'provider_switch',
    state: 'accepted',
    lineageId: 'run-1',
    fromProviderId: 'claude',
    fromLabel: 'claude',
    toProviderId: 'codex',
    toLabel: 'Codex App Server',
    reason: 'Troca de provedor aceita pela pessoa. Sub-agente reviewer-1. Motivo: Claude com limite de uso.',
    proposedAt: '2026-05-01T12:00:00.000Z',
    decidedAt: '2026-05-01T12:03:00.000Z',
    expiresAt: '2026-05-01T12:10:00.000Z',
  })
})

test('buildProviderSwitchEventRecord: vencimento e interrupção viram refused com a nota', () => {
  const expired = buildProviderSwitchEventRecord(
    decision({ state: 'refused', outcome: 'expired', note: 'Sem resposta no prazo.' }),
  )
  assert.equal(expired.state, 'refused')
  assert.match(expired.reason, /^Sem resposta no prazo\./)

  const unknownState = buildProviderSwitchEventRecord(decision({ state: 'qualquer' }))
  assert.equal(unknownState.state, 'refused', 'estado desconhecido nunca vira aceite')
})

test('buildProviderSwitchEventRecord respeita o teto do motivo do registro', () => {
  const record = buildProviderSwitchEventRecord(decision({ reason: 'x'.repeat(1000) }))
  assert.equal(record.reason.length, 400)
})

test('a linha montada é aceita pelo repositório da migração 017', () => {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-provider-switch-record-'))
  const database = createStorageDatabase({ databaseDir })
  try {
    const repository = createAccountChainRepository(database)
    const inserted = repository.insertSwitchEvent(
      buildProviderSwitchEventRecord(decision({ state: 'refused', outcome: 'refused' })),
    )

    assert.equal(inserted.inserted, true)
    const [stored] = repository.listSwitchEvents({ limit: 5 })
    assert.equal(stored.kind, 'provider_switch')
    assert.equal(stored.state, 'refused')
    assert.equal(stored.fromProviderId, 'claude')
    assert.equal(stored.toProviderId, 'codex')
    assert.equal(stored.decidedAt, '2026-05-01T12:03:00.000Z')

    const again = repository.insertSwitchEvent(buildProviderSwitchEventRecord(decision()))
    assert.equal(again.inserted, false, 'a mesma decisão nunca vira duas linhas')
  } finally {
    database.close()
    fs.rmSync(databaseDir, { recursive: true, force: true })
  }
})
