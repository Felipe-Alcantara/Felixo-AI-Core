function createSettingsRepository(database) {
  const connection = database?.connection ?? database

  if (!connection?.prepare) {
    throw new Error('Conexao SQLite invalida para settings repository.')
  }

  return {
    get(key) {
      const row = connection
        .prepare('SELECT value_json FROM settings WHERE key = ?')
        .get(requireSettingsKey(key))

      if (!row) {
        return null
      }

      return parseSettingsValue(row.value_json)
    },
    set(key, value) {
      const normalizedKey = requireSettingsKey(key)
      const valueJson = serializeSettingsValue(value)
      const now = new Date().toISOString()

      connection
        .prepare(
          `INSERT INTO settings (key, value_json, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET
             value_json = excluded.value_json,
             updated_at = excluded.updated_at`,
        )
        .run(normalizedKey, valueJson, now)

      return value
    },
    delete(key) {
      connection
        .prepare('DELETE FROM settings WHERE key = ?')
        .run(requireSettingsKey(key))
    },
    listKeys() {
      return connection
        .prepare('SELECT key FROM settings ORDER BY key ASC')
        .all()
        .map((row) => row.key)
    },
  }
}

function requireSettingsKey(key) {
  if (typeof key !== 'string' || !key.trim()) {
    throw new Error('Chave de configuracao invalida.')
  }

  return key.trim()
}

function serializeSettingsValue(value) {
  if (typeof value === 'undefined') {
    throw new Error('Valor de configuracao nao pode ser undefined.')
  }

  return JSON.stringify(value)
}

function parseSettingsValue(valueJson) {
  try {
    return JSON.parse(valueJson)
  } catch {
    throw new Error('Valor JSON de configuracao invalido no banco.')
  }
}

module.exports = {
  createSettingsRepository,
  parseSettingsValue,
  requireSettingsKey,
  serializeSettingsValue,
}
