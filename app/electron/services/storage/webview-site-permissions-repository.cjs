/**
 * @module storage/webview-site-permissions-repository
 * Decisões de permissão dos sites nos blocos Página Web, por perfil do
 * navegador e origem (migration 023). Só guarda o que a pessoa respondeu.
 */

const DECISIONS = new Set(['granted', 'denied'])

function createWebviewSitePermissionsRepository(database) {
  const connection = database?.connection ?? database

  if (!connection?.prepare) {
    throw new Error('Conexao SQLite invalida para webview site permissions repository.')
  }

  return {
    /** `'granted'`, `'denied'` ou `null` (sem decisão: o site pergunta). */
    get(profileId, origin, permission) {
      const row = connection
        .prepare('SELECT decision FROM webview_site_permissions WHERE profile_id = ? AND origin = ? AND permission = ?')
        .get(profileId, origin, permission)
      return row && DECISIONS.has(row.decision) ? row.decision : null
    },
    set({ profileId, origin, permission, decision, nowIso = new Date().toISOString() }) {
      if (!DECISIONS.has(decision)) throw new Error('Decisao de permissao invalida.')
      connection
        .prepare(
          `INSERT INTO webview_site_permissions (profile_id, origin, permission, decision, decided_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(profile_id, origin, permission) DO UPDATE SET
             decision = excluded.decision,
             decided_at = excluded.decided_at`,
        )
        .run(profileId, origin, permission, decision, nowIso)
    },
    list(profileId) {
      const rows = profileId
        ? connection
            .prepare('SELECT * FROM webview_site_permissions WHERE profile_id = ? ORDER BY origin, permission')
            .all(profileId)
        : connection.prepare('SELECT * FROM webview_site_permissions ORDER BY profile_id, origin, permission').all()
      return rows.map((row) => ({
        profileId: row.profile_id,
        origin: row.origin,
        permission: row.permission,
        decision: row.decision,
        decidedAt: row.decided_at,
      }))
    },
    /** Sem `permission`, revoga tudo do site naquele perfil. Devolve quantas saíram. */
    revoke({ profileId, origin, permission }) {
      const result = permission
        ? connection
            .prepare('DELETE FROM webview_site_permissions WHERE profile_id = ? AND origin = ? AND permission = ?')
            .run(profileId, origin, permission)
        : connection.prepare('DELETE FROM webview_site_permissions WHERE profile_id = ? AND origin = ?').run(profileId, origin)
      return Number(result.changes ?? 0)
    },
    deleteProfile(profileId) {
      return Number(
        connection.prepare('DELETE FROM webview_site_permissions WHERE profile_id = ?').run(profileId).changes ?? 0,
      )
    },
  }
}

module.exports = { createWebviewSitePermissionsRepository }
