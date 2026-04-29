const test = require('node:test')
const assert = require('node:assert/strict')
const { createQaLogStore } = require('./qa-logger.cjs')

test('qa log store keeps a bounded log buffer', () => {
  const store = createQaLogStore(2)

  store.append({ level: 'info', scope: 'test', message: 'one' })
  store.append({ level: 'warn', scope: 'test', message: 'two' })
  store.append({ level: 'error', scope: 'test', message: 'three' })

  assert.deepEqual(
    store.getEntries().map((entry) => entry.message),
    ['two', 'three'],
  )
})

test('qa log store normalizes entries', () => {
  const store = createQaLogStore()
  const entry = store.append({
    level: 'invalid',
    scope: 'cli',
    sessionId: 'session-1',
    message: 'spawn',
    details: { pid: 123 },
  })

  assert.equal(entry.id, 1)
  assert.equal(entry.level, 'info')
  assert.equal(entry.scope, 'cli')
  assert.equal(entry.sessionId, 'session-1')
  assert.deepEqual(entry.details, { pid: 123 })
  assert.match(entry.createdAt, /^\d{4}-\d{2}-\d{2}T/)
})
