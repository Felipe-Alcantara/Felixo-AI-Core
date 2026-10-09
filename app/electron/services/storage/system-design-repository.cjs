'use strict'

/**
 * Índice de documentos do System Design, um por FONTE (migração 018).
 *
 * `forSource(key)` devolve a mesma API que o serviço de sincronização já usava
 * (`list`/`get`/`save`/`deleteMissing`/`clear`), restrita a uma fonte: o serviço
 * não precisa saber que existem outras. A tabela antiga
 * (`system_design_documents`, de antes da lista de guias) só é lida por
 * `migrateLegacyDocuments`.
 */
function createSystemDesignRepository(database) {
  const connection = database?.connection ?? database

  if (!connection?.prepare) {
    throw new Error('Conexão SQLite inválida para o repositório do System Design.')
  }

  function forSource(sourceKey) {
    const key = requireString(sourceKey, 'Fonte do System Design inválida.')

    return {
      list() {
        return connection
          .prepare(
            `SELECT path, title, summary, byte_size, source_sha, updated_at
             FROM system_design_source_documents
             WHERE source_key = ?
             ORDER BY path ASC`,
          )
          .all(key)
          .map(mapDocumentSummaryRow)
      },
      get(documentPath) {
        const row = connection
          .prepare('SELECT * FROM system_design_source_documents WHERE source_key = ? AND path = ?')
          .get(key, requireString(documentPath, 'Caminho do documento inválido.'))

        return row ? mapDocumentRow(row) : null
      },
      save(document) {
        const normalized = normalizeDocument(document)
        const now = new Date().toISOString()

        connection
          .prepare(
            `INSERT INTO system_design_source_documents (
               source_key,
               path,
               title,
               summary,
               content,
               byte_size,
               source_sha,
               metadata_json,
               updated_at
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?)
             ON CONFLICT(source_key, path) DO UPDATE SET
               title = excluded.title,
               summary = excluded.summary,
               content = excluded.content,
               byte_size = excluded.byte_size,
               source_sha = excluded.source_sha,
               updated_at = excluded.updated_at`,
          )
          .run(
            key,
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
        const stale = connection
          .prepare('SELECT path FROM system_design_source_documents WHERE source_key = ?')
          .all(key)
          .filter((row) => !set.has(row.path))
        const stmt = connection.prepare(
          'DELETE FROM system_design_source_documents WHERE source_key = ? AND path = ?',
        )
        let removed = 0
        for (const row of stale) {
          removed += stmt.run(key, row.path).changes ?? 0
        }
        return removed
      },
      clear() {
        return (
          connection
            .prepare('DELETE FROM system_design_source_documents WHERE source_key = ?')
            .run(key).changes ?? 0
        )
      },
    }
  }

  return {
    forSource,
    /** Fontes que têm algum documento no índice. */
    listSourceKeys() {
      return connection
        .prepare('SELECT DISTINCT source_key FROM system_design_source_documents ORDER BY source_key ASC')
        .all()
        .map((row) => row.source_key)
    },
    /** Limpa o índice de todas as fontes (e o resto da tabela antiga, se houver). */
    clearAll() {
      const current = connection.prepare('DELETE FROM system_design_source_documents').run().changes ?? 0
      const legacy = connection.prepare('DELETE FROM system_design_documents').run().changes ?? 0
      return current + legacy
    },
    /**
     * Move os documentos da tabela antiga para a fonte `sourceKey` — a fonte
     * entregue antes da lista de guias. Idempotente: com a tabela antiga vazia
     * não faz nada, e não sobrescreve um documento que a fonte já tenha.
     *
     * @returns {number} documentos movidos
     */
    migrateLegacyDocuments(sourceKey) {
      const key = requireString(sourceKey, 'Fonte do System Design inválida.')
      connection.exec('BEGIN IMMEDIATE')
      try {
        const moved =
          connection
            .prepare(
              `INSERT OR IGNORE INTO system_design_source_documents (
                 source_key, path, title, summary, content, byte_size, source_sha, metadata_json, updated_at
               )
               SELECT ?, path, title, summary, content, byte_size, source_sha, metadata_json, updated_at
               FROM system_design_documents`,
            )
            .run(key).changes ?? 0
        connection.prepare('DELETE FROM system_design_documents').run()
        connection.exec('COMMIT')
        return moved
      } catch (error) {
        connection.exec('ROLLBACK')
        throw error
      }
    },
    /** Quantos documentos ainda estão na tabela antiga (0 depois da migração). */
    countLegacyDocuments() {
      return connection.prepare('SELECT COUNT(*) AS total FROM system_design_documents').get().total
    },
  }
}

function normalizeDocument(document) {
  if (!document || typeof document !== 'object') {
    throw new Error('Documento inválido.')
  }

  const path = requireString(document.path, 'Caminho do documento inválido.')
  const title = requireString(document.title, 'Título do documento inválido.')
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
