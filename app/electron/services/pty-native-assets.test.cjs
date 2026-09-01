const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  ensureNodePtySpawnHelperExecutable,
  ensureSpawnHelperExecutable,
  getNodePtySpawnHelperCandidates,
} = require('./pty-native-assets.cjs')

function withTempDirectory(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-pty-assets-'))
  try {
    return callback(directory)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

test('adds execute permission to a non-executable spawn-helper', () => {
  withTempDirectory((directory) => {
    const helper = path.join(directory, 'spawn-helper')
    fs.writeFileSync(helper, '#!/bin/sh\n')
    fs.chmodSync(helper, 0o644)

    const result = ensureSpawnHelperExecutable(helper)

    assert.deepEqual(result, { ok: true, found: true, changed: true })
    assert.equal(fs.statSync(helper).mode & 0o111, 0o111)
  })
})

test('does not change an already executable helper', () => {
  withTempDirectory((directory) => {
    const helper = path.join(directory, 'spawn-helper')
    fs.writeFileSync(helper, 'binary')
    fs.chmodSync(helper, 0o755)

    const result = ensureSpawnHelperExecutable(helper)

    assert.deepEqual(result, { ok: true, found: true, changed: false })
  })
})

test('resolves the unpacked macOS candidate when node-pty is inside app.asar', () => {
  const candidates = getNodePtySpawnHelperCandidates({
    platformName: 'darwin',
    arch: 'arm64',
    packageRoot: '/Applications/Felixo AI Core.app/Contents/Resources/app.asar/node_modules/node-pty',
  })

  assert.ok(
    candidates.some((candidate) =>
      candidate.includes('app.asar.unpacked/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper'),
    ),
  )
  assert.match(candidates[0], /app\.asar\.unpacked\/node_modules\/node-pty\/prebuilds\/darwin-arm64\/spawn-helper/)
})

test('repairs the current node-pty package in development on macOS', () => {
  withTempDirectory((directory) => {
    const packageRoot = path.join(directory, 'node-pty')
    const helper = path.join(packageRoot, 'prebuilds', 'darwin-arm64', 'spawn-helper')
    fs.mkdirSync(path.dirname(helper), { recursive: true })
    fs.writeFileSync(helper, 'binary')
    fs.chmodSync(helper, 0o644)

    const result = ensureNodePtySpawnHelperExecutable({
      platformName: 'darwin',
      arch: 'arm64',
      resolveNodePty: () => path.join(packageRoot, 'lib', 'index.js'),
    })

    assert.deepEqual(result, { ok: true, found: true, changed: true })
    assert.equal(fs.statSync(helper).mode & 0o111, 0o111)
  })
})

test('does not touch the POSIX helper on Windows', () => {
  const result = ensureNodePtySpawnHelperExecutable({ platformName: 'win32' })

  assert.deepEqual(result, { ok: true, found: false, changed: false, reason: 'not-needed' })
})
