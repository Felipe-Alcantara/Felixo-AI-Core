'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')

const {
  captureWindowsAcl,
  createCliLayout,
  extractNativeErrors,
  findFileRecursive,
  findPackagedAppRoot,
  getArtifactKind,
  getPackagedResourcesPath,
  parseArgs,
  resolveReleaseArtifact,
  simulateQuarantine,
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
      simulateQuarantine: false,
    },
  )
})

test('parseArgs aceita --simulate-quarantine', () => {
  const options = parseArgs(['--simulate-quarantine'])
  assert.equal(options.simulateQuarantine, true)
})

test('simulateQuarantine se declara não simulado fora do macOS', () => {
  if (process.platform === 'darwin') return
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-release-smoke-quarantine-'))
  try {
    const result = simulateQuarantine(temporaryRoot)
    assert.deepEqual(result, { simulated: false, reason: 'plataforma nao e macOS' })
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('findFileRecursive acha um arquivo aninhado sem precisar do caminho exato', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-find-file-'))
  try {
    fs.mkdirSync(path.join(root, 'a', 'b'), { recursive: true })
    fs.writeFileSync(path.join(root, 'a', 'b', 'pty.node'), '')

    assert.equal(findFileRecursive(root, 'pty.node', 5), path.join(root, 'a', 'b', 'pty.node'))
    assert.equal(findFileRecursive(root, 'nao-existe.node', 5), null)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('captureWindowsAcl se ausente do resources não quebra fora do Windows', () => {
  if (process.platform === 'win32') return
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-acl-'))
  try {
    const result = captureWindowsAcl(root, path.join(root, 'app.exe'))
    // icacls não existe fora do Windows: entries fica vazio porque
    // executablePath não existe e pty.node não foi encontrado — a função
    // não lança, só reporta o que achou.
    assert.equal(result.ptyNodeFound, false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
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
  for (const [platformName, packagesRoot, packagesBin] of [
    ['win32', installRoot, installRoot],
    ['darwin', path.join(installRoot, 'lib'), path.join(installRoot, 'bin')],
  ]) {
    const layout = createCliLayout(installRoot, platformName)

    assert.equal(layout.root, installRoot)
    assert.equal(layout.packagesRoot, packagesRoot)
    assert.equal(layout.packagesBin, packagesBin)
    assert.equal(layout.runtimeBin, path.join(installRoot, 'runtime-bin'))
  }
})

test('prefers the host-compatible Linux x86_64 alias over arm64', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-release-artifact-test-'))
  try {
    const extension = process.platform === 'win32'
      ? '.exe'
      : process.platform === 'darwin'
        ? '.dmg'
        : '.AppImage'
    const hostArch = process.arch === 'arm64' ? 'arm64' : 'x86_64'
    const hostArtifact = path.join(
      temporaryRoot,
      `Felixo-AI-Core-0.1.1-${process.platform}-${hostArch}${extension}`,
    )
    const foreignArtifact = path.join(
      temporaryRoot,
      `Felixo-AI-Core-0.1.1-${process.platform}-${hostArch === 'arm64' ? 'x86_64' : 'arm64'}${extension}`,
    )
    fs.writeFileSync(hostArtifact, '')
    fs.writeFileSync(foreignArtifact, '')

    assert.equal(
      path.basename(resolveReleaseArtifact({ releaseDir: temporaryRoot })),
      path.basename(hostArtifact),
    )
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
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

function simulateContextReads(script, contextFilesDir) {
  const readCalls = [...script.matchAll(/felixo context read "(.+)"/g)].map((match) => match[1])
  let output = ''
  for (const name of readCalls) {
    const filePath = path.join(contextFilesDir, name)
    if (fs.existsSync(filePath)) {
      output += fs.readFileSync(filePath, 'utf8')
    } else {
      output += `Artefato de contexto não encontrado: ${name}. Não substitua por outro artefato; informe este nome e o erro exato.\n`
    }
  }
  return `${output}FELIXO_RELEASE_CONTEXT_DONE\n`
}

test('packaged app smoke uses the real-process status contract', async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-release-smoke-app-test-'))
  const statusFile = path.join(temporaryRoot, 'status.json')
  const userData = path.join(temporaryRoot, 'user-data')

  // `runPackagedReleaseSmoke` reusa o mesmo manager para duas fases — o PTY
  // cru e a entrega de contexto — cada uma com o seu próprio marcador de
  // conclusão. Para a fase de contexto, o fake lê os arquivos reais gravados
  // em `userData/context-deliveries` (o mesmo caminho que `writeContextFile`
  // usou) em vez de ecoar um texto fixo: prova que o teste de contrato segue
  // amarrado ao conteúdo real, e não a uma string fabricada de propósito. A
  // profundidade byte-a-byte plena mora em `electron/release-smoke.test.cjs`,
  // que roda o shim de verdade.
  class FakePtyManager {
    spawn(sessionId, options) {
      const isContextSession = sessionId.startsWith('release-smoke-context-')
      queueMicrotask(() => {
        if (isContextSession) {
          options.onData(this.contextOutput || '')
        } else {
          options.onData('FELIXO_RELEASE_PTY_OK\r\n')
        }
        options.onExit({ exitCode: 0 })
      })
    }

    write(sessionId, script) {
      if (sessionId.startsWith('release-smoke-context-')) {
        this.contextOutput = simulateContextReads(script, path.join(userData, 'context-deliveries'))
      }
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
    assert.equal(status.contextDelivery.ok, true)
    assert.equal(status.contextDelivery.files.length, 2)
    assert.ok(status.contextDelivery.files.every((file) => file.readExactly === true))
    assert.equal(status.contextDelivery.missingArtifactReported, true)
    assert.equal(JSON.parse(fs.readFileSync(statusFile, 'utf8')).pty.marker, 'FELIXO_RELEASE_PTY_OK')
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
})
