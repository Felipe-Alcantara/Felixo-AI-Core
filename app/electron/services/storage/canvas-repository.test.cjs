const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const { createStorageDatabase } = require('./sqlite-database.cjs')
const {
  createCanvasRepository,
  normalizeNode,
  normalizeEdge,
} = require('./canvas-repository.cjs')

test('canvas repository stores, lists, updates and soft-deletes nodes', () => {
  const databaseDir = createTempDir('felixo-canvas-')
  const now = '2026-06-18T10:00:00.000Z'

  try {
    const database = createStorageDatabase({ databaseDir })
    const repository = createCanvasRepository(database)

    const terminalNode = {
      id: 'node-term-1',
      type: 'terminal',
      position: { x: 120, y: 40 },
      width: 480,
      height: 320,
      data: { command: 'claude', label: 'Claude' },
      createdAt: now,
      updatedAt: now,
    }

    repository.save(terminalNode)
    assert.deepEqual(repository.list(), [
      { ...terminalNode, parentId: null, width: 480, height: 320 },
    ])

    // Moving the node updates position in place (same id).
    repository.save({
      ...terminalNode,
      position: { x: 200, y: 90 },
      updatedAt: '2026-06-18T10:05:00.000Z',
    })
    const moved = repository.list()
    assert.equal(moved.length, 1)
    assert.deepEqual(moved[0].position, { x: 200, y: 90 })

    assert.equal(repository.delete('node-term-1'), true)
    assert.deepEqual(repository.list(), [])

    database.close()
  } finally {
    removeTempDir(databaseDir)
  }
})

test('canvas repository keeps note nodes with default size as null', () => {
  const databaseDir = createTempDir('felixo-canvas-note-')

  try {
    const database = createStorageDatabase({ databaseDir })
    const repository = createCanvasRepository(database)

    repository.save({
      id: 'node-note-1',
      type: 'note',
      position: { x: 0, y: 0 },
      data: { text: 'lembrete' },
    })

    const [stored] = repository.list()
    assert.equal(stored.type, 'note')
    assert.equal(stored.width, null)
    assert.equal(stored.height, null)
    assert.deepEqual(stored.data, { text: 'lembrete' })

    database.close()
  } finally {
    removeTempDir(databaseDir)
  }
})

test('canvas repository persists group nodes and child parentId', () => {
  const databaseDir = createTempDir('felixo-canvas-group-')

  try {
    const database = createStorageDatabase({ databaseDir })
    const repository = createCanvasRepository(database)

    repository.save({
      id: 'group-1',
      type: 'group',
      position: { x: 0, y: 0 },
      width: 600,
      height: 400,
      data: { label: 'Fluxo A' },
    })
    repository.save({
      id: 'term-child',
      type: 'terminal',
      parentId: 'group-1',
      position: { x: 20, y: 40 },
      data: {},
    })

    const nodes = repository.list()
    const group = nodes.find((node) => node.id === 'group-1')
    const child = nodes.find((node) => node.id === 'term-child')

    assert.equal(group?.type, 'group')
    assert.equal(group?.parentId, null)
    assert.equal(child?.parentId, 'group-1')

    database.close()
  } finally {
    removeTempDir(databaseDir)
  }
})

test('canvas repository stores, lists and soft-deletes edges', () => {
  const databaseDir = createTempDir('felixo-canvas-edges-')

  try {
    const database = createStorageDatabase({ databaseDir })
    const repository = createCanvasRepository(database)

    repository.saveEdge({ id: 'edge-1', source: 'file-1', target: 'term-1' })
    const edges = repository.listEdges()
    assert.equal(edges.length, 1)
    assert.equal(edges[0].source, 'file-1')
    assert.equal(edges[0].target, 'term-1')

    assert.equal(repository.deleteEdge('edge-1'), true)
    assert.deepEqual(repository.listEdges(), [])

    database.close()
  } finally {
    removeTempDir(databaseDir)
  }
})

test('canvas repository permanently clears nodes and edges', () => {
  const databaseDir = createTempDir('felixo-canvas-clear-')

  try {
    const database = createStorageDatabase({ databaseDir })
    const repository = createCanvasRepository(database)

    repository.save({ id: 'note-1', type: 'note', data: {} })
    repository.save({ id: 'file-1', type: 'file', data: { fileName: 'plan.md' } })
    repository.saveEdge({ id: 'edge-1', source: 'note-1', target: 'file-1' })
    repository.delete('note-1')

    assert.deepEqual(repository.clear(), { nodesDeleted: 2, edgesDeleted: 1 })
    assert.deepEqual(repository.list({ includeArchived: true }), [])
    assert.deepEqual(repository.listEdges(), [])

    database.close()
  } finally {
    removeTempDir(databaseDir)
  }
})

test('canvas repository atomically replaces nodes and edges', () => {
  const databaseDir = createTempDir('felixo-canvas-replace-')

  try {
    const database = createStorageDatabase({ databaseDir })
    const repository = createCanvasRepository(database)
    repository.save({ id: 'old', type: 'note', data: {} })

    repository.replace(
      [
        { id: 'new-1', type: 'note', data: { text: 'portable' } },
        { id: 'new-2', type: 'file', data: { fileName: 'plan.md' } },
      ],
      [{ id: 'new-edge', source: 'new-1', target: 'new-2' }],
    )

    assert.deepEqual(repository.list().map((node) => node.id).sort(), ['new-1', 'new-2'])
    assert.deepEqual(repository.listEdges().map((edge) => edge.id), ['new-edge'])

    assert.throws(
      () =>
        repository.replace(
          [
            { id: 'duplicate', type: 'note', data: {} },
            { id: 'duplicate', type: 'note', data: {} },
          ],
          [],
        ),
      /UNIQUE constraint failed/,
    )
    assert.deepEqual(repository.list().map((node) => node.id).sort(), ['new-1', 'new-2'])

    database.close()
  } finally {
    removeTempDir(databaseDir)
  }
})

test('normalizeEdge requires id, source and target', () => {
  assert.throws(() => normalizeEdge({ id: 'e', source: 's' }), /invalido/)
  assert.throws(() => normalizeEdge(null), /invalida/)
  const edge = normalizeEdge({ id: 'e', source: 's', target: 't' })
  assert.equal(edge.source, 's')
  assert.ok(!Number.isNaN(Date.parse(edge.createdAt)))
})

test('normalizeNode rejects invalid type and id', () => {
  assert.throws(
    () => normalizeNode({ id: 'x', type: 'unknown', position: { x: 0, y: 0 } }),
    /Tipo de no de canvas invalido/,
  )
  assert.throws(
    () => normalizeNode({ id: '', type: 'note', position: { x: 0, y: 0 } }),
    /ID de no de canvas invalido/,
  )
})

test('normalizeNode coerces missing position and bad dimensions to safe values', () => {
  const node = normalizeNode({ id: 'n', type: 'note', data: { a: 1 } })

  assert.deepEqual(node.position, { x: 0, y: 0 })
  assert.equal(node.width, null)
  assert.equal(node.height, null)
  assert.deepEqual(node.data, { a: 1 })
  assert.ok(!Number.isNaN(Date.parse(node.createdAt)))
})

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function removeTempDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true })
}
