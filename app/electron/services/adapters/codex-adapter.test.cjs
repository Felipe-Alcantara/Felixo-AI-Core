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

test('codex adapter resumes when provider session id is known', () => {
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
