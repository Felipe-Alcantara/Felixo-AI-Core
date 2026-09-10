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
  assert.equal(result.syncStatus, 'stale')
  assert.deepEqual(result.tasks, [task])
  assert.equal(cache.error, 'Sem internet')
})

test('listTasks sinaliza syncStatus:success quando a rede responde', async () => {
  const cache = fakeCache({ tasks: [], schema: {}, fetchedAt: null })
  const service = createNotionService({
    connectionStore: fakeStore(),
    cacheRepository: cache,
    clientFactory: () => ({
      resolveDataSource: async () => ({ id: 'source-1', properties: {} }),
      queryTasks: async () => ({ tasks: [{ id: 'page-1', title: 'Nova', completed: false, fields: {} }], nextCursor: null }),
    }),
    now: () => '2026-09-09T10:00:00.000Z',
  })

  const result = await service.listTasks({ connectionId: 'connection-1', dataSourceId: 'source-1' })
  assert.equal(result.syncStatus, 'success')
  assert.equal(result.stale, false)
})

test('getCachedTasks lê o snapshot local sem tocar a rede, e sinaliza stale quando há dado', async () => {
  const task = { id: 'page-1', title: 'Offline', completed: false, fields: {} }
  const cache = fakeCache({ tasks: [task], schema: { Name: { type: 'title' } }, fetchedAt: '2026-09-08T12:00:00.000Z' })
  let clientBuilt = false
  const service = createNotionService({
    connectionStore: fakeStore(),
    cacheRepository: cache,
    clientFactory: () => {
      clientBuilt = true
      throw new Error('getCachedTasks não deveria construir um client de rede')
    },
  })

  const result = service.getCachedTasks({ connectionId: 'connection-1', dataSourceId: 'source-1' })
  assert.equal(clientBuilt, false)
  assert.equal(result.hasCache, true)
  assert.equal(result.syncStatus, 'stale')
  assert.deepEqual(result.tasks, [task])
  assert.equal(result.fetchedAt, '2026-09-08T12:00:00.000Z')
})

test('getCachedTasks sinaliza empty quando não há snapshot salvo', () => {
  const cache = fakeCache({ tasks: [], schema: {}, fetchedAt: null })
  const service = createNotionService({
    connectionStore: fakeStore(),
    cacheRepository: cache,
    clientFactory: () => ({}),
  })

  const result = service.getCachedTasks({ connectionId: 'connection-1', dataSourceId: 'source-1' })
  assert.equal(result.hasCache, false)
  assert.equal(result.syncStatus, 'empty')
  assert.deepEqual(result.tasks, [])
})

test('getCachedTasks aplica o mesmo filtro de busca/status que listTasks', () => {
  const tasks = [
    { id: 'a', title: 'Abrir', completed: false, status: 'To Do', fields: {} },
    { id: 'b', title: 'Fechar', completed: true, status: 'Done', fields: {} },
  ]
  const cache = fakeCache({ tasks, schema: {}, fetchedAt: '2026-09-08T12:00:00.000Z' })
  const service = createNotionService({
    connectionStore: fakeStore(),
    cacheRepository: cache,
    clientFactory: () => ({}),
  })

  const result = service.getCachedTasks({ connectionId: 'connection-1', dataSourceId: 'source-1', status: 'done' })
  assert.deepEqual(result.tasks, [tasks[1]])
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

test('serviço carrega o conteúdo do corpo de uma tarefa', async () => {
  const service = createNotionService({
    connectionStore: fakeStore(),
    cacheRepository: fakeCache({ tasks: [], schema: {}, fetchedAt: null }),
    clientFactory: () => ({
      getPageContent: async (pageId) => {
        assert.equal(pageId, 'page-1')
        return '## Conteúdo da nota'
      },
    }),
  })

  const result = await service.getTaskContent({ connectionId: 'connection-1', pageId: 'page-1' })

  assert.deepEqual(result, { pageId: 'page-1', content: '## Conteúdo da nota' })
})

test('updateTask aplica a mudança direto quando não há expectedUpdatedAt (compatibilidade)', async () => {
  const cache = fakeCache({ tasks: [], schema: {}, fetchedAt: null })
  let updateCalled = false
  const service = createNotionService({
    connectionStore: fakeStore(),
    cacheRepository: cache,
    clientFactory: () => ({
      resolveDataSource: async () => ({ id: 'source-1', properties: {} }),
      getTask: async () => { throw new Error('getTask não deveria ser chamado sem expectedUpdatedAt') },
      updateTask: async () => {
        updateCalled = true
        return { id: 'page-1', title: 'Editada', completed: false, fields: {}, updatedAt: '2026-09-10T10:00:00.000Z' }
      },
    }),
    now: () => '2026-09-10T10:00:01.000Z',
  })

  const result = await service.updateTask({
    connectionId: 'connection-1',
    dataSourceId: 'source-1',
    pageId: 'page-1',
    changes: { title: 'Editada' },
  })

  assert.equal(updateCalled, true)
  assert.equal(result.conflict, false)
  assert.equal(result.task.title, 'Editada')
})

test('updateTask aplica a mudança quando expectedUpdatedAt bate com a versão remota', async () => {
  const cache = fakeCache({ tasks: [], schema: {}, fetchedAt: null })
  let updateCalled = false
  const service = createNotionService({
    connectionStore: fakeStore(),
    cacheRepository: cache,
    clientFactory: () => ({
      resolveDataSource: async () => ({ id: 'source-1', properties: {} }),
      getTask: async () => ({ id: 'page-1', title: 'Antiga', completed: false, fields: {}, updatedAt: '2026-09-10T10:00:00.000Z' }),
      updateTask: async () => {
        updateCalled = true
        return { id: 'page-1', title: 'Editada', completed: false, fields: {}, updatedAt: '2026-09-10T10:05:00.000Z' }
      },
    }),
    now: () => '2026-09-10T10:05:01.000Z',
  })

  const result = await service.updateTask({
    connectionId: 'connection-1',
    dataSourceId: 'source-1',
    pageId: 'page-1',
    changes: { title: 'Editada' },
    expectedUpdatedAt: '2026-09-10T10:00:00.000Z',
  })

  assert.equal(updateCalled, true)
  assert.equal(result.conflict, false)
  assert.equal(result.task.title, 'Editada')
})

test('updateTask rejeita com segurança quando a versão remota mudou — nunca sobrescreve', async () => {
  const cache = fakeCache({ tasks: [], schema: {}, fetchedAt: null })
  let updateCalled = false
  const remoteTaskAgora = { id: 'page-1', title: 'Mudada por outra pessoa', completed: true, fields: {}, updatedAt: '2026-09-10T10:03:00.000Z' }
  const service = createNotionService({
    connectionStore: fakeStore(),
    cacheRepository: cache,
    clientFactory: () => ({
      resolveDataSource: async () => ({ id: 'source-1', properties: {} }),
      getTask: async () => remoteTaskAgora,
      updateTask: async () => {
        updateCalled = true
        throw new Error('updateTask não deveria ser chamado em conflito')
      },
    }),
    now: () => '2026-09-10T10:05:01.000Z',
  })

  const result = await service.updateTask({
    connectionId: 'connection-1',
    dataSourceId: 'source-1',
    pageId: 'page-1',
    changes: { title: 'Minha edição' },
    expectedUpdatedAt: '2026-09-10T10:00:00.000Z',
  })

  assert.equal(updateCalled, false)
  assert.equal(result.conflict, true)
  assert.deepEqual(result.task, remoteTaskAgora)
  assert.match(result.message, /alterada no Notion/)
  // O cache foi atualizado com a versão remota real, pra não repetir o
  // mesmo falso conflito numa segunda tentativa.
  assert.deepEqual(cache.readSnapshot().tasks, [remoteTaskAgora])
})

test('removeConnection limpa o cache da conexão quando a remoção acontece de verdade', async () => {
  const cache = fakeCache({ tasks: [], schema: {}, fetchedAt: null })
  const clearedConnections = []
  cache.clearConnection = ({ connectionId }) => clearedConnections.push(connectionId)
  const service = createNotionService({
    connectionStore: { ...fakeStore(), remove: () => true },
    cacheRepository: cache,
    clientFactory: () => ({}),
  })

  const result = service.removeConnection('connection-1')

  assert.equal(result.removed, true)
  assert.deepEqual(clearedConnections, ['connection-1'])
})

test('removeConnection não toca o cache quando não havia nada pra remover', async () => {
  const cache = fakeCache({ tasks: [], schema: {}, fetchedAt: null })
  const clearedConnections = []
  cache.clearConnection = ({ connectionId }) => clearedConnections.push(connectionId)
  const service = createNotionService({
    connectionStore: { ...fakeStore(), remove: () => false },
    cacheRepository: cache,
    clientFactory: () => ({}),
  })

  const result = service.removeConnection('connection-inexistente')

  assert.equal(result.removed, false)
  assert.deepEqual(clearedConnections, [])
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
    upsertTask({ task }) {
      const rest = snapshot.tasks.filter((existing) => existing.id !== task.id)
      snapshot = { ...snapshot, tasks: [...rest, task] }
      return snapshot
    },
    deleteTask() {},
    clearConnection() {},
  }
}
