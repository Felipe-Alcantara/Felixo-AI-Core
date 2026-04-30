const test = require('node:test')
const assert = require('node:assert/strict')
const events = require('./agent-events.cjs')

test('textDelta creates a text_delta event', () => {
  assert.deepEqual(events.textDelta('hello'), {
    type: 'text_delta',
    text: 'hello',
  })
})

test('toolCall creates a tool_call event', () => {
  assert.deepEqual(events.toolCall('read_file', { path: '/a' }), {
    type: 'tool_call',
    tool: 'read_file',
    input: { path: '/a' },
  })
})

test('session creates a session event', () => {
  assert.deepEqual(events.session('abc-123'), {
    type: 'session',
    providerSessionId: 'abc-123',
  })
})

test('status creates a status event', () => {
  assert.deepEqual(events.status('Iniciando'), {
    type: 'status',
    message: 'Iniciando',
  })
})

test('done creates a done event with optional fields', () => {
  assert.deepEqual(events.done(), { type: 'done' })

  assert.deepEqual(events.done({ cost: 0.01, duration: 500, providerSessionId: 'x' }), {
    type: 'done',
    cost: 0.01,
    duration: 500,
    providerSessionId: 'x',
  })
})

test('error creates an error event', () => {
  assert.deepEqual(events.error('falhou'), {
    type: 'error',
    message: 'falhou',
  })
})
