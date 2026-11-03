'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { getRateLimitDetails, parseRetryAfterMs } = require('./agent-usage-backoff.cjs')

test('Retry-After supports durations, JSON keys and HTTP dates', () => {
  assert.equal(parseRetryAfterMs('retry-after: 8m'), 8 * 60_000)
  assert.equal(parseRetryAfterMs('{"retry_after": 12}'), 12_000)
  assert.equal(
    parseRetryAfterMs(
      'Retry-After: Wed, 21 Oct 2026 07:28:00 GMT',
      Date.parse('Wed, 21 Oct 2026 07:20:00 GMT'),
    ),
    8 * 60_000,
  )
})

test('rate limit parsing returns structured signals without retaining source text', () => {
  const details = getRateLimitDetails(
    'HTTP 429: retry-after: 24m; token=secret-value',
  )

  assert.deepEqual(details, {
    rateLimited: true,
    retryAfterMs: 24 * 60_000,
  })
  assert.equal(JSON.stringify(details).includes('secret-value'), false)
  assert.deepEqual(getRateLimitDetails('temporary network failure'), {
    rateLimited: false,
  })
})
