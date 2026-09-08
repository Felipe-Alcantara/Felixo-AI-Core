'use strict'

const { createNotionClient } = require('./notion-client.cjs')

function createNotionService({
  connectionStore,
  cacheRepository,
  clientFactory = createNotionClient,
  now = () => new Date().toISOString(),
} = {}) {
  if (!connectionStore || !cacheRepository) {
    throw new Error('createNotionService requer loja de conexoes e cache.')
  }

  function clientFor(connectionId) {
    const credential = connectionStore.getCredential(connectionId)
    if (!credential) throw new Error('A conexão Notion selecionada não existe mais.')
    if (!credential.token) {
      throw new Error('A conexão Notion não tem token configurado.')
    }
    return clientFactory({ token: credential.token })
  }

  function listConnections() {
    return {
      connections: connectionStore.list(),
      secureStorage: connectionStore.canStoreSecret(),
    }
  }

  function saveConnection(input) {
    return { connection: connectionStore.save(input) }
  }

  function removeConnection(connectionId) {
    return { removed: connectionStore.remove(connectionId) }
  }

  async function testConnection(connectionId) {
    const credential = connectionStore.getCredential(connectionId)
    if (!credential) throw new Error('A conexão Notion selecionada não existe mais.')
    if (!credential.token) throw new Error('A conexão Notion não tem token configurado.')

    const user = await clientFactory({ token: credential.token }).getCurrentUser()
    const connection = connectionStore.markTested(connectionId)
    return {
      connection,
      identity: typeof user?.name === 'string' && user.name.trim() ? user.name.trim() : null,
    }
  }

  async function listDatabases({ connectionId, query = '' } = {}) {
    const items = await clientFor(connectionId).listAccessibleDataSources(query)
    return {
      databases: items.filter(Boolean),
    }
  }

  async function getSchema({ connectionId, databaseId, dataSourceId } = {}) {
    const source = await clientFor(connectionId).resolveDataSource({ databaseId, dataSourceId })
    const schema = normalizeSchema(source.properties)
    return {
      database: {
        id: source.id || dataSourceId || databaseId,
        name: readTitle(source.title || source.name) || 'Sem título',
        databaseId: source.parent?.database_id || databaseId || null,
        dataSourceId: source.id || dataSourceId || databaseId,
      },
      schema,
    }
  }

  async function listTasks({
    connectionId,
    databaseId,
    dataSourceId,
    search = '',
    status = 'all',
  } = {}) {
    const sourceId = requireSourceId(dataSourceId || databaseId)
    const cached = cacheRepository.readSnapshot({ connectionId, dataSourceId: sourceId })
    const client = clientFor(connectionId)

    try {
      const source = await client.resolveDataSource({ databaseId, dataSourceId })
      const normalizedSchema = normalizeSchema(source.properties)
      const result = await client.queryTasks({
        dataSourceId: source.id || sourceId,
        schema: normalizedSchema,
      })
      const fetchedAt = now()
      cacheRepository.replaceSnapshot({
        connectionId,
        dataSourceId: source.id || sourceId,
        schema: normalizedSchema,
        tasks: result.tasks,
        fetchedAt,
      })

      return {
        tasks: filterTasks(result.tasks, { search, status }),
        schema: normalizedSchema,
        dataSourceId: source.id || sourceId,
        fetchedAt,
        stale: false,
        fromCache: false,
        hasMore: Boolean(result.nextCursor),
      }
    } catch (error) {
      try {
        cacheRepository.markSyncError({
          connectionId,
          dataSourceId: sourceId,
          error,
          updatedAt: now(),
        })
      } catch {
        // An unavailable cache must not hide the useful Notion error.
      }

      if (cached.tasks.length === 0) throw error

      return {
        tasks: filterTasks(cached.tasks, { search, status }),
        schema: cached.schema,
        dataSourceId: sourceId,
        fetchedAt: cached.fetchedAt,
        stale: true,
        fromCache: true,
        message: error instanceof Error ? error.message : 'A lista está desatualizada.',
        hasMore: false,
      }
    }
  }

  async function createTask({ connectionId, databaseId, dataSourceId, task } = {}) {
    const schemaResult = await getSchema({ connectionId, databaseId, dataSourceId })
    const sourceId = schemaResult.database.dataSourceId
    const created = await clientFor(connectionId).createTask({
      dataSourceId: sourceId,
      schema: schemaResult.schema,
      task,
    })
    cacheRepository.upsertTask({
      connectionId,
      dataSourceId: sourceId,
      schema: schemaResult.schema,
      task: created,
      fetchedAt: now(),
    })
    return { task: created, schema: schemaResult.schema, dataSourceId: sourceId }
  }

  async function updateTask({ connectionId, pageId, databaseId, dataSourceId, changes } = {}) {
    const schemaResult = await getSchema({ connectionId, databaseId, dataSourceId })
    const sourceId = schemaResult.database.dataSourceId
    const updated = await clientFor(connectionId).updateTask({
      pageId,
      schema: schemaResult.schema,
      changes,
    })
    cacheRepository.upsertTask({
      connectionId,
      dataSourceId: sourceId,
      schema: schemaResult.schema,
      task: updated,
      fetchedAt: now(),
    })
    return { task: updated, schema: schemaResult.schema, dataSourceId: sourceId }
  }

  async function archiveTask({ connectionId, pageId, databaseId, dataSourceId } = {}) {
    const schemaResult = await getSchema({ connectionId, databaseId, dataSourceId })
    const sourceId = schemaResult.database.dataSourceId
    const archived = await clientFor(connectionId).archiveTask(pageId)
    cacheRepository.deleteTask({
      connectionId,
      dataSourceId: sourceId,
      taskId: archived.id,
    })
    return { ...archived, dataSourceId: sourceId }
  }

  return {
    archiveTask,
    createTask,
    getSchema,
    listConnections,
    listDatabases,
    listTasks,
    removeConnection,
    saveConnection,
    testConnection,
    updateTask,
  }
}

function normalizeSchema(properties) {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return {}
  return Object.fromEntries(
    Object.entries(properties).map(([name, definition]) => [
      name,
      {
        ...(definition && typeof definition === 'object' ? definition : {}),
        id: definition?.id || name,
        name,
        type: definition?.type || 'unknown',
      },
    ]),
  )
}

function filterTasks(tasks, { search = '', status = 'all' } = {}) {
  const needle = typeof search === 'string' ? search.trim().toLocaleLowerCase() : ''
  return tasks.filter((task) => {
    if (status === 'open' && task.completed) return false
    if (status === 'done' && !task.completed) return false
    if (!needle) return true
    const haystack = [task.title, task.status, task.priority, task.text, ...Object.values(task.fields || {})]
      .map((value) => (Array.isArray(value) ? value.join(' ') : String(value ?? '')))
      .join(' ')
      .toLocaleLowerCase()
    return haystack.includes(needle)
  })
}

function readTitle(value) {
  if (Array.isArray(value)) {
    return value.map((item) => item?.plain_text || item?.text?.content || '').join('')
  }
  return typeof value === 'string' ? value : ''
}

function requireSourceId(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Selecione uma tabela Notion antes de carregar as tarefas.')
  }
  return value.trim()
}

module.exports = {
  createNotionService,
  filterTasks,
  normalizeSchema,
}
