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
