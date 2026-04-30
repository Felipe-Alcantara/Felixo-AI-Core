const test = require('node:test')
const assert = require('node:assert/strict')
const adapter = require('./claude-adapter.cjs')

test('claude adapter pins first run to provided thread session id', () => {
  const spawnArgs = adapter.getSpawnArgs('Oi', {
    threadId: '00000000-0000-4000-8000-000000000001',
  })

  assert.equal(spawnArgs.command, 'claude')
  assert.deepEqual(spawnArgs.args, [
    '--print',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--session-id',
    '00000000-0000-4000-8000-000000000001',
    'Oi',
  ])
})

test('claude adapter resumes an existing provider session', () => {
  const spawnArgs = adapter.getResumeArgs('Continua', {
    providerSessionId: '00000000-0000-4000-8000-000000000001',
  })

  assert.equal(spawnArgs.command, 'claude')
  assert.deepEqual(spawnArgs.args, [
    '--print',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--resume',
    '00000000-0000-4000-8000-000000000001',
    'Continua',
  ])
})

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

test('claude adapter parses session metadata', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'system',
      subtype: 'init',
      session_id: '00000000-0000-4000-8000-000000000001',
    }),
  )

  assert.deepEqual(event, {
    type: 'session',
    providerSessionId: '00000000-0000-4000-8000-000000000001',
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
