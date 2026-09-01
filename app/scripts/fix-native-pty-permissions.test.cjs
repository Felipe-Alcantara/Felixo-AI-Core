const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const {
  fixNativePtyPermissions,
} = require('./fix-native-pty-permissions.cjs')

function createFakeFileSystem(helper, prebuildsDir) {
  let mode = 0o644
  const chmodCalls = []

  return {
    chmodCalls,
    readdirSync(directory) {
      assert.equal(directory, prebuildsDir)
      return [{ name: 'darwin-arm64', isDirectory: () => true }]
    },
    statSync(filePath) {
      if (filePath !== helper) {
        const error = new Error(`ENOENT: ${filePath}`)
        error.code = 'ENOENT'
        throw error
      }

      return { mode, isFile: () => true }
    },
    chmodSync(filePath, nextMode) {
      chmodCalls.push({ filePath, mode: nextMode })
      mode = nextMode
    },
    mode() {
      return mode
    },
  }
}

test('afterPack corrige helpers desempacotados e aceita caminho macOS do builder', () => {
  const outDir = path.join(os.tmpdir(), 'felixo-pty-pack')
  const resourcesDir = path.join(outDir, 'Felixo AI Core.app', 'Contents', 'Resources')
  const helper = path.join(
    resourcesDir,
    'app.asar.unpacked',
    'node_modules',
    'node-pty',
    'prebuilds',
    'darwin-arm64',
    'spawn-helper',
  )
  const prebuildsDir = path.dirname(path.dirname(helper))
  const fileSystem = createFakeFileSystem(helper, prebuildsDir)

  const result = fixNativePtyPermissions({
    appOutDir: outDir,
    electronPlatformName: 'darwin',
    packager: {
      getResourcesDir: () => resourcesDir,
    },
  }, { fileSystem, logger: { log() {} } })

  assert.deepEqual(result, { platform: 'darwin', found: 1, changed: 1 })
  assert.equal(fileSystem.mode() & 0o111, 0o111)
  assert.deepEqual(fileSystem.chmodCalls, [{ filePath: helper, mode: 0o755 }])
})

test('afterPack não exige spawn-helper em Windows', () => {
  const result = fixNativePtyPermissions({
    appOutDir: '/tmp/unused',
    electronPlatformName: 'win32',
  })

  assert.deepEqual(result, { platform: 'win32', found: 0, changed: 0 })
})
