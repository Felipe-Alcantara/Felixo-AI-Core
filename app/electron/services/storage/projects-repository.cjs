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
      const metadataJson = buildMetadataJson(normalizedProject)

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
           VALUES (?, ?, ?, ?, ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             path = excluded.path,
             metadata_json = excluded.metadata_json,
             updated_at = excluded.updated_at,
             archived_at = NULL`,
        )
        .run(
          normalizedProject.id,
          normalizedProject.name,
          normalizedProject.path,
          metadataJson,
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
    instructions: typeof project.instructions === 'string' ? project.instructions : undefined,
    docsDirectory: typeof project.docsDirectory === 'string' ? project.docsDirectory.trim() : undefined,
  }
}

function mapProjectRow(row) {
  const metadata = safeParseJson(row.metadata_json)

  return {
    id: row.id,
    name: row.name,
    path: row.path,
    instructions: metadata.instructions || undefined,
    docsDirectory: metadata.docsDirectory || undefined,
  }
}

function safeParseJson(value) {
  try {
    return JSON.parse(value || '{}')
  } catch {
    return {}
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

function buildMetadataJson(project) {
  const metadata = {}

  if (project.instructions) {
    metadata.instructions = project.instructions
  }

  if (project.docsDirectory) {
    metadata.docsDirectory = project.docsDirectory
  }

  return JSON.stringify(metadata)
}

module.exports = {
  createProjectsRepository,
  normalizeProject,
}
