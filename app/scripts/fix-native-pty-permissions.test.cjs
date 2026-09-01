const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  fixNativePtyPermissions,
} = require('./fix-native-pty-permissions.cjs')

function withTempDirectory(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-pty-pack-'))
  try {
    return callback(directory)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

test('afterPack corrige helpers desempacotados e aceita caminho macOS do builder', () => {
  withTempDirectory((outDir) => {
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
    fs.mkdirSync(path.dirname(helper), { recursive: true })
    fs.writeFileSync(helper, 'binary')
    fs.chmodSync(helper, 0o644)

    const result = fixNativePtyPermissions({
      appOutDir: outDir,
      electronPlatformName: 'darwin',
      packager: {
        getResourcesDir: () => resourcesDir,
      },
    }, { logger: { log() {} } })

    assert.deepEqual(result, { platform: 'darwin', found: 1, changed: 1 })
    assert.equal(fs.statSync(helper).mode & 0o111, 0o111)
  })
})

test('afterPack não exige spawn-helper em Windows', () => {
  const result = fixNativePtyPermissions({
    appOutDir: '/tmp/unused',
    electronPlatformName: 'win32',
  })

  assert.deepEqual(result, { platform: 'win32', found: 0, changed: 0 })
})
