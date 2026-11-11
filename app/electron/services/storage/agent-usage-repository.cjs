'use strict'

const {
  normalizeAccountInput,
  normalizeSample,
} = require('../agent-usage-model.cjs')

// Retenção das amostras (decisão de 11/11/2026): por conta, as 200 mais recentes (o teto do
// `listSamples`; nada lê além delas) e sempre a última com métrica, que o painel mostra como
// "último valor conhecido" mesmo depois de uma fileira de falhas. Antes a tabela só crescia
// (46.502 linhas e ~62 MB do banco de 69 MB nesta máquina em 11/11/2026).
const SAMPLES_RETENTION_PER_ACCOUNT = 200
// A primeira poda depois desta mudança tira dezenas de milhares de linhas; só uma poda desse
// tamanho compacta o arquivo (VACUUM, ~0,8 s medidos), e as seguintes quase não tiram nada.
const VACUUM_AFTER_DELETED_SAMPLES = 5_000
const PRUNE_ACCOUNT_SAMPLES_SQL = `DELETE FROM agent_usage_samples
  WHERE account_id = ?
    AND rowid NOT IN (
      SELECT rowid FROM agent_usage_samples WHERE account_id = ?
      ORDER BY collected_at DESC, rowid DESC LIMIT ?
    )
    AND rowid IS NOT (
      SELECT rowid FROM agent_usage_samples
      WHERE account_id = ? AND status IN ('current', 'stale') AND metrics_json != '[]'
      ORDER BY collected_at DESC, rowid DESC LIMIT 1
    )`

function createAgentUsageRepository(database) {
  const connection = database?.connection ?? database

  if (!connection?.prepare) {
    throw new Error('Conexao SQLite invalida para agent usage repository.')
  }

  /** @returns {number} Quantas amostras da conta saíram. */
  function pruneAccountSamples(accountId) {
    return Number(
      connection
        .prepare(PRUNE_ACCOUNT_SAMPLES_SQL)
        .run(accountId, accountId, SAMPLES_RETENTION_PER_ACCOUNT, accountId).changes,
    )
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
      // ~0,14 ms por gravação numa conta já podada.
      pruneAccountSamples(normalized.accountId)

      return normalized
    },

    /**
     * Leitura repetida: a mesma amostra confirma o valor com o horário novo da medição
     * (`metadata.measuredAt`), em vez de virar outra linha igual.
     */
    updateSampleMetadata(sampleId, metadata) {
      connection
        .prepare('UPDATE agent_usage_samples SET metadata_json = ? WHERE id = ?')
        .run(
          JSON.stringify(metadata && typeof metadata === 'object' ? metadata : {}),
          requireString(sampleId, 'ID da amostra de uso invalido.'),
        )
    },

    /**
     * Poda todas as contas (a retenção de cada gravação só alcança a conta gravada) e, depois de
     * uma poda grande, compacta o arquivo. Roda no boot, antes da janela: síncrono no processo
     * principal, 1,3 s + 0,8 s medidos na primeira vez com o banco desta máquina.
     *
     * @returns {{ deleted: number, vacuumed: boolean }}
     */
    maintainSamples({ vacuumAfter = VACUUM_AFTER_DELETED_SAMPLES } = {}) {
      const accountIds = connection
        .prepare('SELECT DISTINCT account_id FROM agent_usage_samples')
        .all()
        .map((row) => row.account_id)
      let deleted = 0

      connection.exec('BEGIN IMMEDIATE')
      try {
        for (const accountId of accountIds) {
          deleted += pruneAccountSamples(accountId)
        }
        connection.exec('COMMIT')
      } catch (error) {
        connection.exec('ROLLBACK')
        throw error
      }

      const vacuumed = deleted >= vacuumAfter
      if (vacuumed) {
        connection.exec('VACUUM')
      }
      return { deleted, vacuumed }
    },

    listSamples(accountId, options = {}) {
      const limit = clampLimit(options.limit, 50)
      const rows = connection
        .prepare(
          `SELECT *
           FROM agent_usage_samples
           WHERE account_id = ?
           ORDER BY collected_at DESC, rowid DESC
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
           ORDER BY collected_at DESC, rowid DESC
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
           ORDER BY collected_at DESC, rowid DESC
           LIMIT 1`,
        )
        .get(requireString(accountId, 'ID da conta de agente invalido.'))

      return row ? mapSampleRow(row) : null
    },

    mergeAccountIds({ canonicalId, duplicateIds, nowIso = new Date().toISOString() }) {
      const targetId = requireString(canonicalId, 'ID canônico da conta inválido.')
      const mergedIds = [
        ...new Set(
          (Array.isArray(duplicateIds) ? duplicateIds : [])
            .filter((accountId) => typeof accountId === 'string' && accountId.trim())
            .map((accountId) => accountId.trim())
            .filter((accountId) => accountId !== targetId),
        ),
      ]

      if (mergedIds.length === 0) {
        return { accounts: 0, samples: 0 }
      }

      connection.exec('BEGIN IMMEDIATE')
      try {
        let accounts = 0
        let samples = 0

        for (const duplicateId of mergedIds) {
          const duplicate = connection
            .prepare(
              `SELECT * FROM agent_usage_accounts
               WHERE id = ? AND archived_at IS NULL`,
            )
            .get(duplicateId)
          if (!duplicate) continue

          let canonical = connection
            .prepare(
              `SELECT * FROM agent_usage_accounts
               WHERE id = ? AND archived_at IS NULL`,
            )
            .get(targetId)

          if (!canonical) {
            try {
              connection
                .prepare(
                  `INSERT INTO agent_usage_accounts
                     (id, provider_id, label, identity_key, identity_display, identity_source, created_at, updated_at, archived_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
                )
                .run(
                  targetId,
                  duplicate.provider_id,
                  duplicate.label,
                  duplicate.identity_key,
                  duplicate.identity_display,
                  duplicate.identity_source,
                  duplicate.created_at,
                  nowIso,
                )
            } catch {
              connection
                .prepare(
                  `INSERT INTO agent_usage_accounts
                     (id, provider_id, label, identity_key, identity_display, identity_source, created_at, updated_at, archived_at)
                   VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, NULL)`,
                )
                .run(targetId, duplicate.provider_id, duplicate.label, null, duplicate.created_at, nowIso)
            }
            canonical = connection
              .prepare('SELECT * FROM agent_usage_accounts WHERE id = ? AND archived_at IS NULL')
              .get(targetId)
          } else if (!canonical.identity_key && duplicate.identity_key) {
            const conflict = connection
              .prepare(
                `SELECT id FROM agent_usage_accounts
                 WHERE provider_id = ? AND identity_key = ? AND archived_at IS NULL AND id != ?`,
              )
              .get(canonical.provider_id, duplicate.identity_key, targetId)
            if (!conflict) {
              connection
                .prepare(
                  `UPDATE agent_usage_accounts
                   SET identity_key = ?, identity_display = ?, identity_source = ?, updated_at = ?
                   WHERE id = ?`,
                )
                .run(
                  duplicate.identity_key,
                  duplicate.identity_display,
                  duplicate.identity_source,
                  nowIso,
                  targetId,
                )
            }
          }

          samples += Number(
            connection
              .prepare('UPDATE agent_usage_samples SET account_id = ? WHERE account_id = ?')
              .run(targetId, duplicateId).changes,
          )
          accounts += Number(
            connection
              .prepare(
                `UPDATE agent_usage_accounts
                 SET archived_at = ?, updated_at = ?
                 WHERE id = ? AND archived_at IS NULL`,
              )
              .run(nowIso, nowIso, duplicateId).changes,
          )
        }

        connection.exec('COMMIT')
        return { accounts, samples }
      } catch (error) {
        try {
          connection.exec('ROLLBACK')
        } catch {}
        throw error
      }
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
  SAMPLES_RETENTION_PER_ACCOUNT,
  createAgentUsageRepository,
  mapAccountRow,
  mapSampleRow,
}
