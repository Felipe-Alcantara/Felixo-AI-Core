'use strict'

const VALID_CLI_TYPES = new Set([
  'claude',
  'codex',
  'codex-app-server',
  'gemini',
  'gemini-acp',
  'unknown',
])

const VALID_REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max'])

function createModelsRepository(database) {
  const connection = database?.connection ?? database

  if (!connection?.prepare) {
    throw new Error('Conexao SQLite invalida para models repository.')
  }

  return {
    list(options = {}) {
      const includeArchived = options.includeArchived === true
      const sql = includeArchived
        ? 'SELECT * FROM models ORDER BY updated_at DESC'
        : 'SELECT * FROM models WHERE archived_at IS NULL ORDER BY updated_at DESC'

      return connection.prepare(sql).all().map(mapModelRow)
    },
    get(modelId) {
      const row = connection
        .prepare('SELECT * FROM models WHERE id = ? AND archived_at IS NULL')
        .get(requireString(modelId, 'ID de modelo invalido.'))

      return row ? mapModelRow(row) : null
    },
    save(model) {
      const normalized = normalizeModel(model)
      const now = new Date().toISOString()

      connection
        .prepare(
          `INSERT INTO models (
             id,
             name,
             command,
             source,
             cli_type,
             provider_model,
             reasoning_effort,
             metadata_json,
             created_at,
             updated_at,
             archived_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             command = excluded.command,
             source = excluded.source,
             cli_type = excluded.cli_type,
             provider_model = excluded.provider_model,
             reasoning_effort = excluded.reasoning_effort,
             updated_at = excluded.updated_at,
             archived_at = NULL`,
        )
        .run(
          normalized.id,
          normalized.name,
          normalized.command,
          normalized.source,
          normalized.cliType,
          normalized.providerModel ?? null,
          normalized.reasoningEffort ?? null,
          now,
          now,
        )

      return normalized
    },
    delete(modelId) {
      const now = new Date().toISOString()
      const result = connection
        .prepare(
          `UPDATE models
           SET archived_at = ?, updated_at = ?
           WHERE id = ? AND archived_at IS NULL`,
        )
        .run(now, now, requireString(modelId, 'ID de modelo invalido.'))

      return result.changes > 0
    },
  }
}

function normalizeModel(model) {
  if (!model || typeof model !== 'object') {
    throw new Error('Modelo invalido.')
  }

  const id = requireString(model.id, 'ID de modelo invalido.')
  const name = requireString(model.name, 'Nome de modelo invalido.')
  const command = requireString(model.command, 'Command do modelo invalido.')
  const source = requireString(model.source, 'Source do modelo invalido.')
  const cliType = VALID_CLI_TYPES.has(model.cliType) ? model.cliType : 'unknown'
  const providerModel = getOptionalTrimmed(model.providerModel)
  const reasoningEffort = VALID_REASONING_EFFORTS.has(model.reasoningEffort)
    ? model.reasoningEffort
    : undefined

  return {
    id,
    name,
    command,
    source,
    cliType,
    providerModel,
    reasoningEffort,
  }
}

function mapModelRow(row) {
  return {
    id: row.id,
    name: row.name,
    command: row.command,
    source: row.source,
    cliType: row.cli_type,
    providerModel: row.provider_model ?? undefined,
    reasoningEffort: row.reasoning_effort ?? undefined,
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
  createModelsRepository,
  normalizeModel,
  VALID_CLI_TYPES,
  VALID_REASONING_EFFORTS,
}
