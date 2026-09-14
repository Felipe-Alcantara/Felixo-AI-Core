const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createQaLogStore,
  initQaDiskStore,
  logQaEvent,
  __setMainWindowGetterForTests,
  __setDiskStoreForTests,
  __sendQaLoggerEventForTests,
} = require('./qa-logger.cjs')

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

test('sendQaLoggerEvent is a no-op when there is no main window', () => {
  __setMainWindowGetterForTests(() => null)
  assert.doesNotThrow(() => __sendQaLoggerEventForTests('qa-logger:entry', {}))
})

test('sendQaLoggerEvent is a no-op when the window has been destroyed', () => {
  __setMainWindowGetterForTests(() => ({
    isDestroyed: () => true,
    get webContents() {
      throw new Error('webContents must not be accessed on a destroyed window')
    },
  }))
  assert.doesNotThrow(() => __sendQaLoggerEventForTests('qa-logger:entry', {}))
})

test('sendQaLoggerEvent is a no-op when webContents has been destroyed', () => {
  __setMainWindowGetterForTests(() => ({
    isDestroyed: () => false,
    webContents: { isDestroyed: () => true, send: () => assert.fail('send must not be called') },
  }))
  assert.doesNotThrow(() => __sendQaLoggerEventForTests('qa-logger:entry', {}))
})

test('sendQaLoggerEvent forwards to webContents.send when the window is alive', () => {
  let sent = null
  __setMainWindowGetterForTests(() => ({
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: (channel, payload) => {
        sent = { channel, payload }
      },
    },
  }))
  __sendQaLoggerEventForTests('qa-logger:entry', { message: 'hi' })
  assert.deepEqual(sent, { channel: 'qa-logger:entry', payload: { message: 'hi' } })
})

test('createQaLogStore().hydrate repõe o buffer e continua o contador de id a partir do maior existente', () => {
  const store = createQaLogStore(10)
  store.hydrate([
    { id: 5, createdAt: '2026-09-14T10:00:00.000Z', level: 'info', scope: 'x', message: 'a' },
    { id: 7, createdAt: '2026-09-14T10:00:01.000Z', level: 'warn', scope: 'x', message: 'b' },
  ])

  assert.deepEqual(store.getEntries().map((entry) => entry.id), [5, 7])

  const next = store.append({ level: 'info', scope: 'x', message: 'c' })
  assert.equal(next.id, 8)
})

test('createQaLogStore().hydrate respeita o teto de entradas (mantém as mais recentes)', () => {
  const store = createQaLogStore(2)
  store.hydrate([
    { id: 1, message: 'um' },
    { id: 2, message: 'dois' },
    { id: 3, message: 'tres' },
  ])
  assert.deepEqual(store.getEntries().map((entry) => entry.message), ['dois', 'tres'])
})

test('createQaLogStore().hydrate com lista vazia não mexe no buffer nem no contador', () => {
  const store = createQaLogStore(10)
  store.append({ message: 'já estava aqui' })
  store.hydrate([])
  assert.equal(store.getEntries().length, 1)
})

test('initQaDiskStore hidrata o singleton a partir do que o disco devolve e faz a limpeza (prune)', async () => {
  let pruned = false
  const fakeStore = {
    loadRecent: async () => [{ id: 1, createdAt: '2026-09-14T10:00:00.000Z', level: 'info', scope: 'x', message: 'do-disco' }],
    prune: async () => { pruned = true },
    append: async () => {},
  }

  await initQaDiskStore(fakeStore)

  assert.equal(pruned, true)
  __setDiskStoreForTests(null)
})

test('logQaEvent envia a entrada pro disk store depois de anexar em memória', async () => {
  const appended = []
  __setDiskStoreForTests({ append: async (entry) => { appended.push(entry) } })
  __setMainWindowGetterForTests(() => null)

  const entry = logQaEvent({ level: 'error', scope: 'test', message: 'falhou' })
  // append no disco é fire-and-forget — dá um giro no microtask queue antes de conferir.
  await Promise.resolve()

  assert.equal(appended.length, 1)
  assert.equal(appended[0].message, 'falhou')
  assert.equal(appended[0].id, entry.id)
  __setDiskStoreForTests(null)
})

test('logQaEvent não lança quando o disk store falha (best-effort)', async () => {
  __setDiskStoreForTests({ append: async () => { throw new Error('disco cheio') } })
  __setMainWindowGetterForTests(() => null)

  assert.doesNotThrow(() => logQaEvent({ level: 'error', scope: 'test', message: 'x' }))
  await Promise.resolve()
  __setDiskStoreForTests(null)
})
