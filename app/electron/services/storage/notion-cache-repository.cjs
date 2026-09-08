'use strict'

function createNotionCacheRepository(database) {
  const connection = database?.connection ?? database
  if (!connection?.prepare) {
    throw new Error('Conexao SQLite invalida para notion cache repository.')
  }

  function readSnapshot({ connectionId, dataSourceId }) {
    const key = normalizeKey(connectionId, dataSourceId)
    const state = connection
      .prepare(
        `SELECT schema_json, next_cursor, fetched_at, last_success_at,
                status, last_error, updated_at
           FROM notion_sync_state
          WHERE connection_id = ? AND data_source_id = ?`,
      )
      .get(key.connectionId, key.dataSourceId)

    const rows = connection
      .prepare(
        `SELECT task_id, payload_json, fetched_at
           FROM notion_task_cache
          WHERE connection_id = ? AND data_source_id = ?
          ORDER BY fetched_at DESC, task_id ASC`,
      )
      .all(key.connectionId, key.dataSourceId)

    return {
      tasks: rows.map((row) => parseJson(row.payload_json)).filter(Boolean),
      schema: parseJsonObject(state?.schema_json),
      nextCursor: state?.next_cursor || null,
      fetchedAt: state?.fetched_at || null,
      lastSuccessAt: state?.last_success_at || null,
      status: state?.status || 'idle',
      lastError: state?.last_error || null,
      updatedAt: state?.updated_at || null,
    }
  }

  function replaceSnapshot({ connectionId, dataSourceId, schema = {}, tasks = [], fetchedAt }) {
    const key = normalizeKey(connectionId, dataSourceId)
    const timestamp = normalizeTimestamp(fetchedAt)
    const normalizedTasks = Array.isArray(tasks)
      ? tasks.filter((task) => task && typeof task.id === 'string' && task.id.trim())
      : []

    connection.exec('BEGIN IMMEDIATE')
    try {
      connection
        .prepare(
          `DELETE FROM notion_task_cache
            WHERE connection_id = ? AND data_source_id = ?`,
        )
        .run(key.connectionId, key.dataSourceId)

      const insert = connection.prepare(
        `INSERT INTO notion_task_cache (
           connection_id, data_source_id, task_id, payload_json, fetched_at
         ) VALUES (?, ?, ?, ?, ?)`,
      )
      for (const task of normalizedTasks) {
        insert.run(
          key.connectionId,
          key.dataSourceId,
          task.id,
          JSON.stringify(task),
          timestamp,
        )
      }

      upsertState(connection, {
        ...key,
        schema,
        nextCursor: null,
        fetchedAt: timestamp,
        lastSuccessAt: timestamp,
        status: 'success',
        lastError: null,
        updatedAt: timestamp,
      })
      connection.exec('COMMIT')
    } catch (error) {
      try {
        connection.exec('ROLLBACK')
      } catch {
        // Keep the original SQLite error.
      }
      throw error
    }

    return readSnapshot(key)
  }

  function upsertTask({ connectionId, dataSourceId, task, schema = {}, fetchedAt }) {
    const key = normalizeKey(connectionId, dataSourceId)
    if (!task || typeof task.id !== 'string' || !task.id.trim()) {
      throw new Error('Tarefa Notion invalida para cache.')
    }
    const timestamp = normalizeTimestamp(fetchedAt)

    connection
      .prepare(
        `INSERT INTO notion_task_cache (
           connection_id, data_source_id, task_id, payload_json, fetched_at
         ) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(connection_id, data_source_id, task_id) DO UPDATE SET
           payload_json = excluded.payload_json,
           fetched_at = excluded.fetched_at`,
      )
      .run(
        key.connectionId,
        key.dataSourceId,
        task.id,
        JSON.stringify(task),
        timestamp,
      )

    const current = readSnapshot(key)
    upsertState(connection, {
      ...key,
      schema: Object.keys(schema).length > 0 ? schema : current.schema,
      nextCursor: current.nextCursor,
      fetchedAt: current.fetchedAt || timestamp,
      lastSuccessAt: current.lastSuccessAt,
      status: current.status === 'error' ? 'stale' : current.status,
      lastError: current.lastError,
      updatedAt: timestamp,
    })

    return readSnapshot(key)
  }

  function deleteTask({ connectionId, dataSourceId, taskId }) {
    const key = normalizeKey(connectionId, dataSourceId)
    connection
      .prepare(
        `DELETE FROM notion_task_cache
          WHERE connection_id = ? AND data_source_id = ? AND task_id = ?`,
      )
      .run(key.connectionId, key.dataSourceId, normalizeId(taskId, 'task'))
  }

  function markSyncError({ connectionId, dataSourceId, error, updatedAt }) {
    const key = normalizeKey(connectionId, dataSourceId)
    const current = readSnapshot(key)
    const timestamp = normalizeTimestamp(updatedAt)
    upsertState(connection, {
      ...key,
      schema: current.schema,
      nextCursor: current.nextCursor,
      fetchedAt: current.fetchedAt,
      lastSuccessAt: current.lastSuccessAt,
      status: 'error',
      lastError: sanitizeError(error),
      updatedAt: timestamp,
    })
    return readSnapshot(key)
  }

  function clear({ connectionId, dataSourceId }) {
    const key = normalizeKey(connectionId, dataSourceId)
    connection
      .prepare(
        `DELETE FROM notion_task_cache
          WHERE connection_id = ? AND data_source_id = ?`,
      )
      .run(key.connectionId, key.dataSourceId)
    connection
      .prepare(
        `DELETE FROM notion_sync_state
          WHERE connection_id = ? AND data_source_id = ?`,
      )
      .run(key.connectionId, key.dataSourceId)
  }

  return {
    clear,
    deleteTask,
    markSyncError,
    readSnapshot,
    replaceSnapshot,
    upsertTask,
  }
}

function upsertState(connection, state) {
  connection
    .prepare(
      `INSERT INTO notion_sync_state (
         connection_id, data_source_id, schema_json, next_cursor,
         fetched_at, last_success_at, status, last_error, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(connection_id, data_source_id) DO UPDATE SET
         schema_json = excluded.schema_json,
         next_cursor = excluded.next_cursor,
         fetched_at = excluded.fetched_at,
         last_success_at = excluded.last_success_at,
         status = excluded.status,
         last_error = excluded.last_error,
         updated_at = excluded.updated_at`,
    )
    .run(
      state.connectionId,
      state.dataSourceId,
      JSON.stringify(state.schema || {}),
      state.nextCursor || null,
      state.fetchedAt || null,
      state.lastSuccessAt || null,
      state.status,
      state.lastError || null,
      state.updatedAt,
    )
}

function normalizeKey(connectionId, dataSourceId) {
  return {
    connectionId: normalizeId(connectionId, 'connection'),
    dataSourceId: normalizeId(dataSourceId, 'data source'),
  }
}

function normalizeId(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`ID de ${label} invalido para cache.`)
  }
  return value.trim()
}

function normalizeTimestamp(value) {
  const timestamp = typeof value === 'string' && value.trim() ? value : new Date().toISOString()
  if (Number.isNaN(Date.parse(timestamp))) throw new Error('Data invalida para cache Notion.')
  return timestamp
}

function parseJson(value) {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function parseJsonObject(value) {
  const parsed = parseJson(value || '{}')
  return parsed && !Array.isArray(parsed) ? parsed : {}
}

function sanitizeError(error) {
  if (error && typeof error.message === 'string') return error.message.slice(0, 500)
  return 'Falha desconhecida ao sincronizar o Notion.'
}

module.exports = {
  createNotionCacheRepository,
  parseJsonObject,
  sanitizeError,
}
