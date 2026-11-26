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
    const removed = connectionStore.remove(connectionId)
    if (removed && typeof connectionId === 'string' && connectionId.trim()) {
      try {
        cacheRepository.clearConnection({ connectionId })
      } catch {
        // A remoção da conexão já aconteceu; um cache órfão residual não é
        // motivo pra reportar falha nessa operação — a próxima leitura desse
        // connectionId simplesmente não encontrará credencial nenhuma.
      }
    }
    return { removed }
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
    const client = clientFor(connectionId)
    try {
      const items = await client.listAccessibleDataSources(query)
      return {
        databases: items.filter(Boolean),
      }
    } catch (error) {
      // Só falta de rede/5xx cai no cache; 401/403/400/429 sobem para a pessoa ver.
      if (!isOfflineError(error)) throw error
      // Sem rede: oferece as databases desta conexão que já têm snapshot salvo.
      const needle = String(query || '').trim().toLocaleLowerCase()
      let snapshots = []
      try {
        snapshots = cacheRepository.listSnapshots({ connectionId })
      } catch {
        // Cache indisponível não esconde o erro útil do Notion.
      }
      const databases = snapshots
        .map((item) => ({
          id: item.dataSourceId,
          name: item.name || 'Database sincronizada',
          databaseId: null,
          url: null,
          lastEditedAt: null,
          fetchedAt: item.fetchedAt,
        }))
        .filter((item) => !needle || item.name.toLocaleLowerCase().includes(needle))
      if (snapshots.length === 0) throw error
      return {
        databases,
        stale: true,
        message: 'Sem conexão com o Notion: mostrando as databases com snapshot salvo.',
      }
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

  /**
   * Leitura local instantânea, sem tocar a rede — o lado "stale" de
   * stale-while-revalidate. `NotionTasksPanel` chama isto primeiro pra
   * renderizar o snapshot salvo na hora, antes de `listTasks` (que fala com
   * a API) resolver em segundo plano.
   */
  function getCachedTasks({ connectionId, databaseId, dataSourceId, search = '', status = 'all' } = {}) {
    const sourceId = requireSourceId(dataSourceId || databaseId)
    const cached = cacheRepository.readSnapshot({ connectionId, dataSourceId: sourceId })
    const hasCache = cached.tasks.length > 0

    return {
      tasks: filterTasks(cached.tasks, { search, status }),
      schema: cached.schema,
      dataSourceId: sourceId,
      fetchedAt: cached.fetchedAt,
      hasCache,
      syncStatus: hasCache ? 'stale' : 'empty',
    }
  }

  async function listTasks({
    connectionId,
    databaseId,
    dataSourceId,
    search = '',
    status = 'all',
    complete = false,
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
        complete: complete === true,
      })
      const fetchedAt = now()
      // Uma carga cortada no teto não troca um snapshot maior (a carga completa do Painel).
      if (!(result.nextCursor && cached.tasks.length > result.tasks.length)) {
        cacheRepository.replaceSnapshot({
          connectionId,
          dataSourceId: source.id || sourceId,
          schema: normalizedSchema,
          tasks: result.tasks,
          fetchedAt,
        })
      }
      try {
        cacheRepository.setName({
          connectionId,
          dataSourceId: source.id || sourceId,
          name: readTitle(source.title || source.name),
        })
      } catch {
        // O nome só enfeita a lista offline; não derruba a sincronização.
      }

      return {
        tasks: filterTasks(result.tasks, { search, status }),
        schema: normalizedSchema,
        dataSourceId: source.id || sourceId,
        fetchedAt,
        stale: false,
        fromCache: false,
        syncStatus: 'success',
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
        syncStatus: 'stale',
        message: error instanceof Error ? error.message : 'A lista está desatualizada.',
        hasMore: false,
      }
    }
  }

  async function getTaskContent({ connectionId, pageId } = {}) {
    const content = await clientFor(connectionId).getPageContent(pageId)
    return {
      pageId,
      content,
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

  /**
   * `expectedUpdatedAt` é o `updatedAt` (last_edited_time) que a pessoa via
   * quando começou a editar — o snapshot local que a mudança parte dela.
   * Quando informado, checa a versão remota ANTES do PATCH: a API do Notion
   * não tem escrita condicional (sem ETag/If-Match), então a única forma de
   * não sobrescrever uma edição concorrente feita direto no Notion é ler de
   * novo e comparar. Em conflito, rejeita com segurança (não aplica o PATCH)
   * e devolve a versão remota atual pra pessoa decidir — nunca sobrescreve
   * silenciosamente. Sem `expectedUpdatedAt`, mantém o comportamento antigo
   * (aplica direto), pra não quebrar chamadas que ainda não migraram.
   */
  async function updateTask({
    connectionId,
    pageId,
    databaseId,
    dataSourceId,
    changes,
    expectedUpdatedAt,
  } = {}) {
    const schemaResult = await getSchema({ connectionId, databaseId, dataSourceId })
    const sourceId = schemaResult.database.dataSourceId
    const client = clientFor(connectionId)

    if (typeof expectedUpdatedAt === 'string' && expectedUpdatedAt) {
      const remote = await client.getTask({ pageId, schema: schemaResult.schema })
      if (remote.updatedAt !== expectedUpdatedAt) {
        // A cópia local está desatualizada — atualiza o cache com a versão
        // remota de verdade (evita repetir o mesmo conflito falso numa
        // segunda tentativa) e rejeita sem tocar no Notion.
        cacheRepository.upsertTask({
          connectionId,
          dataSourceId: sourceId,
          schema: schemaResult.schema,
          task: remote,
          fetchedAt: now(),
        })
        return {
          conflict: true,
          task: remote,
          schema: schemaResult.schema,
          dataSourceId: sourceId,
          message: 'Esta tarefa foi alterada no Notion desde a última leitura. Revise a versão atual antes de salvar de novo.',
        }
      }
    }

    const updated = await client.updateTask({
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
    return { task: updated, schema: schemaResult.schema, dataSourceId: sourceId, conflict: false }
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
    getCachedTasks,
    getSchema,
    getTaskContent,
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

const TRANSPORT_CODES = new Set(['timeout', 'network_error', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'])

/** Erro de transporte (sem resposta HTTP) ou 5xx do Notion; 4xx nunca é "offline". */
function isOfflineError(error) {
  if (!error) return false
  if (typeof error.status === 'number') return error.status >= 500
  const cause = error.cause
  return (
    TRANSPORT_CODES.has(error.code) ||
    TRANSPORT_CODES.has(cause?.code) ||
    error.name === 'AbortError' ||
    /fetch failed/i.test(String(error.message))
  )
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
  isOfflineError,
  normalizeSchema,
}
