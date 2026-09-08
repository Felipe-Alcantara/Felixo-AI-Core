const test = require('node:test')
const assert = require('node:assert/strict')

const { createNotionService, filterTasks, normalizeSchema } = require('./notion-service.cjs')

test('serviço Notion devolve cache quando a sincronização falha e sinaliza stale', async () => {
  const task = { id: 'page-1', title: 'Offline', completed: false, fields: {} }
  const cache = fakeCache({ tasks: [task], schema: { Name: { type: 'title' } }, fetchedAt: '2026-09-08T12:00:00.000Z' })
  const service = createNotionService({
    connectionStore: fakeStore(),
    cacheRepository: cache,
    clientFactory: () => ({
      resolveDataSource: async () => { throw new Error('Sem internet') },
    }),
    now: () => '2026-09-08T12:01:00.000Z',
  })

  const result = await service.listTasks({ connectionId: 'connection-1', dataSourceId: 'source-1' })
  assert.equal(result.stale, true)
  assert.equal(result.fromCache, true)
  assert.deepEqual(result.tasks, [task])
  assert.equal(cache.error, 'Sem internet')
})

test('serviço normaliza esquema e filtra tarefas sem expor credencial', () => {
  const schema = normalizeSchema({
    Name: { id: 'title', type: 'title' },
    Status: { id: 'status', type: 'status', status: { options: [] } },
  })
  assert.equal(schema.Name.name, 'Name')
  assert.equal(schema.Status.type, 'status')

  const tasks = [
    { title: 'Abrir', completed: false, status: 'To Do', fields: {} },
    { title: 'Fechar', completed: true, status: 'Done', fields: {} },
  ]
  assert.deepEqual(filterTasks(tasks, { status: 'open' }), [tasks[0]])
  assert.deepEqual(filterTasks(tasks, { status: 'done' }), [tasks[1]])
  assert.deepEqual(filterTasks(tasks, { search: 'fechar' }), [tasks[1]])
})

test('serviço preserva o vínculo da fonte de dados com o database pai', async () => {
  const service = createNotionService({
    connectionStore: fakeStore(),
    cacheRepository: fakeCache({ tasks: [], schema: {}, fetchedAt: null }),
    clientFactory: () => ({
      listAccessibleDataSources: async () => [
        { id: 'source-1', name: 'Backlog', databaseId: 'database-1', url: null, lastEditedAt: null },
      ],
    }),
  })

  const result = await service.listDatabases({ connectionId: 'connection-1' })
  assert.equal(result.databases[0].databaseId, 'database-1')
})

function fakeStore() {
  return {
    canStoreSecret: () => ({ ok: true, reason: null }),
    getCredential: () => ({ connection: { id: 'connection-1' }, token: 'secret' }),
    list: () => [],
    markTested: () => null,
    remove: () => false,
    save: () => null,
  }
}

function fakeCache(initial) {
  let snapshot = { ...initial, nextCursor: null, lastSuccessAt: initial.fetchedAt, status: 'success', lastError: null, updatedAt: initial.fetchedAt }
  return {
    get error() { return snapshot.lastError },
    markSyncError({ error }) { snapshot = { ...snapshot, status: 'error', lastError: error.message }; return snapshot },
    readSnapshot() { return snapshot },
    replaceSnapshot() { return snapshot },
    upsertTask() { return snapshot },
    deleteTask() {},
  }
}
