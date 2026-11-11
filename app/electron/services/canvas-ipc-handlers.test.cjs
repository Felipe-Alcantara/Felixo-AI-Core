const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

const handlers = new Map()
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) } }
  }
  return originalLoad.call(this, request, parent, isMain)
}
const { registerCanvasIpcHandlers } = require('./canvas-ipc-handlers.cjs')
Module._load = originalLoad

const { createStorageDatabase } = require('./storage/sqlite-database.cjs')
const { createCanvasRepository } = require('./storage/canvas-repository.cjs')
const { BUILTIN_SKILLS } = require('./skills/skills-catalog.cjs')

test('canvas IPC validates imports and restores files after a failed replacement', async () => {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-canvas-ipc-'))
  const database = createStorageDatabase({ databaseDir })
  const repository = createCanvasRepository(database)
  let storedFiles = [{ name: 'old.md', content: '# old' }]
  let failNextReplacement = true

  try {
    repository.save({
      id: 'old-file',
      type: 'file',
      data: { fileName: 'old.md' },
    })
    registerCanvasIpcHandlers({
      database,
      exportFiles: async () => storedFiles,
      replaceFiles: async (files) => {
        storedFiles = structuredClone(files)
        if (failNextReplacement) {
          failNextReplacement = false
          throw new Error('simulated disk failure')
        }
      },
    })

    const content = JSON.stringify({
      format: 'felixo-canvas',
      version: 1,
      exportedAt: '2026-06-22T12:00:00.000Z',
      nodes: [
        {
          id: 'new-file',
          type: 'file',
          position: { x: 10, y: 20 },
          data: { fileName: 'new.md' },
        },
      ],
      edges: [],
      files: [{ name: 'new.md', content: '# new' }],
    })

    const validation = handlers.get('canvas:validate-import')(null, content)
    assert.deepEqual(validation, {
      ok: true,
      nodeCount: 1,
      edgeCount: 0,
      fileCount: 1,
    })

    const failed = await handlers.get('canvas:import')(null, content)
    assert.equal(failed.ok, false)
    assert.deepEqual(storedFiles, [{ name: 'old.md', content: '# old' }])
    assert.deepEqual(repository.list().map((node) => node.id), ['old-file'])

    const imported = await handlers.get('canvas:import')(null, content)
    assert.equal(imported.ok, true)
    assert.deepEqual(storedFiles, [{ name: 'new.md', content: '# new' }])
    assert.deepEqual(repository.list().map((node) => node.id), ['new-file'])
  } finally {
    database.close()
    fs.rmSync(databaseDir, { recursive: true, force: true })
  }
})

test('canvas IPC persists skills and drops malformed entries', async () => {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-canvas-skills-'))
  const database = createStorageDatabase({ databaseDir })

  try {
    registerCanvasIpcHandlers({ database })

    // Empty before anything is saved.
    assert.deepEqual(handlers.get('canvas:get-skills')(null), {
      ok: true,
      skills: [],
    })

    // Malformed entries (missing name/path, non-objects) are filtered out; the
    // valid one is coerced to clean string fields.
    const saved = handlers.get('canvas:set-skills')(null, [
      { id: 'a', name: 'Revisar', description: 'guia', path: '/skills/review.md' },
      { id: 'b', name: '', path: '/skills/no-name.md' },
      { id: 'c', name: 'Sem caminho' },
      'not-an-object',
    ])
    assert.deepEqual(saved, {
      ok: true,
      skills: [
        { id: 'a', name: 'Revisar', description: 'guia', path: '/skills/review.md' },
      ],
    })

    // Round-trips through storage.
    assert.deepEqual(handlers.get('canvas:get-skills')(null), {
      ok: true,
      skills: [
        { id: 'a', name: 'Revisar', description: 'guia', path: '/skills/review.md' },
      ],
    })
  } finally {
    database.close()
    fs.rmSync(databaseDir, { recursive: true, force: true })
  }
})

test('canvas IPC devolve as skills do sistema ocultas para o painel poder restaurar', async () => {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-canvas-hidden-skills-'))
  const database = createStorageDatabase({ databaseDir })
  const oculta = `builtin-${BUILTIN_SKILLS[0].slug}`

  try {
    registerCanvasIpcHandlers({ database, skillsDir: '/skills' })
    const listar = () => handlers.get('canvas:list-available-skills')(null)

    // Nada oculto por padrao.
    const inicial = listar()
    assert.equal(inicial.ok, true)
    assert.deepEqual(inicial.hiddenBuiltinIds, [])
    assert.deepEqual(inicial.hiddenSkills, [])
    assert.ok(inicial.skills.some((skill) => skill.id === oculta))

    // Entrada suja (repetida, vazia, nao-string) chega limpa ao armazenamento.
    assert.deepEqual(
      handlers.get('canvas:set-skills-settings')(null, {
        hiddenBuiltinIds: [oculta, ` ${oculta} `, '', '  ', 42, null],
      }),
      { ok: true },
    )
    const depois = listar()
    assert.deepEqual(depois.hiddenBuiltinIds, [oculta])
    assert.ok(!depois.skills.some((skill) => skill.id === oculta))
    assert.deepEqual(
      depois.hiddenSkills.map((skill) => [skill.id, skill.name, skill.source]),
      [[oculta, BUILTIN_SKILLS[0].name, 'builtin']],
    )

    // Restaurar = gravar a lista sem o id; a skill volta para todo agente novo.
    handlers.get('canvas:set-skills-settings')(null, { hiddenBuiltinIds: [] })
    const restaurada = listar()
    assert.deepEqual(restaurada.hiddenSkills, [])
    assert.ok(restaurada.skills.some((skill) => skill.id === oculta))
  } finally {
    database.close()
    fs.rmSync(databaseDir, { recursive: true, force: true })
  }
})

test('canvas IPC exporta a saída dos terminais só com a opção e a devolve ao importar', async () => {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-canvas-ipc-saida-'))
  const database = createStorageDatabase({ databaseDir })
  const exported = []
  const imported = []

  try {
    registerCanvasIpcHandlers({
      database,
      exportTerminalOutputs: async (nodes) => {
        exported.push(nodes.map((node) => node.id))
        return [{ nodeId: 'terminal-1', text: 'saída', truncated: false }]
      },
      importTerminalOutputs: async (outputs) => imported.push(outputs),
    })
    const nodes = [{ id: 'terminal-1', type: 'terminal', position: { x: 0, y: 0 }, data: { command: 'codex' } }]

    const plain = await handlers.get('canvas:export')(null, { nodes, edges: [] })
    assert.equal(plain.ok, true)
    assert.equal('terminalOutputs' in plain.bundle, false)
    assert.deepEqual(exported, [])

    const withOutput = await handlers.get('canvas:export')(null, { nodes, edges: [], includeTerminalOutput: true })
    assert.deepEqual(exported, [['terminal-1']])
    assert.deepEqual(withOutput.bundle.terminalOutputs, [{ nodeId: 'terminal-1', text: 'saída', truncated: false }])

    const result = await handlers.get('canvas:import')(null, JSON.stringify(withOutput.bundle))
    assert.equal(result.ok, true)
    assert.equal(result.terminalOutputsImported, 1)
    assert.deepEqual(imported, [withOutput.bundle.terminalOutputs])
  } finally {
    database.close()
  }
})
