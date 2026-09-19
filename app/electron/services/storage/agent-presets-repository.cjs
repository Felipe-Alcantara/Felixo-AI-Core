/**
 * @module storage/agent-presets-repository
 * Persistência dos presets de agente criados pela pessoa.
 *
 * Os presets nativos moram no código (atualizam com o app e não se editam).
 * Aqui ficam só os da pessoa. O repositório guarda o objeto como veio — quem
 * conhece o formato e sabe reparar valores antigos é o renderer
 * (`agent-preset.ts`); aqui só valem os limites que protegem o banco.
 */

const MAX_DATA_BYTES = 128 * 1024

function createAgentPresetsRepository(database) {
  const connection = database?.connection ?? database

  if (!connection?.prepare) {
    throw new Error('Conexao SQLite invalida para agent presets repository.')
  }

  return {
    list() {
      return connection
        .prepare(
          'SELECT * FROM agent_presets WHERE archived_at IS NULL ORDER BY created_at ASC, id ASC',
        )
        .all()
        .map(mapRow)
        .filter(Boolean)
    },
    save(preset) {
      const normalized = normalizeForStorage(preset)
      const now = new Date().toISOString()

      connection
        .prepare(
          `INSERT INTO agent_presets (id, name, data_json, created_at, updated_at, archived_at)
           VALUES (?, ?, ?, ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             data_json = excluded.data_json,
             updated_at = excluded.updated_at,
             archived_at = NULL`,
        )
        .run(normalized.id, normalized.name, JSON.stringify(normalized), now, now)

      return normalized
    },
    delete(presetId) {
      const now = new Date().toISOString()
      const result = connection
        .prepare(
          `UPDATE agent_presets
           SET archived_at = ?, updated_at = ?
           WHERE id = ? AND archived_at IS NULL`,
        )
        .run(now, now, requireString(presetId, 'ID de preset invalido.'))

      return result.changes > 0
    },
  }
}

function normalizeForStorage(preset) {
  if (!preset || typeof preset !== 'object' || Array.isArray(preset)) {
    throw new Error('Preset invalido.')
  }

  const id = requireString(preset.id, 'ID de preset invalido.')
  const name = requireString(preset.name, 'Nome de preset invalido.')

  // Preset nativo mora no código: gravá-lo no banco criaria uma cópia que
  // ficaria velha quando o app atualizasse o original.
  if (id.startsWith('native:') || preset.native === true) {
    throw new Error('Presets nativos nao sao gravados no banco; duplique para editar.')
  }

  const data = { ...preset, id, name }
  if (Buffer.byteLength(JSON.stringify(data), 'utf8') > MAX_DATA_BYTES) {
    throw new Error('Preset grande demais.')
  }
  return data
}

function mapRow(row) {
  try {
    const data = JSON.parse(row.data_json)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    return { ...data, id: row.id, name: row.name }
  } catch {
    // Uma linha corrompida não pode esconder os outros presets da pessoa.
    return null
  }
}

function requireString(value, message) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(message)
  }
  return value.trim()
}

module.exports = { createAgentPresetsRepository, MAX_DATA_BYTES }
