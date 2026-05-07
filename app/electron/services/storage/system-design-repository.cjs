'use strict'

function createSystemDesignRepository(database) {
  const connection = database?.connection ?? database

  if (!connection?.prepare) {
    throw new Error('Conexao SQLite invalida para system-design repository.')
  }

  return {
    list() {
      return connection
        .prepare(
          'SELECT path, title, summary, byte_size, source_sha, updated_at FROM system_design_documents ORDER BY path ASC',
        )
        .all()
        .map(mapDocumentSummaryRow)
    },
    get(documentPath) {
      const row = connection
        .prepare(
          'SELECT * FROM system_design_documents WHERE path = ?',
        )
        .get(requireString(documentPath, 'Path do documento invalido.'))

      return row ? mapDocumentRow(row) : null
    },
    save(document) {
      const normalized = normalizeDocument(document)
      const now = new Date().toISOString()

      connection
        .prepare(
          `INSERT INTO system_design_documents (
             path,
             title,
             summary,
             content,
             byte_size,
             source_sha,
             metadata_json,
             updated_at
           )
           VALUES (?, ?, ?, ?, ?, ?, '{}', ?)
           ON CONFLICT(path) DO UPDATE SET
             title = excluded.title,
             summary = excluded.summary,
             content = excluded.content,
             byte_size = excluded.byte_size,
             source_sha = excluded.source_sha,
             updated_at = excluded.updated_at`,
        )
        .run(
          normalized.path,
          normalized.title,
          normalized.summary,
          normalized.content,
          normalized.byteSize,
          normalized.sourceSha ?? null,
          now,
        )

      return { ...normalized, updatedAt: now }
    },
    deleteMissing(activePaths) {
      const set = new Set(
        Array.isArray(activePaths)
          ? activePaths.filter((value) => typeof value === 'string' && value)
          : [],
      )
      const allPaths = connection
        .prepare('SELECT path FROM system_design_documents')
        .all()
      const stale = allPaths.filter((row) => !set.has(row.path))
      const stmt = connection.prepare(
        'DELETE FROM system_design_documents WHERE path = ?',
      )
      let removed = 0
      for (const row of stale) {
        const result = stmt.run(row.path)
        removed += result.changes ?? 0
      }
      return removed
    },
    clear() {
      const result = connection
        .prepare('DELETE FROM system_design_documents')
        .run()
      return result.changes ?? 0
    },
  }
}

function normalizeDocument(document) {
  if (!document || typeof document !== 'object') {
    throw new Error('Documento invalido.')
  }

  const path = requireString(document.path, 'Path do documento invalido.')
  const title = requireString(document.title, 'Titulo do documento invalido.')
  const content = typeof document.content === 'string' ? document.content : ''
  const summary = typeof document.summary === 'string' ? document.summary : ''
  const sourceSha = getOptionalTrimmed(document.sourceSha)
  const byteSize = Number.isFinite(document.byteSize)
    ? Math.max(0, Math.floor(document.byteSize))
    : Buffer.byteLength(content, 'utf8')

  return { path, title, summary, content, byteSize, sourceSha }
}

function mapDocumentRow(row) {
  return {
    path: row.path,
    title: row.title,
    summary: row.summary ?? '',
    content: row.content,
    byteSize: row.byte_size ?? 0,
    sourceSha: row.source_sha ?? undefined,
    updatedAt: row.updated_at,
  }
}

function mapDocumentSummaryRow(row) {
  return {
    path: row.path,
    title: row.title,
    summary: row.summary ?? '',
    byteSize: row.byte_size ?? 0,
    sourceSha: row.source_sha ?? undefined,
    updatedAt: row.updated_at,
  }
}

function requireString(value, errorMessage) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(errorMessage)
  }
  return value.trim()
}

function getOptionalTrimmed(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined
  }
  return value.trim()
}

module.exports = {
  createSystemDesignRepository,
  normalizeDocument,
}
