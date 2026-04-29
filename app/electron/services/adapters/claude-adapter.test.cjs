const test = require('node:test')
const assert = require('node:assert/strict')
const adapter = require('./claude-adapter.cjs')

test('claude adapter parses text deltas', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        delta: {
          type: 'text_delta',
          text: 'Hello',
        },
      },
    }),
  )

  assert.deepEqual(event, {
    type: 'text',
    text: 'Hello',
  })
})

test('claude adapter parses result metadata', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'result',
      total_cost_usd: 0.01,
      duration_ms: 1200,
    }),
  )

  assert.deepEqual(event, {
    type: 'done',
    cost: 0.01,
    duration: 1200,
  })
})
