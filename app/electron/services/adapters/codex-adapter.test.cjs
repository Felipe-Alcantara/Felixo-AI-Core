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
