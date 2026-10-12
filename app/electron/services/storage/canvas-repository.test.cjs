const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const { createStorageDatabase } = require('./sqlite-database.cjs')
const { listStorageMigrations } = require('./migration-loader.cjs')
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

test('canvas repository persists webpage and notionTasks nodes across a restart', () => {
  // Regressão: 'webpage' e 'notionTasks' foram adicionados ao tipo
  // CanvasNodeType e ao NODE_TYPES do repositório, mas nenhuma migração
  // alargou o CHECK da coluna `type` — o insert falhava silenciosamente (o
  // wrapper do renderer trata a escrita como best-effort) e o bloco sumia do
  // canvas no próximo início do app. Reabrir a conexão simula o restart.
  const databaseDir = createTempDir('felixo-canvas-webpage-notion-')

  try {
    const database = createStorageDatabase({ databaseDir })
    const repository = createCanvasRepository(database)

    repository.save({
      id: 'webpage-1',
      type: 'webpage',
      position: { x: 10, y: 10 },
      data: { url: 'https://example.com' },
    })
    repository.save({
      id: 'notion-1',
      type: 'notionTasks',
      position: { x: 200, y: 10 },
      data: { label: 'Tarefas Notion' },
    })
    database.close()

    const reopened = createStorageDatabase({ databaseDir })
    const reopenedRepository = createCanvasRepository(reopened)
    const nodes = reopenedRepository.list()

    assert.deepEqual(
      nodes.map((node) => node.type).sort(),
      ['notionTasks', 'webpage'],
    )

    reopened.close()
  } finally {
    removeTempDir(databaseDir)
  }
})

test('canvas repository persists drawing nodes across a restart', () => {
  const databaseDir = createTempDir('felixo-canvas-drawing-')

  try {
    const database = createStorageDatabase({ databaseDir })
    const repository = createCanvasRepository(database)

    repository.save({
      id: 'drawing-1',
      type: 'drawing',
      position: { x: 40, y: 80 },
      data: { strokes: '[]' },
    })
    repository.save({
      id: 'excalidraw-1',
      type: 'excalidrawDrawing',
      position: { x: 420, y: 80 },
      data: { scene: '' },
    })
    database.close()

    const reopened = createStorageDatabase({ databaseDir })
    const nodes = createCanvasRepository(reopened).list()

    assert.deepEqual(
      nodes.map((node) => node.type).sort(),
      ['drawing', 'excalidrawDrawing'].sort(),
    )

    reopened.close()
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

test('canvas repository persists cloud-session nodes across a restart', () => {
  // O tipo novo precisa estar no CHECK da coluna `type` (migração 019); sem ela
  // o salvamento falha em silêncio e o cartão some ao reabrir o app.
  const databaseDir = createTempDir('felixo-canvas-cloud-session-')

  try {
    const database = createStorageDatabase({ databaseDir })
    const repository = createCanvasRepository(database)

    repository.save({
      id: 'cloud-1',
      type: 'cloud-session',
      position: { x: 30, y: 60 },
      data: {
        task: 'Corrigir o bug',
        status: 'created',
        session: { id: 'session_01EXEMPLO', url: 'https://claude.ai/code/session_01EXEMPLO', title: 'Corrigir' },
      },
    })
    repository.save({ id: 'note-1', type: 'note', position: { x: 0, y: 0 }, data: { text: 'oi' } })
    database.close()

    const reopened = createStorageDatabase({ databaseDir })
    const nodes = createCanvasRepository(reopened).list()
    const cloud = nodes.find((node) => node.id === 'cloud-1')

    assert.deepEqual(nodes.map((node) => node.type).sort(), ['cloud-session', 'note'])
    assert.equal(cloud?.data.task, 'Corrigir o bug')
    assert.equal(cloud?.data.session.id, 'session_01EXEMPLO')

    reopened.close()
  } finally {
    removeTempDir(databaseDir)
  }
})

test('migração 019 preserva os blocos e as ligações de um banco que estava na 018', () => {
  // O dado do usuário não volta: o banco nasce só até a 018, recebe blocos de
  // vários tipos e uma ligação, e a 019 (que recria a tabela) não pode perder nada.
  const databaseDir = createTempDir('felixo-canvas-migracao-019-')

  try {
    const ateA018 = listStorageMigrations().filter((migration) => migration.version <= 18)
    const antigo = createStorageDatabase({ databaseDir, migrations: ateA018 })
    const repositorioAntigo = createCanvasRepository(antigo)
    repositorioAntigo.save({ id: 'g1', type: 'group', position: { x: 0, y: 0 }, width: 600, height: 400, data: { label: 'Grupo' } })
    repositorioAntigo.save({
      id: 't1',
      type: 'terminal',
      parentId: 'g1',
      position: { x: 10, y: 20 },
      width: 480,
      height: 320,
      data: { command: 'claude', label: 'Claude' },
    })
    repositorioAntigo.save({ id: 'n1', type: 'notionTasks', position: { x: 700, y: 0 }, data: { label: 'Tarefas' } })
    repositorioAntigo.saveEdge({ id: 'e1', source: 't1', target: 'n1', data: { kind: 'flow' } })
    antigo.close()

    const novo = createStorageDatabase({ databaseDir })
    const repositorio = createCanvasRepository(novo)
    const nos = repositorio.list()
    const terminal = nos.find((node) => node.id === 't1')

    assert.deepEqual(nos.map((node) => node.id).sort(), ['g1', 'n1', 't1'])
    assert.equal(terminal?.parentId, 'g1')
    assert.equal(terminal?.width, 480)
    assert.deepEqual(terminal?.data, { command: 'claude', label: 'Claude' })
    assert.deepEqual(repositorio.listEdges().map((edge) => edge.id), ['e1'])
    assert.equal(novo.latestMigrationVersion >= 19, true)

    novo.close()
  } finally {
    removeTempDir(databaseDir)
  }
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
