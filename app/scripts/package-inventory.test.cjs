'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const asar = require('@electron/asar')

const {
  buildInventory,
  measureTree,
  normalizeArchiveEntry,
  parseArgs,
} = require('./package-inventory.cjs')

function createTemporaryRelease() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-package-inventory-'))
  const release = path.join(root, 'release')
  const resources = path.join(release, 'linux-unpacked', 'resources')
  const asarSource = path.join(root, 'asar-source')
  const runtime = path.join(resources, 'npm-runtime', 'npm')

  fs.mkdirSync(path.join(asarSource, 'node_modules', 'fixture-package'), { recursive: true })
  fs.writeFileSync(path.join(asarSource, 'package.json'), JSON.stringify({
    name: 'felixo-ai-core',
    version: '0.1.0',
  }), 'utf8')
  fs.writeFileSync(path.join(asarSource, 'electron.js'), 'module.exports = true\n', 'utf8')
  fs.writeFileSync(
    path.join(asarSource, 'node_modules', 'fixture-package', 'package.json'),
    JSON.stringify({ name: 'fixture-package', version: '1.2.3' }),
    'utf8',
  )

  fs.mkdirSync(path.join(runtime, 'bin'), { recursive: true })
  fs.mkdirSync(path.join(runtime, 'node_modules', 'runtime-dependency'), { recursive: true })
  fs.writeFileSync(path.join(runtime, 'package.json'), JSON.stringify({ name: 'npm', version: '11.19.1' }), 'utf8')
  fs.writeFileSync(path.join(runtime, 'bin', 'npm-cli.js'), '#!/usr/bin/env node\n', 'utf8')
  fs.writeFileSync(
    path.join(runtime, 'node_modules', 'runtime-dependency', 'package.json'),
    JSON.stringify({ name: 'runtime-dependency', version: '2.0.0' }),
    'utf8',
  )
  fs.writeFileSync(path.join(release, 'Felixo-AI-Core.AppImage'), 'fixture-installer\n', 'utf8')

  return {
    root,
    release,
    asarSource,
    asarPath: path.join(resources, 'app.asar'),
  }
}

test('parseArgs resolve os caminhos nomeados', () => {
  const options = parseArgs([
    '--release-dir', 'release-fixture',
    '--out=build/inventory.json',
  ])

  assert.equal(options.help, false)
  assert.equal(options.releaseDir, path.resolve('release-fixture'))
  assert.equal(options.out, path.resolve('build/inventory.json'))
})

test('normalizeArchiveEntry torna caminhos ASAR do Windows portáveis', () => {
  assert.equal(
    normalizeArchiveEntry('\\node_modules\\fixture-package\\package.json'),
    'node_modules/fixture-package/package.json',
  )
})

test('buildInventory lista app.asar, pacotes e npm-runtime empacotado', async () => {
  const fixture = createTemporaryRelease()
  try {
    fs.mkdirSync(path.dirname(fixture.asarPath), { recursive: true })
    await asar.createPackage(fixture.asarSource, fixture.asarPath)

    const inventory = buildInventory(fixture.release, {
      outputPath: path.join(fixture.root, 'policy', 'inventory.json'),
    })

    assert.equal(inventory.schemaVersion, 1)
    assert.equal(inventory.unpackedApps.length, 1)
    assert.equal(inventory.artifacts[0].path, 'Felixo-AI-Core.AppImage')
    assert.equal(inventory.unpackedApps[0].appAsar.packages.some(
      (item) => item.name === 'fixture-package' && item.version === '1.2.3',
    ), true)
    assert.equal(inventory.unpackedApps[0].npmRuntime.package.name, 'npm')
    assert.equal(inventory.unpackedApps[0].npmRuntime.package.version, '11.19.1')
    assert.equal(inventory.unpackedApps[0].npmRuntime.files, 3)
    assert.equal(inventory.unpackedApps[0].npmRuntime.packages.some(
      (item) => item.name === 'runtime-dependency',
    ), true)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('measureTree não segue symlink para fora do artefato', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-package-measure-'))
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-package-outside-'))
  try {
    fs.writeFileSync(path.join(root, 'inside.txt'), 'inside', 'utf8')
    fs.writeFileSync(path.join(outside, 'outside.txt'), 'outside', 'utf8')
    fs.symlinkSync(outside, path.join(root, 'linked-outside'), 'dir')
    assert.deepEqual(measureTree(root), { files: 1, bytes: 6 })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  }
})
