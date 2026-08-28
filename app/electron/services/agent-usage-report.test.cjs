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

test('agent auth report creates a masked stable identity', () => {
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
  assert.equal(result.identityDisplay, 'a***@example.com')
  assert.match(result.identityKey, /^[a-f0-9]{64}$/)
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
