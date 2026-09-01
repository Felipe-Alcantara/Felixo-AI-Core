'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')

const {
  createCliLayout,
  extractNativeErrors,
  findPackagedAppRoot,
  getArtifactKind,
  getPackagedResourcesPath,
  parseArgs,
  resolveReleaseArtifact,
} = require('./release-smoke.cjs')
const { runPackagedReleaseSmoke } = require('../electron/release-smoke.cjs')

test('parseArgs accepts an explicit release artifact and report', () => {
  assert.deepEqual(
    parseArgs([
      '--release-dir', 'out',
      '--artifact', 'out/Felixo-AI-Core.AppImage',
      '--report', 'out/smoke.json',
      '--timeout-ms', '5000',
      '--keep-temp',
    ]),
    {
      releaseDir: 'out',
      artifact: 'out/Felixo-AI-Core.AppImage',
      report: 'out/smoke.json',
      keepTemp: true,
      timeoutMs: 5000,
    },
  )
})

test('finds the packaged app root without depending on the host output folder name', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-release-smoke-test-'))
  try {
    const appRoot = path.join(temporaryRoot, 'linux-unpacked')
    const npmCli = path.join(
      appRoot,
      'resources',
      'npm-runtime',
      'npm',
      'bin',
      'npm-cli.js',
    )
    fs.mkdirSync(path.dirname(npmCli), { recursive: true })
    fs.writeFileSync(npmCli, '', 'utf8')

    assert.equal(findPackagedAppRoot(temporaryRoot), appRoot)
    assert.equal(resolveReleaseArtifact({ releaseDir: temporaryRoot }), appRoot)
    assert.equal(getArtifactKind(appRoot), 'unpacked')
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('resolves macOS resources below the .app bundle', () => {
  assert.equal(
    getPackagedResourcesPath('/tmp/Felixo AI Core.app'),
    path.join('/tmp/Felixo AI Core.app', 'Contents', 'Resources'),
  )
})

test('creates the platform-specific managed CLI layout', () => {
  const installRoot = path.resolve('felixo-cli-smoke')
  const layout = createCliLayout(installRoot)

  assert.equal(layout.root, installRoot)
  assert.equal(layout.runtimeBin, path.join(installRoot, 'runtime-bin'))
  assert.equal(
    layout.packagesBin,
    process.platform === 'win32'
      ? installRoot
      : path.join(installRoot, 'bin'),
  )
})

test('records only native loading diagnostics', () => {
  assert.deepEqual(
    extractNativeErrors([
      'ordinary application output',
      'Error: The module did not self-register',
      'node-pty: failed to load native binding',
      'another ordinary line',
    ].join('\n')),
    [
      'Error: The module did not self-register',
      'node-pty: failed to load native binding',
    ],
  )
})

test('packaged app smoke uses the real-process status contract', async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-release-smoke-app-test-'))
  const statusFile = path.join(temporaryRoot, 'status.json')
  const userData = path.join(temporaryRoot, 'user-data')

  class FakePtyManager {
    spawn(_sessionId, options) {
      queueMicrotask(() => {
        options.onData('FELIXO_RELEASE_PTY_OK\r\n')
        options.onExit({ exitCode: 0 })
      })
    }

    write() {
      return true
    }

    aguardarEscritas() {
      return Promise.resolve()
    }

    killAll() {}
  }

  try {
    const status = await runPackagedReleaseSmoke({
      app: {
        isPackaged: true,
        getVersion: () => '0.1.999',
        getPath: () => userData,
      },
      statusFile,
      PtyManager: FakePtyManager,
    })

    assert.equal(status.appVersion, '0.1.999')
    assert.equal(status.userDataWritable, true)
    assert.equal(status.pty.ok, true)
    assert.equal(JSON.parse(fs.readFileSync(statusFile, 'utf8')).pty.marker, 'FELIXO_RELEASE_PTY_OK')
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
})
