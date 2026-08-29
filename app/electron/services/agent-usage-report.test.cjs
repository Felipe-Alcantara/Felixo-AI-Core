'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  parseAgentAuth,
  parseAgentUsage,
} = require('./agent-usage-report.cjs')

test('agent usage report parses Claude rate limits and preserves zero', () => {
  const result = parseAgentUsage(
    'claude',
    JSON.stringify({
      rate_limits: {
        five_hour: {
          used_percentage: 0,
          resets_at: 1_800_000_000,
        },
        seven_day: {
          used_percentage: 42.5,
          resets_at: '2026-09-01T12:00:00.000Z',
        },
      },
    }),
  )

  assert.deepEqual(
    result.metrics.map(({ key, used, limit, remaining, unit, resetAt }) => ({
      key,
      used,
      limit,
      remaining,
      unit,
      resetAt,
    })),
    [
      {
        key: 'rate_limits.five_hour',
        used: 0,
        limit: 100,
        remaining: 100,
        unit: '%',
        resetAt: '2027-01-15T08:00:00.000Z',
      },
      {
        key: 'rate_limits.seven_day',
        used: 42.5,
        limit: 100,
        remaining: 57.5,
        unit: '%',
        resetAt: '2026-09-01T12:00:00.000Z',
      },
    ],
  )
})

test('agent usage report parses generic quota fields only in quota paths', () => {
  const result = parseAgentUsage(
    'gemini',
    JSON.stringify({
      quota: {
        requests: { used: 3, limit: 10, remaining: 7, unit: 'requests' },
      },
      unrelated: { current: 99, max: 100 },
    }),
  )

  assert.deepEqual(result.metrics, [
    {
      key: 'quota.requests',
      label: 'Requests',
      used: 3,
      limit: 10,
      remaining: 7,
      unit: 'requests',
      precision: 'exact',
      resetAt: null,
    },
  ])
})

test('agent auth report shows the identity in full, with a stable fingerprint', () => {
  const result = parseAgentAuth(
    'claude',
    JSON.stringify({
      loggedIn: true,
      authMethod: 'claude.ai',
      email: 'alice@example.com',
      subscriptionType: 'pro',
    }),
  )

  assert.equal(result.authStatus, 'logged_in')
  assert.equal(result.account, 'alice@example.com')
  // Inteiro na tela: com duas contas do mesmo domínio, a forma abreviada saía
  // igual para as duas e não dizia qual linha era qual.
  assert.equal(result.identityDisplay, 'alice@example.com')
  assert.match(result.identityKey, /^[a-f0-9]{64}$/)
})

test('a mesma conta continua com o mesmo fingerprint, ainda que escrita diferente', () => {
  const primeira = parseAgentAuth(
    'claude',
    JSON.stringify({ loggedIn: true, email: 'Alice@Example.com ' }),
  )
  const segunda = parseAgentAuth(
    'claude',
    JSON.stringify({ loggedIn: true, email: 'alice@example.com' }),
  )

  assert.equal(primeira.identityKey, segunda.identityKey)
})

test('contas diferentes no mesmo domínio ficam distinguíveis na tela', () => {
  const uma = parseAgentAuth(
    'claude',
    JSON.stringify({ loggedIn: true, email: 'felipe.pessoal@gmail.com' }),
  )
  const outra = parseAgentAuth(
    'claude',
    JSON.stringify({ loggedIn: true, email: 'felipe.trabalho@gmail.com' }),
  )

  assert.notEqual(uma.identityDisplay, outra.identityDisplay)
  assert.notEqual(uma.identityKey, outra.identityKey)
})

test('agent auth report never turns a redacted Openia key into an account identity', () => {
  const result = parseAgentAuth(
    'openia',
    JSON.stringify({ configured: true, active: 'sk-live-secret-value' }),
  )

  assert.equal(result.authStatus, 'logged_in')
  assert.equal(result.account, '[oculto]')
  assert.equal(result.identityKey, null)
  assert.equal(result.identityDisplay, null)
  assert.doesNotMatch(JSON.stringify(result), /sk-live-secret-value/)
})

test('agent usage report lê o saldo publicado pelo openia statusline', () => {
  const result = parseAgentUsage(
    'openia',
    'OpenRouter  usado $0.4210  ·  resta $4.58  (de $5.00)',
  )

  assert.deepEqual(result.metrics, [
    {
      key: 'credits',
      label: 'Créditos da conta',
      used: 0.421,
      limit: 5,
      remaining: 4.58,
      unit: 'US$',
      precision: 'reported',
      resetAt: null,
    },
  ])
})

test('agent usage report não inventa saldo quando o openia não tem chave', () => {
  // As duas respostas curtas do launcher quando ele não consegue consultar.
  assert.deepEqual(parseAgentUsage('openia', 'openia: sem chave').metrics, [])
  assert.deepEqual(
    parseAgentUsage('openia', 'openia: uso indisponível').metrics,
    [],
  )
})

test('agent usage report aceita saldo zerado do openia como zero', () => {
  const [metric] = parseAgentUsage(
    'openia',
    'OpenRouter  usado $0.0000  ·  resta $0.00  (de $0.00)',
  ).metrics

  assert.equal(metric.used, 0)
  assert.equal(metric.remaining, 0)
  assert.equal(metric.limit, 0)
})
