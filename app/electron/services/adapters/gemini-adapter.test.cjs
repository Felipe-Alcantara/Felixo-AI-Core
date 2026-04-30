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

test('gemini adapter resumes existing session when provider id is known', () => {
  const spawnArgs = adapter.getResumeArgs('Continua', {
    providerSessionId: '00000000-0000-4000-8000-000000000001',
  })

  assert.equal(spawnArgs.command, 'gemini')
  assert.deepEqual(spawnArgs.args, [
    '--resume',
    '00000000-0000-4000-8000-000000000001',
    '--prompt',
    'Continua',
    '--output-format',
    'stream-json',
    '--skip-trust',
  ])
})

test('gemini adapter parses init session metadata', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'init',
      session_id: '00000000-0000-4000-8000-000000000001',
      model: 'gemini-3-pro-preview',
    }),
  )

  assert.deepEqual(event, {
    type: 'session',
    providerSessionId: '00000000-0000-4000-8000-000000000001',
  })
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

test('gemini adapter classifies known non-fatal stderr notices', () => {
  const colorNotice =
    'Warning: 256-color support not detected. Using a terminal with at least 256-color support is recommended for a better visual experience.\n'
  const ripgrepNotice = 'Ripgrep is not available. Falling back to GrepTool.\n'

  assert.equal(adapter.classifyStderr(colorNotice), 'info')
  assert.equal(adapter.classifyStderr(ripgrepNotice), 'info')
  assert.equal(adapter.shouldSuppressStderr(colorNotice), true)
  assert.equal(adapter.shouldSuppressStderr(ripgrepNotice), false)
  assert.equal(adapter.classifyStderr(`${ripgrepNotice}real error\n`), 'warn')
})
