const test = require('node:test')
const assert = require('node:assert/strict')
const adapter = require('./codex-adapter.cjs')

test('codex adapter parses completed agent messages', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'item.completed',
      item: {
        type: 'agent_message',
        text: 'Hello',
      },
    }),
  )

  assert.deepEqual(event, {
    type: 'text',
    text: 'Hello',
  })
})

test('codex adapter passes ascii cwd with exec args', () => {
  const spawnArgs = adapter.getSpawnArgs('Oi', { cwd: '/home/felipe' })

  assert.equal(spawnArgs.command, 'codex')
  assert.deepEqual(spawnArgs.args, [
    'exec',
    '--json',
    '--skip-git-repo-check',
    '--cd',
    '/home/felipe',
    'Oi',
  ])
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
    '--model',
    'gpt-5.5',
    '--config',
    'model_reasoning_effort="xhigh"',
    'Oi',
  ])
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
    '019ddc27-bc3d-7280-b5c0-61dff03b08cd',
    'Continua',
  ])
})

test('codex adapter only enables native resume after provider session capture', () => {
  assert.equal(
    adapter.canResume({
      providerSessionId: '019ddc27-bc3d-7280-b5c0-61dff03b08cd',
    }),
    true,
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
