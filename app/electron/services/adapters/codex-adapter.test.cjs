const test = require('node:test')
const assert = require('node:assert/strict')
const adapter = require('./codex-adapter.cjs')

test('codex adapter parses completed agent messages', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'item.completed',
      item: {
        id: 'item-1',
        type: 'agent_message',
        text: 'Hello',
      },
    }),
  )

  assert.deepEqual(event, {
    type: 'text',
    text: 'Hello',
    streamItemId: 'item-1',
  })
})

test('codex adapter parses orchestration spawn_agent events', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'spawn_agent',
      agentId: 'reviewer-1',
      cliType: 'claude',
      prompt: 'Revise as alteracoes.',
    }),
  )

  assert.deepEqual(event, {
    type: 'spawn_agent',
    agentId: 'reviewer-1',
    cliType: 'claude',
    prompt: 'Revise as alteracoes.',
  })
})

test('codex adapter parses orchestration awaiting_agents events', () => {
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

test('codex adapter parses orchestration final_answer events', () => {
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

test('codex adapter parses orchestration events embedded as assistant JSON text', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'item.completed',
      item: {
        type: 'agent_message',
        text: '{"type":"final_answer","content":"Fluxo concluido."}',
      },
    }),
  )

  assert.deepEqual(event, {
    type: 'final_answer',
    content: 'Fluxo concluido.',
  })
})

test('codex adapter parses batched orchestration events embedded as assistant JSONL text', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'item.completed',
      item: {
        type: 'agent_message',
        text: [
          '{"type":"spawn_agent","agentId":"gemini-1","cliType":"gemini","prompt":"Pergunte algo."}',
          '{"type":"awaiting_agents","agentIds":["gemini-1"]}',
        ].join('\n'),
      },
    }),
  )

  assert.deepEqual(event, {
    type: 'orchestration_events',
    events: [
      {
        type: 'spawn_agent',
        agentId: 'gemini-1',
        cliType: 'gemini',
        prompt: 'Pergunte algo.',
      },
      {
        type: 'awaiting_agents',
        agentIds: ['gemini-1'],
      },
    ],
  })
})

test('codex adapter passes ascii cwd with exec args', () => {
  const spawnArgs = adapter.getSpawnArgs('Oi', { cwd: '/tmp/test-cwd' })

  assert.equal(spawnArgs.command, 'codex')
  assert.deepEqual(spawnArgs.args, [
    'exec',
    '--json',
    '--skip-git-repo-check',
    '--ephemeral',
    '--dangerously-bypass-approvals-and-sandbox',
    '--cd',
    '/tmp/test-cwd',
    '-',
  ])
  assert.equal(spawnArgs.stdinInput, 'Oi')
})

test('codex adapter passes provider model and reasoning effort', () => {
  const spawnArgs = adapter.getSpawnArgs('Oi', {
    model: {
      providerModel: 'gpt-5.5',
      reasoningEffort: 'xhigh',
    },
  })

  assert.equal(spawnArgs.command, 'codex')
  assert.deepEqual(spawnArgs.args, [
    'exec',
    '--json',
    '--skip-git-repo-check',
    '--ephemeral',
    '--dangerously-bypass-approvals-and-sandbox',
    '--model',
    'gpt-5.5',
    '--config',
    'model_reasoning_effort="xhigh"',
    '-',
  ])
  assert.equal(spawnArgs.stdinInput, 'Oi')
})

test('codex adapter resumes an existing provider session', () => {
  const spawnArgs = adapter.getResumeArgs('Continua', {
    providerSessionId: '019ddc27-bc3d-7280-b5c0-61dff03b08cd',
  })

  assert.equal(spawnArgs.command, 'codex')
  assert.deepEqual(spawnArgs.args, [
    'exec',
    'resume',
    '--json',
    '--skip-git-repo-check',
    '--dangerously-bypass-approvals-and-sandbox',
    '019ddc27-bc3d-7280-b5c0-61dff03b08cd',
    '-',
  ])
  assert.equal(spawnArgs.stdinInput, 'Continua')
})

test('codex adapter allows disabling full access from environment', () => {
  const previousValue = process.env.FELIXO_CODEX_FULL_ACCESS
  process.env.FELIXO_CODEX_FULL_ACCESS = 'off'

  try {
    const spawnArgs = adapter.getSpawnArgs('Oi')

    assert.deepEqual(spawnArgs.args, [
      'exec',
      '--json',
      '--skip-git-repo-check',
      '--ephemeral',
      '-',
    ])
    assert.equal(spawnArgs.stdinInput, 'Oi')
  } finally {
    if (previousValue === undefined) {
      delete process.env.FELIXO_CODEX_FULL_ACCESS
    } else {
      process.env.FELIXO_CODEX_FULL_ACCESS = previousValue
    }
  }
})

test('codex adapter disables native resume for ephemeral exec sessions', () => {
  assert.equal(
    adapter.canResume({
      providerSessionId: '019ddc27-bc3d-7280-b5c0-61dff03b08cd',
    }),
    false,
  )
  assert.equal(
    adapter.canResume({
      threadId: 'local-thread-id',
    }),
    false,
  )
  assert.equal(adapter.canResume({}), false)
})

test('codex adapter parses session metadata', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'session_configured',
      thread_id: '019ddc27-bc3d-7280-b5c0-61dff03b08cd',
    }),
  )

  assert.deepEqual(event, {
    type: 'session',
    providerSessionId: '019ddc27-bc3d-7280-b5c0-61dff03b08cd',
  })
})

test('codex adapter classifies known non-fatal stderr noise', () => {
  const stdinNotice = 'Reading additional input from stdin...\n'
  const rolloutNotice =
    'ERROR codex_core::session: failed to record rollout items: thread 019ddc5a not found\n'

  assert.equal(adapter.classifyStderr(stdinNotice), 'debug')
  assert.equal(adapter.classifyStderr(rolloutNotice), 'debug')
  assert.equal(adapter.shouldSuppressStderr(stdinNotice), true)
  assert.equal(adapter.shouldSuppressStderr(rolloutNotice), true)
  assert.equal(adapter.shouldSuppressStderr(`${rolloutNotice}real error\n`), false)
})
