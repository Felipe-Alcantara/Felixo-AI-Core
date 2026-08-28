'use strict'

const {
  normalizeAccountInput,
  normalizeSample,
} = require('../agent-usage-model.cjs')

function createAgentUsageRepository(database) {
  const connection = database?.connection ?? database

  if (!connection?.prepare) {
    throw new Error('Conexao SQLite invalida para agent usage repository.')
  }

  return {
    listAccounts() {
      const accounts = connection
        .prepare(
          `SELECT *
           FROM agent_usage_accounts
           WHERE archived_at IS NULL
           ORDER BY provider_id ASC, created_at ASC, id ASC`,
        )
        .all()

      return accounts.map((row) => mapAccountRow(row))
    },

    getAccount(accountId) {
      const row = connection
        .prepare(
          `SELECT *
           FROM agent_usage_accounts
           WHERE id = ? AND archived_at IS NULL`,
        )
        .get(requireString(accountId, 'ID da conta de agente invalido.'))

      return row ? mapAccountRow(row) : null
    },

    createAccount(account) {
      const normalized = normalizeAccountInput(account)
      const now = normalized.createdAt ?? new Date().toISOString()
      const updatedAt = normalized.updatedAt ?? now

      connection
        .prepare(
          `INSERT INTO agent_usage_accounts (
             id,
             provider_id,
             label,
             identity_key,
             identity_display,
             identity_source,
             created_at,
             updated_at,
             archived_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        )
        .run(
          normalized.id,
          normalized.providerId,
          normalized.label,
          normalized.identityKey,
          normalized.identityDisplay,
          normalized.identitySource,
          now,
          updatedAt,
        )

      return this.getAccount(normalized.id)
    },

    updateIdentity(accountId, identity) {
      const normalizedAccountId = requireString(
        accountId,
        'ID da conta de agente invalido.',
      )
      const identityKey = normalizeIdentityKey(identity?.identityKey)
      const identityDisplay = normalizeOptionalString(identity?.identityDisplay, 120)

      connection
        .prepare(
          `UPDATE agent_usage_accounts
           SET identity_key = ?,
               identity_display = ?,
               identity_source = ?,
               updated_at = ?
           WHERE id = ? AND archived_at IS NULL`,
        )
        .run(
          identityKey,
          identityDisplay,
          identityKey ? identity.source ?? 'cli' : null,
          new Date().toISOString(),
          normalizedAccountId,
        )

      return this.getAccount(normalizedAccountId)
    },

    findAccountByIdentity(providerId, identityKey, options = {}) {
      const normalizedProviderId = requireString(
        providerId,
        'Provider da conta de agente invalido.',
      )
      const normalizedIdentityKey = normalizeIdentityKey(identityKey)

      if (!normalizedIdentityKey) {
        return null
      }

      const excludedId = normalizeOptionalString(options.excludeId, 120)
      const row = connection
        .prepare(
          `SELECT *
           FROM agent_usage_accounts
           WHERE provider_id = ?
             AND identity_key = ?
             AND archived_at IS NULL
             AND (? IS NULL OR id != ?)
           LIMIT 1`,
        )
        .get(
          normalizedProviderId,
          normalizedIdentityKey,
          excludedId,
          excludedId,
        )

      return row ? mapAccountRow(row) : null
    },

    saveSample(sample) {
      const normalized = normalizeSample(sample)

      connection
        .prepare(
          `INSERT INTO agent_usage_samples (
             id,
             account_id,
             status,
             source_kind,
             source_label,
             source_command,
             source_url,
             collected_at,
             metrics_json,
             observed_identity_key,
             observed_identity_display,
             error_message,
             metadata_json
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          normalized.id,
          normalized.accountId,
          normalized.status,
          normalized.sourceKind,
          normalized.sourceLabel,
          normalized.sourceCommand,
          normalized.sourceUrl,
          normalized.collectedAt,
          JSON.stringify(normalized.metrics),
          normalized.observedIdentityKey,
          normalized.observedIdentityDisplay,
          normalized.errorMessage,
          JSON.stringify(normalized.metadata),
        )

      return normalized
    },

    listSamples(accountId, options = {}) {
      const limit = clampLimit(options.limit, 50)
      const rows = connection
        .prepare(
          `SELECT *
           FROM agent_usage_samples
           WHERE account_id = ?
           ORDER BY collected_at DESC, id DESC
           LIMIT ?`,
        )
        .all(requireString(accountId, 'ID da conta de agente invalido.'), limit)

      return rows.map((row) => mapSampleRow(row))
    },

    getLatestSample(accountId) {
      const row = connection
        .prepare(
          `SELECT *
           FROM agent_usage_samples
           WHERE account_id = ?
           ORDER BY collected_at DESC, id DESC
           LIMIT 1`,
        )
        .get(requireString(accountId, 'ID da conta de agente invalido.'))

      return row ? mapSampleRow(row) : null
    },

    getLastAvailableSample(accountId) {
      const row = connection
        .prepare(
          `SELECT *
           FROM agent_usage_samples
           WHERE account_id = ?
             AND status IN ('current', 'stale')
             AND metrics_json != '[]'
           ORDER BY collected_at DESC, id DESC
           LIMIT 1`,
        )
        .get(requireString(accountId, 'ID da conta de agente invalido.'))

      return row ? mapSampleRow(row) : null
    },

    archiveAccount(accountId) {
      const normalizedAccountId = requireString(
        accountId,
        'ID da conta de agente invalido.',
      )
      const result = connection
        .prepare(
          `UPDATE agent_usage_accounts
           SET archived_at = ?, updated_at = ?
           WHERE id = ? AND archived_at IS NULL`,
        )
        .run(new Date().toISOString(), new Date().toISOString(), normalizedAccountId)

      return result.changes > 0
    },
  }
}

function mapAccountRow(row) {
  return {
    id: row.id,
    providerId: row.provider_id,
    label: row.label,
    identityKey: row.identity_key ?? null,
    identityDisplay: row.identity_display ?? null,
    identitySource: row.identity_source ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapSampleRow(row) {
  return {
    id: row.id,
    accountId: row.account_id,
    status: row.status,
    sourceKind: row.source_kind,
    sourceLabel: row.source_label,
    sourceCommand: row.source_command ?? null,
    sourceUrl: row.source_url ?? null,
    collectedAt: row.collected_at,
    metrics: parseJsonArray(row.metrics_json),
    observedIdentityKey: row.observed_identity_key ?? null,
    observedIdentityDisplay: row.observed_identity_display ?? null,
    errorMessage: row.error_message ?? null,
    metadata: parseJsonObject(row.metadata_json),
  }
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {}
  } catch {
    return {}
  }
}

function normalizeIdentityKey(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : null
}

function normalizeOptionalString(value, maxLength) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maxLength)
    : null
}

function requireString(value, message) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(message)
  }

  return value.trim()
}

function clampLimit(value, fallback) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 && number <= 200
    ? number
    : fallback
}

module.exports = {
  createAgentUsageRepository,
  mapAccountRow,
  mapSampleRow,
}
