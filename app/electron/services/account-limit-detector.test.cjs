'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { detectAccountLimitIssue } = require('./account-limit-detector.cjs')

test('sem sinal de limite/autenticação no texto, não detecta nada', () => {
  assert.equal(
    detectAccountLimitIssue({
      accountId: 'conta-1',
      providerId: 'codex',
      text: 'tudo certo, sessão respondendo normalmente',
    }),
    null,
  )
})

test('detecta limite de uso e devolve accountId/providerId junto', () => {
  const issue = detectAccountLimitIssue({
    accountId: 'conta-alice',
    providerId: 'codex',
    text: 'Error: rate limit exceeded, please try again later (429)',
    now: () => Date.parse('2026-09-25T12:00:00.000Z'),
  })

  assert.equal(issue.status, 'limit_reached')
  assert.equal(issue.accountId, 'conta-alice')
  assert.equal(issue.providerId, 'codex')
  assert.ok(issue.expiresAt > Date.parse('2026-09-25T12:00:00.000Z'))
})

test('detecta autenticação perdida (sessão saiu) e devolve accountId/providerId junto', () => {
  const issue = detectAccountLimitIssue({
    accountId: 'conta-bob',
    providerId: 'openia',
    text: 'Error: Unauthorized (401) — please login again',
  })

  assert.equal(issue.status, 'no_login')
  assert.equal(issue.accountId, 'conta-bob')
  assert.equal(issue.providerId, 'openia')
})

test('respeita o vocabulário/cooldown específico do Claude (herdado do orquestrador, sem duplicar regex)', () => {
  const now = Date.parse('2026-05-02T15:10:00-03:00')
  const issue = detectAccountLimitIssue({
    accountId: 'conta-claude',
    providerId: 'claude',
    text: "You're out of extra usage · resets 4:40pm (America/Sao_Paulo)",
    now: () => now,
  })

  assert.equal(issue.status, 'limit_reached')
  assert.equal(issue.scope, 'cli')
  assert.equal(issue.resetLabel, '4:40pm')
  assert.equal(issue.accountId, 'conta-claude')
})

test('accountId/providerId ausentes ou vazios não lançam — viram null', () => {
  const issue = detectAccountLimitIssue({
    accountId: '   ',
    providerId: undefined,
    text: 'rate limit exceeded',
  })

  assert.equal(issue.accountId, null)
  assert.equal(issue.providerId, null)
  assert.equal(issue.status, 'limit_reached')
})

test('entrada hostil (texto ausente, objeto vazio) não lança e devolve null', () => {
  assert.doesNotThrow(() => detectAccountLimitIssue())
  assert.equal(detectAccountLimitIssue(), null)
  assert.equal(detectAccountLimitIssue({ text: '' }), null)
  assert.equal(detectAccountLimitIssue({ text: null }), null)
})

test('não confunde texto comum que apenas contém "limite" fora do vocabulário conhecido', () => {
  assert.equal(
    detectAccountLimitIssue({
      accountId: 'conta-1',
      providerId: 'codex',
      text: 'o limite de caracteres da mensagem é 4000',
    }),
    null,
  )
})

test('delega à taxonomia: 429 solto não é limite e perda de login tem prazo', () => {
  const now = Date.parse('2026-09-28T12:00:00.000Z')

  assert.equal(
    detectAccountLimitIssue({ accountId: 'conta-1', providerId: 'codex', text: 'Error: failed to parse line 429', now: () => now }),
    null,
  )

  const auth = detectAccountLimitIssue({
    accountId: 'conta-1',
    providerId: 'codex',
    text: 'Error: Unauthorized (401) — please login again',
    now: () => now,
  })
  assert.equal(auth.status, 'no_login')
  assert.equal(auth.expiresAt, now + 30 * 60 * 1000)

  const model = detectAccountLimitIssue({
    accountId: 'conta-1',
    providerId: 'codex',
    text: 'You’ve hit your usage limit for gpt-5.5-codex. Switch to another model now.',
    now: () => now,
  })
  assert.equal(model.scope, 'model', 'limite de um modelo não é limite da conta')
})
