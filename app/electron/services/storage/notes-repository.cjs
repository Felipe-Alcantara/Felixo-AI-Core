function createNotesRepository(database) {
  const connection = database?.connection ?? database

  if (!connection?.prepare) {
    throw new Error('Conexao SQLite invalida para notes repository.')
  }

  return {
    list(options = {}) {
      const includeArchived = options.includeArchived === true
      const sql = includeArchived
        ? 'SELECT * FROM notes ORDER BY updated_at DESC'
        : 'SELECT * FROM notes WHERE archived_at IS NULL ORDER BY updated_at DESC'

      return connection.prepare(sql).all().map(mapNoteRow)
    },
    get(noteId) {
      const row = connection
        .prepare('SELECT * FROM notes WHERE id = ? AND archived_at IS NULL')
        .get(requireNoteId(noteId))

      return row ? mapNoteRow(row) : null
    },
    save(note) {
      const normalizedNote = normalizeNote(note)
      const metadataJson = JSON.stringify({
        projectIds: normalizedNote.projectIds,
      })

      connection
        .prepare(
          `INSERT INTO notes (
             id,
             project_id,
             chat_id,
             title,
             content,
             tags_json,
             metadata_json,
             created_at,
             updated_at,
             archived_at
           )
           VALUES (?, NULL, NULL, ?, ?, '[]', ?, ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET
             title = excluded.title,
             content = excluded.content,
             metadata_json = excluded.metadata_json,
             updated_at = excluded.updated_at,
             archived_at = NULL`,
        )
        .run(
          normalizedNote.id,
          normalizedNote.title,
          normalizedNote.content,
          metadataJson,
          normalizedNote.createdAt,
          normalizedNote.updatedAt,
        )

      return normalizedNote
    },
    delete(noteId) {
      const now = new Date().toISOString()
      const result = connection
        .prepare(
          `UPDATE notes
           SET archived_at = ?, updated_at = ?
           WHERE id = ? AND archived_at IS NULL`,
        )
        .run(now, now, requireNoteId(noteId))

      return result.changes > 0
    },
  }
}

function normalizeNote(note) {
  if (!note || typeof note !== 'object') {
    throw new Error('Nota invalida.')
  }

  const rawNote = note
  const id = requireNoteId(rawNote.id)
  const title = requireStringValue(rawNote.title, 'Titulo da nota invalido.')
  const content = requireStringValue(rawNote.content, 'Conteudo da nota invalido.')
  const createdAt = requireIsoString(rawNote.createdAt, 'Data de criacao invalida.')
  const updatedAt = requireIsoString(rawNote.updatedAt, 'Data de atualizacao invalida.')
  const projectIds = Array.isArray(rawNote.projectIds)
    ? [
        ...new Set(
          rawNote.projectIds.flatMap((item) =>
            typeof item === 'string' && item.trim() ? [item.trim()] : [],
          ),
        ),
      ]
    : []

  return {
    id,
    title,
    content,
    projectIds,
    createdAt,
    updatedAt,
  }
}

function mapNoteRow(row) {
  const metadata = parseJsonObject(row.metadata_json)
  const projectIds = Array.isArray(metadata.projectIds)
    ? metadata.projectIds.filter((item) => typeof item === 'string')
    : []

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    projectIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function requireNoteId(noteId) {
  return requireString(noteId, 'ID de nota invalido.')
}

function requireStringValue(value, errorMessage) {
  if (typeof value !== 'string') {
    throw new Error(errorMessage)
  }

  return value
}

function requireString(value, errorMessage) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(errorMessage)
  }

  return value.trim()
}

function requireIsoString(value, errorMessage) {
  const normalizedValue = requireString(value, errorMessage)

  if (Number.isNaN(Date.parse(normalizedValue))) {
    throw new Error(errorMessage)
  }

  return normalizedValue
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

module.exports = {
  createNotesRepository,
  normalizeNote,
}
