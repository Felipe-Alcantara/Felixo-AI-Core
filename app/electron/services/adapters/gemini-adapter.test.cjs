const test = require('node:test')
const assert = require('node:assert/strict')
const adapter = require('./gemini-adapter.cjs')

test('gemini adapter skips workspace trust prompt', () => {
  const spawnArgs = adapter.getSpawnArgs('Oi')

  assert.equal(spawnArgs.command, 'gemini')
  assert.deepEqual(spawnArgs.args, [
    '--prompt',
    'Oi',
    '--output-format',
    'stream-json',
    '--skip-trust',
  ])
})

test('gemini adapter parses model messages', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'message',
      role: 'model',
      content: 'Hello',
    }),
  )

  assert.deepEqual(event, {
    type: 'text',
    text: 'Hello',
  })
})

test('gemini adapter parses assistant delta messages', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'message',
      role: 'assistant',
      content: 'Olá',
      delta: true,
    }),
  )

  assert.deepEqual(event, {
    type: 'text',
    text: 'Olá',
  })
})

test('gemini adapter parses result as done', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'result',
    }),
  )

  assert.deepEqual(event, {
    type: 'done',
  })
})
