'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const { createAccountDescriber, createChainPolicyPort } = require('./account-chain-port.cjs')

const NOW_MS = Date.parse('2026-09-28T12:00:00.000Z')
const CHECKED_AT = new Date(NOW_MS - 60 * 1000).toISOString()

function repositoryWith({ members, checks }) {
  return {
    listMembers: () => members,
    getLoginCheck: (accountId) => checks[accountId] ?? null,
  }
}

function loggedIn(identityKey) {
  return { status: 'logged_in', checkedAt: CHECKED_AT, identityStatus: 'matched', identityKey }
}

test('a porta traduz o formato do serviço para a política pura e exclui a identidade repetida mais abaixo', () => {
  const members = [
    { accountId: 'a', providerId: 'codex', position: 0, enabled: true },
    { accountId: 'b', providerId: 'codex', position: 1, enabled: true },
    { accountId: 'c', providerId: 'codex', position: 2, enabled: true },
  ]
  const checks = { a: loggedIn('id-1'), b: loggedIn('id-2'), c: loggedIn('id-2') }
  const port = createChainPolicyPort({ repository: repositoryWith({ members, checks }) })
  const evaluate = (member, sourceAccountId = null) =>
    port.evaluateEligibility({
      nowMs: NOW_MS,
      settings: { enabled: true },
      member,
      account: { accountStatus: 'ok', measurement: null },
      cooldown: null,
      loginCheck: checks[member.accountId],
      sourceAccountId,
      visitedAccountIds: [],
    })

  assert.deepEqual(evaluate(members[1]), { eligible: true, reason: null, reasonText: null })
  // C tem a mesma identidade de B, mais acima: é a mesma conta real.
  assert.equal(evaluate(members[2]).reason, 'identidade-duplicada')
  // Da origem A, B continua apta; a própria origem sai por "origem".
  assert.equal(evaluate(members[0], 'a').reason, 'origem')
  assert.equal(evaluate({ ...members[1] }, 'a').eligible, true)
  // Conta removida (sem fatos) nunca é apta.
  assert.equal(
    port.evaluateEligibility({ nowMs: NOW_MS, settings: { enabled: true }, member: members[1], account: null, loginCheck: checks.b }).reason,
    'conta-removida',
  )
})

test('a porta ordena pela estratégia com capacidade e cobrança calculadas pela política', () => {
  const members = [
    { accountId: 'a', providerId: 'codex', position: 0, enabled: true, billingDeclared: 'uso' },
    { accountId: 'b', providerId: 'codex', position: 1, enabled: true, billingDeclared: 'assinatura' },
  ]
  const port = createChainPolicyPort({ repository: repositoryWith({ members, checks: {} }) })
  const ranked = port.rankCandidates({
    strategy: 'subscription_first',
    candidates: members.map((member) => ({ accountId: member.accountId, position: member.position, member, account: null, loginCheck: null })),
    lastDestinationAccountId: null,
    nowMs: NOW_MS,
  })
  assert.deepEqual(ranked.map((item) => item.accountId), ['b', 'a'])
  assert.equal(ranked[0].explanation, 'assinatura primeiro')

  const until = port.resolveCooldownEnd({ providerId: 'codex', failureClass: 'limit', evidence: null, measurement: null, nowMs: NOW_MS })
  assert.equal(until.untilSource, 'padrao')
  assert.ok(Date.parse(until.untilAt) > NOW_MS)
})

test('os fatos da conta dizem só status, rótulo e amostra; Openia sem chave fica sem chave', () => {
  const describe = createAccountDescriber({
    listAccounts: () => [
      { id: 'x', providerId: 'openia', label: 'Créditos', secretConfigured: false },
      { id: 'y', providerId: 'codex', label: 'Pessoal' },
    ],
    getLatestSample: (accountId) => (accountId === 'y' ? { status: 'current' } : null),
  })
  assert.equal(describe('x').accountStatus, 'missing_key')
  assert.deepEqual(describe('y'), { accountId: 'y', providerId: 'codex', label: 'Pessoal', accountStatus: 'ok', measurement: { status: 'current' } })
  assert.equal(describe('z'), null)
})
