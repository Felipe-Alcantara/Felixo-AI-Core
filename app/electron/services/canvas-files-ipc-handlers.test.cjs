const test = require('node:test')
const assert = require('node:assert/strict')
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
const { resolveSafePath } = require('./canvas-files-ipc-handlers.cjs')
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
