/**
 * @module storage/webview-profiles-repository
 * Perfis do navegador interno criados pela pessoa. O perfil "Padrão" é a
 * partição antiga e não é gravado aqui (ver a migration 016).
 */

const { isValidProfileId } = require('../webview-profile-partition.cjs')

const NAME_MAX = 40
const VALID_COLORS = new Set(['sky', 'emerald', 'amber', 'rose', 'violet', 'zinc'])

function createWebviewProfilesRepository(database) {
  const connection = database?.connection ?? database

  if (!connection?.prepare) {
    throw new Error('Conexao SQLite invalida para webview profiles repository.')
  }

  function list() {
    return connection
      .prepare('SELECT * FROM webview_profiles WHERE archived_at IS NULL ORDER BY created_at ASC, id ASC')
      .all()
      .map(mapRow)
  }

  return {
    list,
    get(id) {
      return list().find((profile) => profile.id === id) ?? null
    },
    findByName(name) {
      const wanted = typeof name === 'string' ? name.trim().toLowerCase() : ''
      return wanted ? list().find((profile) => profile.name.toLowerCase() === wanted) ?? null : null
    },
    save(profile) {
      const normalized = normalize(profile)
      const clash = list().find(
        (item) => item.id !== normalized.id && item.name.toLowerCase() === normalized.name.toLowerCase(),
      )
      if (clash) {
        throw new Error(`Ja existe um perfil chamado "${clash.name}".`)
      }
      const now = new Date().toISOString()

      connection
        .prepare(
          `INSERT INTO webview_profiles (id, name, color, created_at, updated_at, archived_at)
           VALUES (?, ?, ?, ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             color = excluded.color,
             updated_at = excluded.updated_at,
             archived_at = NULL`,
        )
        .run(normalized.id, normalized.name, normalized.color ?? null, now, now)

      return normalized
    },
    delete(id) {
      const now = new Date().toISOString()
      const result = connection
        .prepare(
          `UPDATE webview_profiles
           SET archived_at = ?, updated_at = ?
           WHERE id = ? AND archived_at IS NULL`,
        )
        .run(now, now, requireProfileId(id))

      return result.changes > 0
    },
  }
}

function normalize(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error('Perfil invalido.')
  }
  const id = requireProfileId(profile.id)
  const name = typeof profile.name === 'string' ? profile.name.trim() : ''
  if (!name) throw new Error('Nome de perfil invalido.')
  if (name.length > NAME_MAX) throw new Error(`O nome do perfil pode ter ate ${NAME_MAX} caracteres.`)
  const color = VALID_COLORS.has(profile.color) ? profile.color : undefined
  return { id, name, ...(color ? { color } : {}) }
}

function requireProfileId(id) {
  if (!isValidProfileId(id)) throw new Error('ID de perfil invalido.')
  return id
}

function mapRow(row) {
  return {
    id: row.id,
    name: row.name,
    ...(VALID_COLORS.has(row.color) ? { color: row.color } : {}),
  }
}

module.exports = { createWebviewProfilesRepository, NAME_MAX }
