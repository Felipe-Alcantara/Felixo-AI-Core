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

test('claude adapter passes provider model and effort when configured', () => {
  const spawnArgs = adapter.getSpawnArgs('Oi', {
    model: {
      providerModel: 'claude-sonnet-4-5',
      reasoningEffort: 'high',
    },
    threadId: '00000000-0000-4000-8000-000000000001',
  })

  assert.equal(spawnArgs.command, 'claude')
  assert.deepEqual(spawnArgs.args, [
    '--print',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--model',
    'claude-sonnet-4-5',
    '--effort',
    'high',
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

test('claude adapter starts a persistent stream-json process without pinning session id', () => {
  const spawnArgs = adapter.getPersistentSpawnArgs({
    threadId: '00000000-0000-4000-8000-000000000001',
  })

  assert.equal(spawnArgs.command, 'claude')
  assert.deepEqual(spawnArgs.args, [
    '--print',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
  ])
})

test('claude adapter resumes a persistent process when providerSessionId is set', () => {
  const spawnArgs = adapter.getPersistentSpawnArgs({
    threadId: '00000000-0000-4000-8000-000000000001',
    providerSessionId: '00000000-0000-4000-8000-000000000002',
  })

  assert.equal(spawnArgs.command, 'claude')
  assert.deepEqual(spawnArgs.args, [
    '--print',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--resume',
    '00000000-0000-4000-8000-000000000002',
  ])
})

test('claude adapter serializes persistent stdin messages', () => {
  const input = adapter.createPersistentInput('Oi')
  const payload = JSON.parse(input.trim())

  assert.deepEqual(payload, {
    type: 'user',
    message: {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Oi',
        },
      ],
    },
  })
  assert.equal(input.endsWith('\n'), true)
})

test('claude adapter can resume from provider or pinned thread session id', () => {
  assert.equal(
    adapter.canResume({
      providerSessionId: '00000000-0000-4000-8000-000000000001',
    }),
    true,
  )
  assert.equal(
    adapter.canResume({
      threadId: '00000000-0000-4000-8000-000000000002',
    }),
    true,
  )
  assert.equal(adapter.canResume({}), false)
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

test('claude adapter parses orchestration spawn_agent events', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'spawn_agent',
      agentId: 'reviewer-1',
      cliType: 'codex',
      prompt: 'Revise as alteracoes.',
    }),
  )

  assert.deepEqual(event, {
    type: 'spawn_agent',
    agentId: 'reviewer-1',
    cliType: 'codex',
    prompt: 'Revise as alteracoes.',
  })
})

test('claude adapter parses orchestration awaiting_agents events', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'awaiting_agents',
      agentIds: ['reviewer-1', 'researcher-2'],
    }),
  )

  assert.deepEqual(event, {
    type: 'awaiting_agents',
    agentIds: ['reviewer-1', 'researcher-2'],
  })
})

test('claude adapter parses orchestration final_answer events', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'final_answer',
      content: 'Fluxo concluido.',
    }),
  )

  assert.deepEqual(event, {
    type: 'final_answer',
    content: 'Fluxo concluido.',
  })
})

test('claude adapter parses orchestration events embedded as assistant JSON text', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        delta: {
          type: 'text_delta',
          text: '{"type":"final_answer","content":"Fluxo concluido."}',
        },
      },
    }),
  )

  assert.deepEqual(event, {
    type: 'final_answer',
    content: 'Fluxo concluido.',
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

test('claude adapter ignores non-init system status as session metadata', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'system',
      subtype: 'status',
      status: 'requesting',
      session_id: '00000000-0000-4000-8000-000000000001',
    }),
  )

  assert.equal(event, null)
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

test('claude adapter parses assistant rate-limit payload as error', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'assistant',
      error: 'rate_limit',
      message: {
        content: [
          {
            type: 'text',
            text: "You're out of extra usage · resets 1:20pm (America/Sao_Paulo)",
          },
        ],
      },
      session_id: '00000000-0000-4000-8000-000000000001',
    }),
  )

  assert.deepEqual(event, {
    type: 'error',
    message: "You're out of extra usage · resets 1:20pm (America/Sao_Paulo)",
  })
})

test('claude adapter parses error result metadata as error', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: true,
      api_error_status: 429,
      result: "You're out of extra usage · resets 1:20pm (America/Sao_Paulo)",
      session_id: '00000000-0000-4000-8000-000000000001',
    }),
  )

  assert.deepEqual(event, {
    type: 'error',
    message: "You're out of extra usage · resets 1:20pm (America/Sao_Paulo)",
    providerSessionId: '00000000-0000-4000-8000-000000000001',
  })
})
