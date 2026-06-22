const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

// Stub electron so the module loads under node:test.
const Module = require('node:module')
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { ipcMain: { handle() {} } }
  }
  return originalLoad.call(this, request, parent, isMain)
}
const {
  deleteAllMarkdownFiles,
  readAllMarkdownFiles,
  replaceAllMarkdownFiles,
  resolveSafePath,
} = require('./canvas-files-ipc-handlers.cjs')
Module._load = originalLoad

const BASE = path.resolve('/tmp/felixo-canvas-files')

test('resolveSafePath keeps plain names inside the base dir and forces .md', () => {
  assert.equal(resolveSafePath(BASE, 'plano'), path.join(BASE, 'plano.md'))
  assert.equal(resolveSafePath(BASE, 'plano.md'), path.join(BASE, 'plano.md'))
})

test('resolveSafePath strips directory traversal attempts', () => {
  // Any path parts are reduced to the final segment, so traversal can't escape.
  assert.equal(
    resolveSafePath(BASE, '../../etc/passwd'),
    path.join(BASE, 'passwd.md'),
  )
  assert.equal(
    resolveSafePath(BASE, '/etc/shadow'),
    path.join(BASE, 'shadow.md'),
  )
  assert.equal(
    resolveSafePath(BASE, 'sub/dir/nota.md'),
    path.join(BASE, 'nota.md'),
  )
})

test('resolveSafePath rejects empty or non-string names', () => {
  assert.throws(() => resolveSafePath(BASE, ''), /invalido/)
  assert.throws(() => resolveSafePath(BASE, '   '), /invalido/)
  assert.throws(() => resolveSafePath(BASE, undefined), /invalido/)
})

test('deleteAllMarkdownFiles removes only Markdown files and stops watchers', async () => {
  const baseDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'felixo-canvas-files-clear-'))
  const watchedPath = path.join(baseDir, 'watched.md')
  const listener = () => {}

  try {
    await Promise.all([
      fsp.writeFile(watchedPath, '# watched'),
      fsp.writeFile(path.join(baseDir, 'plan.MD'), '# plan'),
      fsp.writeFile(path.join(baseDir, 'keep.txt'), 'keep'),
    ])
    fs.watchFile(watchedPath, listener)
    const watchers = new Map([[watchedPath, listener]])

    assert.equal(await deleteAllMarkdownFiles(baseDir, watchers), 2)
    assert.deepEqual(await fsp.readdir(baseDir), ['keep.txt'])
    assert.equal(watchers.size, 0)
  } finally {
    fs.unwatchFile(watchedPath)
    await fsp.rm(baseDir, { recursive: true, force: true })
  }
})

test('canvas Markdown files can be exported and replaced', async () => {
  const baseDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'felixo-canvas-files-move-'))

  try {
    await fsp.writeFile(path.join(baseDir, 'old.md'), '# old')
    assert.deepEqual(await readAllMarkdownFiles(baseDir), [
      { name: 'old.md', content: '# old' },
    ])

    assert.equal(
      await replaceAllMarkdownFiles(baseDir, new Map(), [
        { name: 'new.md', content: '# new' },
      ]),
      1,
    )
    assert.deepEqual(await readAllMarkdownFiles(baseDir), [
      { name: 'new.md', content: '# new' },
    ])
  } finally {
    await fsp.rm(baseDir, { recursive: true, force: true })
  }
})
