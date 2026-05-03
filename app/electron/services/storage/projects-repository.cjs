function createProjectsRepository(database) {
  const connection = database?.connection ?? database

  if (!connection?.prepare) {
    throw new Error('Conexao SQLite invalida para projects repository.')
  }

  return {
    list(options = {}) {
      const includeArchived = options.includeArchived === true
      const sql = includeArchived
        ? 'SELECT * FROM projects ORDER BY updated_at DESC'
        : 'SELECT * FROM projects WHERE archived_at IS NULL ORDER BY updated_at DESC'

      return connection.prepare(sql).all().map(mapProjectRow)
    },
    get(projectId) {
      const row = connection
        .prepare('SELECT * FROM projects WHERE id = ? AND archived_at IS NULL')
        .get(requireProjectId(projectId))

      return row ? mapProjectRow(row) : null
    },
    save(project) {
      const normalizedProject = normalizeProject(project)
      const now = new Date().toISOString()

      connection
        .prepare(
          `INSERT INTO projects (
             id,
             name,
             path,
             metadata_json,
             created_at,
             updated_at,
             archived_at
           )
           VALUES (?, ?, ?, '{}', ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             path = excluded.path,
             updated_at = excluded.updated_at,
             archived_at = NULL`,
        )
        .run(
          normalizedProject.id,
          normalizedProject.name,
          normalizedProject.path,
          now,
          now,
        )

      return normalizedProject
    },
    delete(projectId) {
      const result = connection
        .prepare('DELETE FROM projects WHERE id = ?')
        .run(requireProjectId(projectId))

      return result.changes > 0
    },
  }
}

function normalizeProject(project) {
  if (!project || typeof project !== 'object') {
    throw new Error('Projeto invalido.')
  }

  return {
    id: requireProjectId(project.id),
    name: requireString(project.name, 'Nome de projeto invalido.'),
    path: requireString(project.path, 'Caminho de projeto invalido.'),
  }
}

function mapProjectRow(row) {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
  }
}

function requireProjectId(projectId) {
  return requireString(projectId, 'ID de projeto invalido.')
}

function requireString(value, errorMessage) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(errorMessage)
  }

  return value.trim()
}

module.exports = {
  createProjectsRepository,
  normalizeProject,
}
