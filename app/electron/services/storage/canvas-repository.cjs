/**
 * @module storage/canvas-repository
 * Persistence for canvas nodes (terminal / note) and their layout.
 *
 * Mirrors the project's repository convention: a factory returning
 * list/save/delete, soft-delete via `archived_at`, and explicit row<->object
 * mapping. Node-specific payload lives in `data_json`; position and size are
 * first-class columns so layout queries stay simple.
 */

const NODE_TYPES = new Set(['terminal', 'note', 'group', 'file'])

function createCanvasRepository(database) {
  const connection = database?.connection ?? database

  if (!connection?.prepare) {
    throw new Error('Conexao SQLite invalida para canvas repository.')
  }

  return {
    list(options = {}) {
      const includeArchived = options.includeArchived === true
      const sql = includeArchived
        ? 'SELECT * FROM canvas_nodes ORDER BY updated_at ASC'
        : 'SELECT * FROM canvas_nodes WHERE archived_at IS NULL ORDER BY updated_at ASC'

      return connection.prepare(sql).all().map(mapNodeRow)
    },
    save(node) {
      const normalizedNode = normalizeNode(node)

      connection
        .prepare(
          `INSERT INTO canvas_nodes (
             id,
             type,
             parent_id,
             position_x,
             position_y,
             width,
             height,
             data_json,
             created_at,
             updated_at,
             archived_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET
             type = excluded.type,
             parent_id = excluded.parent_id,
             position_x = excluded.position_x,
             position_y = excluded.position_y,
             width = excluded.width,
             height = excluded.height,
             data_json = excluded.data_json,
             updated_at = excluded.updated_at,
             archived_at = NULL`,
        )
        .run(
          normalizedNode.id,
          normalizedNode.type,
          normalizedNode.parentId,
          normalizedNode.position.x,
          normalizedNode.position.y,
          normalizedNode.width,
          normalizedNode.height,
          JSON.stringify(normalizedNode.data),
          normalizedNode.createdAt,
          normalizedNode.updatedAt,
        )

      return normalizedNode
    },
    delete(nodeId) {
      const now = new Date().toISOString()
      const result = connection
        .prepare(
          `UPDATE canvas_nodes
           SET archived_at = ?, updated_at = ?
           WHERE id = ? AND archived_at IS NULL`,
        )
        .run(now, now, requireNodeId(nodeId))

      return result.changes > 0
    },
    listEdges() {
      return connection
        .prepare(
          'SELECT * FROM canvas_edges WHERE archived_at IS NULL ORDER BY updated_at ASC',
        )
        .all()
        .map(mapEdgeRow)
    },
    saveEdge(edge) {
      const normalizedEdge = normalizeEdge(edge)

      connection
        .prepare(
          `INSERT INTO canvas_edges (id, source, target, created_at, updated_at, archived_at)
           VALUES (?, ?, ?, ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET
             source = excluded.source,
             target = excluded.target,
             updated_at = excluded.updated_at,
             archived_at = NULL`,
        )
        .run(
          normalizedEdge.id,
          normalizedEdge.source,
          normalizedEdge.target,
          normalizedEdge.createdAt,
          normalizedEdge.updatedAt,
        )

      return normalizedEdge
    },
    deleteEdge(edgeId) {
      const now = new Date().toISOString()
      const result = connection
        .prepare(
          `UPDATE canvas_edges
           SET archived_at = ?, updated_at = ?
           WHERE id = ? AND archived_at IS NULL`,
        )
        .run(now, now, requireNodeId(edgeId))

      return result.changes > 0
    },
  }
}

function normalizeEdge(edge) {
  if (!edge || typeof edge !== 'object') {
    throw new Error('Aresta de canvas invalida.')
  }

  const id = requireNodeId(edge.id)
  const source = requireNodeId(edge.source)
  const target = requireNodeId(edge.target)
  const now = new Date().toISOString()
  const createdAt = isIsoString(edge.createdAt) ? edge.createdAt : now
  const updatedAt = isIsoString(edge.updatedAt) ? edge.updatedAt : now

  return { id, source, target, createdAt, updatedAt }
}

function mapEdgeRow(row) {
  return {
    id: row.id,
    source: row.source,
    target: row.target,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeNode(node) {
  if (!node || typeof node !== 'object') {
    throw new Error('No de canvas invalido.')
  }

  const rawNode = node
  const id = requireNodeId(rawNode.id)
  const type = requireNodeType(rawNode.type)
  const parentId =
    typeof rawNode.parentId === 'string' && rawNode.parentId.trim()
      ? rawNode.parentId.trim()
      : null
  const position = normalizePosition(rawNode.position)
  const width = normalizeOptionalDimension(rawNode.width)
  const height = normalizeOptionalDimension(rawNode.height)
  const data =
    rawNode.data && typeof rawNode.data === 'object' && !Array.isArray(rawNode.data)
      ? rawNode.data
      : {}
  const now = new Date().toISOString()
  const createdAt = isIsoString(rawNode.createdAt) ? rawNode.createdAt : now
  const updatedAt = isIsoString(rawNode.updatedAt) ? rawNode.updatedAt : now

  return { id, type, parentId, position, width, height, data, createdAt, updatedAt }
}

function mapNodeRow(row) {
  return {
    id: row.id,
    type: row.type,
    parentId: row.parent_id ?? null,
    position: { x: row.position_x, y: row.position_y },
    width: row.width ?? null,
    height: row.height ?? null,
    data: parseJsonObject(row.data_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizePosition(position) {
  const x = Number(position?.x)
  const y = Number(position?.y)

  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  }
}

function normalizeOptionalDimension(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

function requireNodeId(nodeId) {
  if (typeof nodeId !== 'string' || !nodeId.trim()) {
    throw new Error('ID de no de canvas invalido.')
  }

  return nodeId.trim()
}

function requireNodeType(type) {
  if (!NODE_TYPES.has(type)) {
    throw new Error('Tipo de no de canvas invalido.')
  }

  return type
}

function isIsoString(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function parseJsonObject(valueJson) {
  try {
    const parsed = JSON.parse(valueJson)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {}
  } catch {
    return {}
  }
}

module.exports = {
  createCanvasRepository,
  normalizeNode,
  normalizeEdge,
  NODE_TYPES,
}
