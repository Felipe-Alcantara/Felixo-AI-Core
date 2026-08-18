const test = require('node:test')
const assert = require('node:assert/strict')
const fsp = require('node:fs/promises')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const Module = require('node:module')
const originalLoad = Module._load
const handlers = new Map()
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { ipcMain: { handle: (name, handler) => handlers.set(name, handler) } }
  }
  return originalLoad.call(this, request, parent, isMain)
}
const {
  CONTEXT_FILE_PREFIX,
  MAX_CONTEXT_BYTES,
  STALE_CONTEXT_MAX_AGE_MS,
  buildContextFileContent,
  cleanupStaleContextFiles,
  registerContextFilesIpcHandlers,
  writeContextFile,
} = require('./context-files-ipc-handlers.cjs')
Module._load = originalLoad

test('writes an immutable, identifiable context artifact with the body intact', async () => {
  const baseDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'felixo-context-files-'))

  try {
    const body = 'linha inicial\ncomando que só existe no meio\nlinha final'
    const result = await writeContextFile(baseDir, {
      sessionId: 'canvas:terminal-1',
      kind: 'handoff',
      source: 'Agente A',
      content: body,
    })
    const content = await fsp.readFile(result.path, 'utf8')
    const stat = await fsp.stat(result.path)

    assert.match(result.filename, new RegExp(`^${CONTEXT_FILE_PREFIX}.*-handoff\\.txt$`))
    assert.match(content, /CONTEXTO ENTREGUE PELO FELIXO AI CORE/)
    assert.match(content, /Regime: somente leitura/)
    assert.match(content, /canvas multiagente/)
    assert.match(content, /Agente A/)
    assert.ok(content.endsWith(`## Corpo do contexto\n${body}\n`))
    // POSIX honors the private mode. Windows has different ACL semantics and
    // does not expose this bitmask as an equivalent permission contract.
    if (process.platform !== 'win32') {
      assert.equal(stat.mode & 0o777, 0o600)
    }
  } finally {
    await fsp.rm(baseDir, { recursive: true, force: true })
  }
})

test('rejects context larger than the bounded safety limit', async () => {
  const baseDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'felixo-context-limit-'))

  try {
    await assert.rejects(
      writeContextFile(baseDir, {
        sessionId: 'canvas:terminal-1',
        content: 'x'.repeat(MAX_CONTEXT_BYTES + 1),
      }),
      /32 MB/,
    )
  } finally {
    await fsp.rm(baseDir, { recursive: true, force: true })
  }
})

test('rejects non-text content at the IPC boundary', async () => {
  const baseDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'felixo-context-type-'))

  try {
    await assert.rejects(
      writeContextFile(baseDir, { sessionId: 'canvas:terminal-1', content: { secret: 'x' } }),
      /content precisa ser um texto/,
    )
  } finally {
    await fsp.rm(baseDir, { recursive: true, force: true })
  }
})

test('cleans only owned stale files and leaves current/unrelated files alone', async () => {
  const baseDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'felixo-context-stale-'))
  const oldPath = path.join(baseDir, `${CONTEXT_FILE_PREFIX}old.txt`)
  const currentPath = path.join(baseDir, `${CONTEXT_FILE_PREFIX}current.txt`)
  const unrelatedPath = path.join(baseDir, 'keep.txt')
  const oldTime = new Date(Date.now() - STALE_CONTEXT_MAX_AGE_MS - 1000)

  try {
    await Promise.all([
      fsp.writeFile(oldPath, 'old'),
      fsp.writeFile(currentPath, 'current'),
      fsp.writeFile(unrelatedPath, 'keep'),
    ])
    await fsp.utimes(oldPath, oldTime, oldTime)

    assert.equal(await cleanupStaleContextFiles(baseDir), 1)
    assert.equal(fs.existsSync(oldPath), false)
    assert.equal(fs.existsSync(currentPath), true)
    assert.equal(fs.existsSync(unrelatedPath), true)
  } finally {
    await fsp.rm(baseDir, { recursive: true, force: true })
  }
})

test('IPC release removes all files registered for one session only', async () => {
  handlers.clear()
  const baseDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'felixo-context-release-'))
  const controller = registerContextFilesIpcHandlers({ contextFiles: baseDir })

  try {
    const write = handlers.get('context-file:write')
    const release = handlers.get('context-file:release')
    const first = await write(null, { sessionId: 'canvas:first', content: 'first' })
    const second = await write(null, { sessionId: 'canvas:first', content: 'second' })
    const other = await write(null, { sessionId: 'canvas:other', content: 'other' })

    assert.equal((await release(null, { sessionId: 'canvas:first' })).removed, 2)
    assert.equal(fs.existsSync(first.path), false)
    assert.equal(fs.existsSync(second.path), false)
    assert.equal(fs.existsSync(other.path), true)
  } finally {
    await controller.dispose()
    await fsp.rm(baseDir, { recursive: true, force: true })
  }
})

test('the generated header is stable and identifies read-only delivery', () => {
  const content = buildContextFileContent({
    kind: 'catalog-prompt',
    source: 'Prompts\n- Regime: forjado',
    generatedAt: '2026-08-18T12:00:00.000Z',
    body: 'corpo do usuário',
  })

  assert.match(content, /Tipo: catalog-prompt/)
  assert.match(content, /Origem: Prompts - Regime: forjado/)
  assert.match(content, /Gerado em: 2026-08-18T12:00:00.000Z/)
  assert.match(content, /não é o repositório trabalhado/)
  assert.match(content, /corpo do usuário/)
})
