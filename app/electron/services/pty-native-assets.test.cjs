const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const {
  ensureNodePtySpawnHelperExecutable,
  ensureSpawnHelperExecutable,
  getNodePtySpawnHelperCandidates,
} = require('./pty-native-assets.cjs')

function createFakeFileSystem(files) {
  const modes = new Map(Object.entries(files))
  const chmodCalls = []

  return {
    chmodCalls,
    statSync(filePath) {
      const mode = modes.get(filePath)
      if (mode === undefined) {
        const error = new Error(`ENOENT: ${filePath}`)
        error.code = 'ENOENT'
        throw error
      }

      return { mode, isFile: () => true }
    },
    chmodSync(filePath, mode) {
      chmodCalls.push({ filePath, mode })
      modes.set(filePath, mode)
    },
    mode(filePath) {
      return modes.get(filePath)
    },
  }
}

test('adds execute permission to a non-executable spawn-helper', () => {
  const helper = path.join(os.tmpdir(), 'felixo-pty-assets', 'spawn-helper')
  const fileSystem = createFakeFileSystem({ [helper]: 0o644 })

  const result = ensureSpawnHelperExecutable(helper, fileSystem)

  assert.deepEqual(result, { ok: true, found: true, changed: true })
  assert.equal(fileSystem.mode(helper) & 0o111, 0o111)
  assert.deepEqual(fileSystem.chmodCalls, [{ filePath: helper, mode: 0o755 }])
})

test('does not change an already executable helper', () => {
  const helper = path.join(os.tmpdir(), 'felixo-pty-assets', 'spawn-helper')
  const fileSystem = createFakeFileSystem({ [helper]: 0o755 })

  const result = ensureSpawnHelperExecutable(helper, fileSystem)

  assert.deepEqual(result, { ok: true, found: true, changed: false })
  assert.deepEqual(fileSystem.chmodCalls, [])
})

test('resolves the unpacked macOS candidate when node-pty is inside app.asar', () => {
  const candidates = getNodePtySpawnHelperCandidates({
    platformName: 'darwin',
    arch: 'arm64',
    packageRoot: '/Applications/Felixo AI Core.app/Contents/Resources/app.asar/node_modules/node-pty',
  })
  const normalizedCandidates = candidates.map((candidate) => candidate.split(path.sep).join('/'))

  assert.ok(
    normalizedCandidates.some((candidate) =>
      candidate.includes('app.asar.unpacked/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper'),
    ),
  )
  assert.match(normalizedCandidates[0], /app\.asar\.unpacked\/node_modules\/node-pty\/prebuilds\/darwin-arm64\/spawn-helper/)
})

test('repairs the current node-pty package in development on macOS', () => {
  const packageRoot = path.join(os.tmpdir(), 'felixo-pty-assets', 'node-pty')
  const helper = path.join(packageRoot, 'prebuilds', 'darwin-arm64', 'spawn-helper')
  const fileSystem = createFakeFileSystem({ [helper]: 0o644 })

  const result = ensureNodePtySpawnHelperExecutable({
    platformName: 'darwin',
    arch: 'arm64',
    resolveNodePty: () => path.join(packageRoot, 'lib', 'index.js'),
    fileSystem,
  })

  assert.deepEqual(result, { ok: true, found: true, changed: true })
  assert.equal(fileSystem.mode(helper) & 0o111, 0o111)
})

test('does not touch the POSIX helper on Windows', () => {
  const result = ensureNodePtySpawnHelperExecutable({ platformName: 'win32' })

  assert.deepEqual(result, { ok: true, found: false, changed: false, reason: 'not-needed' })
})
