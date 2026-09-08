'use strict'

const NOTION_API_VERSION = '2026-03-11'
const DEFAULT_BASE_URL = 'https://api.notion.com'
const MAX_PAGE_SIZE = 100
const MAX_QUERY_PAGES = 20

class NotionClientError extends Error {
  constructor(message, { status = null, code = 'notion_error', retryAfter = null } = {}) {
    super(message)
    this.name = 'NotionClientError'
    this.status = status
    this.code = code
    this.retryAfter = retryAfter
  }
}

function createNotionClient({
  token,
  fetchImpl = globalThis.fetch,
  baseUrl = DEFAULT_BASE_URL,
  apiVersion = NOTION_API_VERSION,
  timeoutMs = 15_000,
  maxRetries = 2,
  sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
} = {}) {
  if (typeof token !== 'string' || !token.trim()) {
    throw new NotionClientError('A conexão Notion não tem token configurado.', {
      code: 'missing_token',
    })
  }
  if (typeof fetchImpl !== 'function') {
    throw new NotionClientError('O runtime não oferece HTTP para conectar ao Notion.', {
      code: 'missing_fetch',
    })
  }

  const root = String(baseUrl).replace(/\/$/, '')

  async function request(endpoint, options = {}) {
    const method = options.method || 'GET'
    const body = options.body === undefined ? undefined : JSON.stringify(options.body)
    const attempts = Math.max(0, Number.isInteger(maxRetries) ? maxRetries : 2)

    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetchImpl(`${root}${endpoint}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Notion-Version': apiVersion,
          },
          body,
          signal: controller.signal,
        })

        const text = await response.text()
        let payload = null
        try {
          payload = text ? JSON.parse(text) : null
        } catch {
          payload = null
        }

        if (response.ok) return payload || {}

        const retryAfter = parseRetryAfter(response.headers?.get?.('retry-after'))
        if (isRetryableStatus(response.status) && attempt < attempts) {
          await sleep(retryAfter ?? retryDelay(attempt))
          continue
        }

        throw new NotionClientError(messageForStatus(response.status, payload), {
          status: response.status,
          code: typeof payload?.code === 'string' ? payload.code : 'notion_error',
          retryAfter,
        })
      } catch (error) {
        if (error instanceof NotionClientError) throw error

        if (attempt < attempts) {
          await sleep(retryDelay(attempt))
          continue
        }

        if (error?.name === 'AbortError') {
          throw new NotionClientError(
            'A conexão com o Notion excedeu o tempo limite. Verifique a rede e tente novamente.',
            { code: 'timeout' },
          )
        }

        throw new NotionClientError(
          'Não foi possível conectar ao Notion. Verifique a rede e tente novamente.',
          { code: 'network_error' },
        )
      } finally {
        clearTimeout(timeout)
      }
    }
  }

  async function getCurrentUser() {
    return request('/v1/users/me')
  }

  async function listAccessibleDataSources(query = '') {
    const results = []
    let cursor = undefined

    for (let page = 0; page < MAX_QUERY_PAGES; page += 1) {
      const payload = await request('/v1/search', {
        method: 'POST',
        body: {
          ...(query.trim() ? { query: query.trim().slice(0, 200) } : {}),
          filter: { property: 'object', value: 'data_source' },
          sort: { direction: 'descending', timestamp: 'last_edited_time' },
          page_size: MAX_PAGE_SIZE,
          ...(cursor ? { start_cursor: cursor } : {}),
        },
      })

      results.push(...(Array.isArray(payload.results) ? payload.results : []))
      if (!payload.has_more || !payload.next_cursor) break
      cursor = payload.next_cursor
    }

    return results.map(normalizeDataSourceSummary).filter(Boolean)
  }

  async function getDatabase(databaseId) {
    return request(`/v1/databases/${encodeURIComponent(requireId(databaseId, 'database'))}`)
  }

  async function getDataSource(dataSourceId) {
    return request(`/v1/data_sources/${encodeURIComponent(requireId(dataSourceId, 'data source'))}`)
  }

  async function resolveDataSource({ databaseId, dataSourceId } = {}) {
    if (dataSourceId) return getDataSource(dataSourceId)

    const database = await getDatabase(databaseId)
    const first = Array.isArray(database.data_sources) ? database.data_sources[0] : null
    if (first?.id) return getDataSource(first.id)

    // Compatibility with a pre-2025 response where the database itself had
    // the schema. The caller still treats the database ID as the source ID.
    return { ...database, id: database.id || databaseId, object: 'data_source' }
  }

  async function queryTasks({ dataSourceId, schema, maxPages = MAX_QUERY_PAGES } = {}) {
    const sourceId = requireId(dataSourceId, 'data source')
    const tasks = []
    let cursor = undefined

    for (let page = 0; page < Math.min(MAX_QUERY_PAGES, Math.max(1, maxPages)); page += 1) {
      const payload = await request(
        `/v1/data_sources/${encodeURIComponent(sourceId)}/query`,
        {
          method: 'POST',
          body: {
            page_size: MAX_PAGE_SIZE,
            ...(cursor ? { start_cursor: cursor } : {}),
          },
        },
      )

      const currentSchema = schema || {}
      tasks.push(
        ...(Array.isArray(payload.results)
          ? payload.results.map((pageResult) => normalizePage(pageResult, currentSchema)).filter(Boolean)
          : []),
      )
      if (!payload.has_more || !payload.next_cursor) break
      cursor = payload.next_cursor
    }

    return { tasks, nextCursor: cursor || null }
  }

  async function createTask({ dataSourceId, schema, task } = {}) {
    const sourceId = requireId(dataSourceId, 'data source')
    const properties = buildPageProperties(schema, task, { create: true })
    const page = await request('/v1/pages', {
      method: 'POST',
      body: {
        parent: { data_source_id: sourceId },
        properties,
      },
    })
    return normalizePage(page, schema)
  }

  async function updateTask({ pageId, schema, changes } = {}) {
    const id = requireId(pageId, 'page')
    const properties = buildPageProperties(schema, changes, { create: false })
    const page = await request(`/v1/pages/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { properties },
    })
    return normalizePage(page, schema)
  }

  async function archiveTask(pageId) {
    const id = requireId(pageId, 'page')
    await request(`/v1/pages/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { in_trash: true },
    })
    return { id, archived: true }
  }

  return {
    createTask,
    getCurrentUser,
    getDataSource,
    getDatabase,
    listAccessibleDataSources,
    queryTasks,
    resolveDataSource,
    updateTask,
    archiveTask,
  }
}

function normalizeDataSourceSummary(item) {
  if (!item || typeof item !== 'object' || typeof item.id !== 'string') return null
  const title = readRichText(item.title || item.name)
  const parent = item.parent && typeof item.parent === 'object' ? item.parent : {}
  return {
    id: item.id,
    name: title || 'Sem título',
    databaseId: typeof item.databaseId === 'string' ? item.databaseId : parent.database_id || null,
    url: typeof item.url === 'string' ? item.url : null,
    lastEditedAt: item.last_edited_time || null,
  }
}

function normalizePage(page, schema = {}) {
  if (!page || typeof page !== 'object' || typeof page.id !== 'string') return null
  const properties = page.properties && typeof page.properties === 'object' ? page.properties : {}
  const fields = {}
  let title = ''
  let completed = false
  let status = ''
  let dueDate = ''
  let priority = ''
  let text = ''

  for (const [name, property] of Object.entries(properties)) {
    const definition = schema[name] || schema[property?.id] || {}
    const type = property?.type || definition.type
    const value = readPropertyValue(property, type)
    fields[name] = value

    if (!title && type === 'title') title = stringifyValue(value)
    if (!text && type === 'rich_text') text = stringifyValue(value)
    if (!status && (type === 'status' || type === 'select')) status = stringifyValue(value)
    if (!dueDate && type === 'date') dueDate = stringifyValue(value)
    if (!priority && (type === 'select' || type === 'status')) {
      const lowerName = name.toLocaleLowerCase()
      if (lowerName.includes('prior') || lowerName.includes('urg')) {
        priority = stringifyValue(value)
      }
    }
    if (type === 'checkbox') completed = value === true
    if ((type === 'status' || type === 'select') && isCompletedLabel(value)) completed = true
  }

  return {
    id: page.id,
    title: title || 'Sem título',
    completed,
    status,
    dueDate,
    priority,
    text,
    url: typeof page.url === 'string' ? page.url : null,
    archived: page.in_trash === true || page.archived === true || page.is_archived === true,
    createdAt: page.created_time || null,
    updatedAt: page.last_edited_time || null,
    fields,
  }
}

function readPropertyValue(property, type = property?.type) {
  if (!property || typeof property !== 'object') return null
  const raw = property[type]

  switch (type) {
    case 'title':
    case 'rich_text':
      return readRichText(raw)
    case 'select':
    case 'status':
      return raw?.name || ''
    case 'multi_select':
      return Array.isArray(raw) ? raw.map((item) => item?.name).filter(Boolean) : []
    case 'checkbox':
      return raw === true
    case 'date':
      return raw?.start || ''
    case 'number':
      return typeof raw === 'number' ? raw : null
    case 'url':
    case 'email':
      return typeof raw === 'string' ? raw : ''
    case 'formula':
      return readPropertyValue(raw, raw?.type)
    default:
      return raw ?? null
  }
}

function readRichText(value) {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return value?.plain_text || value?.name || ''
  return value
    .map((item) => item?.plain_text || item?.text?.content || item?.name || '')
    .filter(Boolean)
    .join('')
}

function stringifyValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ')
  return value === null || value === undefined ? '' : String(value)
}

function buildPageProperties(schema = {}, input = {}, { create = false } = {}) {
  const properties = {}
  const entries = Object.entries(schema || {})
  const titleEntry = findProperty(entries, ['title'])
  if (!titleEntry && (create || input.title !== undefined)) {
    throw new Error('A tabela Notion precisa de uma propriedade de título.')
  }

  if (titleEntry && input.title !== undefined) {
    properties[titleEntry[0]] = { title: [{ type: 'text', text: { content: limitText(input.title) } }] }
  } else if (titleEntry && create) {
    properties[titleEntry[0]] = { title: [{ type: 'text', text: { content: 'Nova tarefa' } }] }
  }

  const checkboxEntry = findProperty(entries, ['checkbox'])
  const statusEntry = findSemanticProperty(entries, ['status', 'estado', 'conclu', 'done', 'complete'])
  const textEntry = findProperty(entries, ['rich_text'])
  const dateEntry = findProperty(entries, ['date'])
  const priorityEntry = findSemanticProperty(entries, ['prior', 'urg'])

  if (input.completed !== undefined) {
    if (checkboxEntry) {
      properties[checkboxEntry[0]] = { checkbox: input.completed === true }
    }
    if (statusEntry) {
      properties[statusEntry[0]] = buildStatusValue(statusEntry[1], input.completed === true, input.status)
    }
  }
  if (input.status !== undefined && statusEntry) {
    properties[statusEntry[0]] = buildStatusValue(statusEntry[1], input.completed === true, input.status)
  }
  if (input.text !== undefined && textEntry) {
    properties[textEntry[0]] = {
      rich_text: input.text
        ? [{ type: 'text', text: { content: limitText(input.text) } }]
        : [],
    }
  }
  if (input.dueDate !== undefined && dateEntry) {
    properties[dateEntry[0]] = { date: input.dueDate ? { start: input.dueDate } : null }
  }
  if (input.priority !== undefined && priorityEntry) {
    properties[priorityEntry[0]] = {
      [priorityEntry[1].type]: input.priority ? { name: limitText(input.priority) } : null,
    }
  }

  return properties
}

function buildStatusValue(definition, completed, requestedStatus) {
  const type = definition?.type === 'status' ? 'status' : 'select'
  const options = Array.isArray(definition?.[type]?.options) ? definition[type].options : []
  const desired = requestedStatus || (completed ? findDoneOption(options) : findOpenOption(options))
  return { [type]: desired ? { name: desired } : null }
}

function findDoneOption(options) {
  return options.find((option) => isCompletedLabel(option?.name))?.name || options.at(-1)?.name || null
}

function findOpenOption(options) {
  return options.find((option) => !isCompletedLabel(option?.name))?.name || options[0]?.name || null
}

function findProperty(entries, types) {
  return entries.find(([, definition]) => types.includes(definition?.type)) || null
}

function findSemanticProperty(entries, words) {
  return (
    entries.find(([, definition]) => {
      if (!['status', 'select'].includes(definition?.type)) return false
      const name = String(definition?.name || '').toLocaleLowerCase()
      return words.some((word) => name.includes(word))
    }) || entries.find(([, definition]) => ['status', 'select'].includes(definition?.type)) || null
  )
}

function limitText(value) {
  return typeof value === 'string' ? value.slice(0, 2_000) : ''
}

function requireId(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Informe o ID da ${label}.`)
  }
  return value.trim()
}

function isCompletedLabel(value) {
  const normalized = stringifyValue(value).trim().toLocaleLowerCase()
  return ['done', 'complete', 'completed', 'concluída', 'concluida', 'concluído', 'concluido', 'finalizado', 'finished'].includes(normalized)
}

function parseRetryAfter(value) {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1_000, 30_000) : null
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || status === 529
}

function retryDelay(attempt) {
  return Math.min(500 * 2 ** attempt, 4_000)
}

function messageForStatus(status, payload) {
  const code = typeof payload?.code === 'string' ? payload.code : ''
  if (status === 401) return 'O token do Notion foi recusado. Revise a conexão.'
  if (status === 403) return 'O Notion recusou a operação. Compartilhe a tabela com a conexão e confira as capacidades de leitura/escrita.'
  if (status === 404) return 'A tabela ou página não foi encontrada, ou deixou de ser compartilhada com a conexão.'
  if (status === 409) return 'O Notion detectou um conflito. Atualize a lista e tente novamente.'
  if (status === 429) return 'O limite de requisições do Notion foi atingido. Aguarde e tente novamente.'
  if (status >= 500) return 'O serviço do Notion está indisponível no momento. Tente novamente em instantes.'
  if (code === 'validation_error') return 'O Notion recusou os dados enviados. Confira o esquema da tabela e os campos editados.'
  return 'O Notion recusou a operação. Confira a conexão e tente novamente.'
}

module.exports = {
  DEFAULT_BASE_URL,
  MAX_PAGE_SIZE,
  NOTION_API_VERSION,
  NotionClientError,
  buildPageProperties,
  createNotionClient,
  isCompletedLabel,
  normalizeDataSourceSummary,
  normalizePage,
  readPropertyValue,
}
