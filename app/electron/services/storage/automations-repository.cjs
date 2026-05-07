'use strict'

const VALID_SCOPES = new Set(['chat', 'code', 'docs', 'git', 'planning'])

function createAutomationsRepository(database) {
  const connection = database?.connection ?? database

  if (!connection?.prepare) {
    throw new Error('Conexao SQLite invalida para automations repository.')
  }

  return {
    list(options = {}) {
      const includeArchived = options.includeArchived === true
      const sql = includeArchived
        ? 'SELECT * FROM automations ORDER BY updated_at DESC'
        : 'SELECT * FROM automations WHERE archived_at IS NULL ORDER BY updated_at DESC'

      return connection.prepare(sql).all().map(mapAutomationRow)
    },
    get(automationId) {
      const row = connection
        .prepare('SELECT * FROM automations WHERE id = ? AND archived_at IS NULL')
        .get(requireAutomationId(automationId))

      return row ? mapAutomationRow(row) : null
    },
    save(automation) {
      const normalized = normalizeAutomation(automation)
      const now = new Date().toISOString()

      connection
        .prepare(
          `INSERT INTO automations (
             id,
             name,
             description,
             prompt,
             scope,
             is_default,
             created_at,
             updated_at,
             archived_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             description = excluded.description,
             prompt = excluded.prompt,
             scope = excluded.scope,
             is_default = excluded.is_default,
             updated_at = excluded.updated_at,
             archived_at = NULL`,
        )
        .run(
          normalized.id,
          normalized.name,
          normalized.description,
          normalized.prompt,
          normalized.scope,
          normalized.isDefault ? 1 : 0,
          normalized.createdAt ?? now,
          normalized.updatedAt ?? now,
        )

      return {
        ...normalized,
        createdAt: normalized.createdAt ?? now,
        updatedAt: normalized.updatedAt ?? now,
      }
    },
    delete(automationId) {
      const now = new Date().toISOString()
      const result = connection
        .prepare(
          `UPDATE automations
           SET archived_at = ?, updated_at = ?
           WHERE id = ? AND archived_at IS NULL`,
        )
        .run(now, now, requireAutomationId(automationId))

      return result.changes > 0
    },
  }
}

function normalizeAutomation(automation) {
  if (!automation || typeof automation !== 'object') {
    throw new Error('Automation invalida.')
  }

  const id = requireString(automation.id, 'ID de automation invalido.')
  const name = requireString(automation.name, 'Nome da automation invalido.')
  const description =
    typeof automation.description === 'string' ? automation.description : ''
  const prompt = requireString(automation.prompt, 'Prompt da automation invalido.')

  if (!VALID_SCOPES.has(automation.scope)) {
    throw new Error(`Scope de automation invalido: ${automation.scope}.`)
  }

  return {
    id,
    name,
    description,
    prompt,
    scope: automation.scope,
    isDefault: Boolean(automation.isDefault),
    createdAt: getOptionalIsoString(automation.createdAt),
    updatedAt: getOptionalIsoString(automation.updatedAt),
  }
}

function mapAutomationRow(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    prompt: row.prompt,
    scope: row.scope,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function requireAutomationId(automationId) {
  return requireString(automationId, 'ID de automation invalido.')
}

function requireString(value, errorMessage) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(errorMessage)
  }

  return value.trim()
}

function getOptionalIsoString(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined
  }

  return Number.isNaN(Date.parse(value)) ? undefined : value
}

module.exports = {
  createAutomationsRepository,
  normalizeAutomation,
  VALID_SCOPES,
}
