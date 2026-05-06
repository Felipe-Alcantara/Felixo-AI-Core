const MAX_CHAT_TITLE_LENGTH = 120
const MAX_ATTACHMENT_PREVIEW_URL_LENGTH = 512 * 1024

function createChatHistoryRepository(database) {
  const connection = database?.connection ?? database

  if (!connection?.prepare) {
    throw new Error('Conexao SQLite invalida para chat history repository.')
  }

  return {
    list(options = {}) {
      const limit = normalizeLimit(options.limit)
      const includeArchived = options.includeArchived === true
      const sql = includeArchived
        ? 'SELECT * FROM chats ORDER BY updated_at DESC LIMIT ?'
        : 'SELECT * FROM chats WHERE archived_at IS NULL ORDER BY updated_at DESC LIMIT ?'

      return connection.prepare(sql).all(limit).map((row) => mapChatRow(row, connection))
    },
    get(chatId) {
      const row = connection
        .prepare('SELECT * FROM chats WHERE id = ? AND archived_at IS NULL')
        .get(requireChatId(chatId))

      return row ? mapChatRow(row, connection) : null
    },
    save(session) {
      const normalizedSession = normalizeChatSession(session)

      connection.exec('BEGIN IMMEDIATE')

      try {
        connection
          .prepare(
            `INSERT INTO chats (
               id,
               project_id,
               title,
               summary,
               metadata_json,
               created_at,
               updated_at,
               archived_at
             )
             VALUES (?, NULL, ?, NULL, '{}', ?, ?, NULL)
             ON CONFLICT(id) DO UPDATE SET
               title = excluded.title,
               updated_at = excluded.updated_at,
               archived_at = NULL`,
          )
          .run(
            normalizedSession.id,
            normalizedSession.title,
            normalizedSession.createdAt,
            normalizedSession.updatedAt,
          )

        connection
          .prepare('DELETE FROM messages WHERE chat_id = ?')
          .run(normalizedSession.id)

        const insertMessage = connection.prepare(
          `INSERT INTO messages (
             id,
             chat_id,
             role,
             model_id,
             thread_id,
             content,
             status,
             storage_tier,
             usefulness_score,
             use_count,
             input_tokens,
             output_tokens,
             total_tokens,
             estimated_cost,
             metadata_json,
             created_at,
             updated_at,
             last_used_at,
             archived_at
           )
           VALUES (?, ?, ?, ?, ?, ?, 'done', 'hot', 0, 0, 0, 0, 0, 0, ?, ?, ?, NULL, NULL)`,
        )

        normalizedSession.messages.forEach((message, index) => {
          const createdAt = createMessageStorageTimestamp(
            normalizedSession.createdAt,
            index,
          )
          insertMessage.run(
            createMessageStorageId(normalizedSession.id, message, index),
            normalizedSession.id,
            message.role,
            message.model ?? null,
            message.sessionId ?? null,
            message.content,
            JSON.stringify({
              id: message.id,
              createdAt: message.createdAt,
              sessionId: message.sessionId ?? null,
              attachments: message.attachments ?? [],
            }),
            createdAt,
            normalizedSession.updatedAt,
          )
        })

        connection.exec('COMMIT')
      } catch (error) {
        try {
          connection.exec('ROLLBACK')
        } catch {
          // Keep the original write error.
        }

        throw error
      }

      return normalizedSession
    },
    delete(chatId) {
      const now = new Date().toISOString()
      const result = connection
        .prepare(
          `UPDATE chats
           SET archived_at = ?, updated_at = ?
           WHERE id = ? AND archived_at IS NULL`,
        )
        .run(now, now, requireChatId(chatId))

      return result.changes > 0
    },
  }
}

function normalizeChatSession(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('Chat invalido.')
  }

  const now = new Date().toISOString()
  const messages = Array.isArray(session.messages)
    ? session.messages.map(normalizeChatMessage).filter((message) => message.content.trim())
    : []
  const firstUserMessage = messages.find((message) => message.role === 'user')
  const fallbackTitle = firstUserMessage?.content ?? 'Chat sem titulo'

  return {
    id: requireChatId(session.id),
    title: normalizeTitle(session.title, fallbackTitle),
    messages,
    createdAt: normalizeIsoString(session.createdAt, now),
    updatedAt: normalizeIsoString(session.updatedAt, now),
  }
}

function normalizeChatMessage(message) {
  if (!message || typeof message !== 'object') {
    throw new Error('Mensagem de chat invalida.')
  }

  const role = message.role === 'assistant' ? 'assistant' : 'user'
  const id = typeof message.id === 'number' && Number.isFinite(message.id)
    ? message.id
    : Date.now()

  const attachments = normalizeChatAttachments(message.attachments)
  const normalizedMessage = {
    id,
    role,
    content: typeof message.content === 'string' ? message.content : '',
    model: normalizeOptionalString(message.model),
    sessionId: normalizeOptionalString(message.sessionId),
    isStreaming: false,
    createdAt: normalizeMessageCreatedAt(message.createdAt),
  }

  if (attachments.length > 0) {
    normalizedMessage.attachments = attachments
  }

  return normalizedMessage
}

function mapChatRow(row, connection) {
  return {
    id: row.id,
    title: row.title,
    messages: listChatMessages(connection, row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function listChatMessages(connection, chatId) {
  return connection
    .prepare(
      `SELECT *
       FROM messages
       WHERE chat_id = ? AND archived_at IS NULL
       ORDER BY created_at ASC, id ASC`,
    )
    .all(chatId)
    .map(mapMessageRow)
}

function mapMessageRow(row) {
  const metadata = parseJsonObject(row.metadata_json)
  const storedId = Number(metadata.id)

  const attachments = normalizeChatAttachments(metadata.attachments)
  const message = {
    id: Number.isFinite(storedId) ? storedId : Date.parse(row.created_at),
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: row.content,
    model: row.model_id || undefined,
    sessionId: row.thread_id || metadata.sessionId || undefined,
    isStreaming: false,
    createdAt: typeof metadata.createdAt === 'string'
      ? metadata.createdAt
      : formatDisplayTime(row.created_at),
  }

  if (attachments.length > 0) {
    message.attachments = attachments
  }

  return message
}

function createMessageStorageId(chatId, message, index) {
  return `${chatId}:${String(index).padStart(6, '0')}:${message.id}`
}

function createMessageStorageTimestamp(sessionCreatedAt, index) {
  const baseTime = Date.parse(sessionCreatedAt)
  const timestamp = Number.isFinite(baseTime) ? baseTime : Date.now()
  return new Date(timestamp + index).toISOString()
}

function normalizeTitle(title, fallbackTitle) {
  const rawTitle = typeof title === 'string' && title.trim() ? title : fallbackTitle
  const normalizedTitle = rawTitle.trim().replace(/\s+/g, ' ')

  return normalizedTitle.slice(0, MAX_CHAT_TITLE_LENGTH) || 'Chat sem titulo'
}

function normalizeLimit(limit) {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return 100
  }

  return Math.min(500, Math.max(1, Math.trunc(limit)))
}

function requireChatId(chatId) {
  if (typeof chatId !== 'string' || !chatId.trim()) {
    throw new Error('ID de chat invalido.')
  }

  return chatId.trim()
}

function normalizeIsoString(value, fallback) {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return value
  }

  return fallback
}

function normalizeMessageCreatedAt(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : formatDisplayTime(new Date().toISOString())
}

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeChatAttachments(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map(normalizeChatAttachment)
    .filter((attachment) => attachment !== null)
}

function normalizeChatAttachment(value) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const id = normalizeOptionalString(value.id)
  const name = normalizeOptionalString(value.name)
  const type = normalizeOptionalString(value.type) || 'application/octet-stream'
  const size =
    typeof value.size === 'number' && Number.isFinite(value.size)
      ? Math.max(0, value.size)
      : 0

  if (!name) {
    return null
  }

  const attachment = {
    id: id || `${Date.now()}-${Math.random()}`,
    name,
    type,
    size,
  }
  const attachmentPath = normalizeOptionalString(value.path)
  const previewUrl = normalizePreviewUrl(value.previewUrl)
  const contentPreview = normalizeOptionalString(value.contentPreview)

  if (attachmentPath) {
    attachment.path = attachmentPath
  }

  if (previewUrl) {
    attachment.previewUrl = previewUrl
  }

  if (contentPreview) {
    attachment.contentPreview = contentPreview
  }

  return attachment
}

function normalizePreviewUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_ATTACHMENT_PREVIEW_URL_LENGTH) {
    return undefined
  }

  const previewUrl = value.trim()

  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(previewUrl)
    ? previewUrl
    : undefined
}

function parseJsonObject(valueJson) {
  try {
    const parsed = JSON.parse(valueJson)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {}
  } catch {
    return {}
  }
}

function formatDisplayTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

module.exports = {
  createChatHistoryRepository,
  normalizeChatSession,
}
