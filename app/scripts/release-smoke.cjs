'use strict'

/**
 * Validate a release artifact on the OS that built it.
 *
 * The script installs/extracts the real artifact into a disposable directory,
 * starts the packaged executable in `--release-smoke` mode, and then uses the
 * npm runtime shipped in that same artifact to install and update a local CLI
 * fixture. No system-wide package or user profile is touched.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { ensureManagedCliRuntime } = require('../electron/services/managed-cli-runtime.cjs')

const CLI_PACKAGE_NAME = 'felixo-release-smoke-cli'
const CLI_COMMAND_NAME = 'felixo-release-smoke-cli'
const SMOKE_TIMEOUT_MS = 120_000
const PTY_MARKER = 'FELIXO_RELEASE_PTY_OK'

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  const releaseDir = path.resolve(options.releaseDir)
  const reportPath = path.resolve(
    options.report || path.join(releaseDir, `release-smoke-${process.platform}.json`),
  )
  const report = createEmptyReport()
  let temporaryRoot = null

  try {
    const artifactPath = resolveReleaseArtifact({
      releaseDir,
      explicitArtifact: options.artifact,
    })
    report.artifact = {
      name: path.basename(artifactPath),
      kind: getArtifactKind(artifactPath),
      bytes: measurePath(artifactPath),
    }

    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-release-smoke-'))
    const prepared = prepareArtifact({ artifactPath, temporaryRoot })
    report.installMode = prepared.installMode
    report.installed = {
      name: path.basename(prepared.appRoot),
      bytes: measurePath(prepared.appRoot),
    }

    const appResult = await runPackagedApp({
      appRoot: prepared.appRoot,
      executable: prepared.executable,
      temporaryRoot,
      timeoutMs: options.timeoutMs,
    })
    report.startupMs = appResult.startupMs
    report.pty = appResult.status.pty
    report.nativeErrors = appResult.nativeErrors
    report.appVersion = appResult.status.appVersion

    report.npmRuntime = await runBundledNpmSmoke({
      appRoot: prepared.appRoot,
      executable: prepared.executable,
      resourcesPath: prepared.resourcesPath,
      temporaryRoot,
      timeoutMs: options.timeoutMs,
    })
    report.result = 'passed'
  } catch (error) {
    report.result = 'failed'
    report.error = sanitizeDiagnostic(error, temporaryRoot)
    report.nativeErrors = uniqueStrings([
      ...report.nativeErrors,
      ...(Array.isArray(error?.nativeErrors) ? error.nativeErrors : []),
    ])
  } finally {
    if (temporaryRoot && !options.keepTemp) {
      removeTemporaryDirectory(temporaryRoot)
    }
  }

  writeReport(reportPath, report)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

  if (report.result !== 'passed') {
    process.exitCode = 1
  }

  return report
}

function parseArgs(argv) {
  const options = {
    releaseDir: 'release',
    artifact: null,
    report: null,
    keepTemp: false,
    timeoutMs: SMOKE_TIMEOUT_MS,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--keep-temp') {
      options.keepTemp = true
      continue
    }

    if (['--release-dir', '--artifact', '--report', '--timeout-ms'].includes(argument)) {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} exige um valor.`)
      }

      index += 1
      if (argument === '--release-dir') options.releaseDir = value
      if (argument === '--artifact') options.artifact = value
      if (argument === '--report') options.report = value
      if (argument === '--timeout-ms') {
        const timeoutMs = Number(value)
        if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000) {
          throw new Error('--timeout-ms precisa ser um numero >= 1000.')
        }
        options.timeoutMs = Math.floor(timeoutMs)
      }
      continue
    }

    throw new Error(`Argumento desconhecido: ${argument}`)
  }

  return options
}

function createEmptyReport() {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    appVersion: null,
    installMode: null,
    artifact: null,
    installed: null,
    startupMs: null,
    pty: null,
    npmRuntime: null,
    nativeErrors: [],
    result: 'failed',
    error: null,
  }
}

function resolveReleaseArtifact({ releaseDir, explicitArtifact }) {
  if (explicitArtifact) {
    const candidate = path.resolve(explicitArtifact)
    if (!pathExists(candidate)) {
      throw new Error(`Artefato nao encontrado: ${path.basename(candidate)}`)
    }
    return candidate
  }

  if (!fs.existsSync(releaseDir)) {
    throw new Error(`Diretorio de release nao encontrado: ${path.basename(releaseDir)}`)
  }

  const entries = fs.readdirSync(releaseDir, { withFileTypes: true })
  const installer = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(releaseDir, entry.name))
    .filter(isPlatformInstaller)
    .sort(compareArtifacts)[0]

  if (installer) return installer

  const unpacked = findPackagedAppRoot(releaseDir)
  if (unpacked) return unpacked

  throw new Error(`Nenhum artefato empacotado encontrado em ${path.basename(releaseDir)}.`)
}

function isPlatformInstaller(candidate) {
  const name = path.basename(candidate).toLowerCase()
  if (name.includes('uninstaller')) return false

  if (process.platform === 'win32') return name.endsWith('.exe')
  if (process.platform === 'darwin') return name.endsWith('.dmg') || name.endsWith('.zip')
  return name.endsWith('.appimage')
}

function compareArtifacts(left, right) {
  const preferredArch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const leftPreferred = hasArchitecture(left, preferredArch)
  const rightPreferred = hasArchitecture(right, preferredArch)

  if (leftPreferred !== rightPreferred) return leftPreferred ? -1 : 1
  return left.localeCompare(right)
}

function hasArchitecture(candidate, architecture) {
  const name = path.basename(candidate).toLowerCase()
  const aliases = architecture === 'arm64'
    ? ['arm64']
    : ['x64', 'x86_64', 'amd64']
  return aliases.some((alias) => new RegExp(`(?:^|[-_.])${alias}(?:[-_.]|$)`).test(name))
}

function getArtifactKind(candidate) {
  if (fs.statSync(candidate).isDirectory()) return 'unpacked'

  const extension = path.extname(candidate).toLowerCase()
  return extension === '.appimage'
    ? 'appimage'
    : extension === '.dmg'
      ? 'dmg'
      : extension === '.zip'
        ? 'zip'
        : extension === '.exe'
          ? 'nsis'
          : extension.slice(1) || 'file'
}

function prepareArtifact({ artifactPath, temporaryRoot }) {
  if (fs.statSync(artifactPath).isDirectory()) {
    return createPreparedArtifact(findPackagedAppRoot(artifactPath) || artifactPath, 'unpacked')
  }

  const kind = getArtifactKind(artifactPath)

  if (kind === 'appimage') {
    makeExecutable(artifactPath)
    runChecked(artifactPath, ['--appimage-extract'], { cwd: temporaryRoot })
    const appRoot = findPackagedAppRoot(path.join(temporaryRoot, 'squashfs-root'))
    if (!appRoot) {
      throw new Error('O AppImage nao produziu uma arvore empacotada reconhecivel.')
    }
    return createPreparedArtifact(appRoot, 'appimage')
  }

  if (kind === 'dmg') {
    return prepareDmgArtifact({ artifactPath, temporaryRoot })
  }

  if (kind === 'zip') {
    runChecked('ditto', ['-x', '-k', artifactPath, temporaryRoot], { cwd: temporaryRoot })
    const appRoot = findPackagedAppRoot(temporaryRoot)
    if (!appRoot) throw new Error('O ZIP do macOS nao produziu um .app reconhecivel.')
    return createPreparedArtifact(appRoot, 'zip')
  }

  if (kind === 'nsis') {
    const installRoot = path.join(temporaryRoot, 'installed')
    fs.mkdirSync(installRoot, { recursive: true })
    runChecked(artifactPath, ['/S', `/D=${installRoot}`], {
      cwd: temporaryRoot,
      windowsHide: true,
    })
    const appRoot = findPackagedAppRoot(installRoot)
    if (!appRoot) throw new Error('O instalador NSIS nao produziu um app reconhecivel.')
    return createPreparedArtifact(appRoot, 'nsis')
  }

  throw new Error(`Tipo de artefato nao suportado: ${kind}`)
}

function prepareDmgArtifact({ artifactPath, temporaryRoot }) {
  const mountPoint = path.join(temporaryRoot, 'dmg-mount')
  fs.mkdirSync(mountPoint, { recursive: true })

  runChecked('hdiutil', ['attach', artifactPath, '-nobrowse', '-readonly', '-mountpoint', mountPoint], {
    cwd: temporaryRoot,
  })

  try {
    const mountedApp = findPackagedAppRoot(mountPoint)
    if (!mountedApp) throw new Error('O DMG nao contem um .app reconhecivel.')

    const copiedApp = path.join(temporaryRoot, path.basename(mountedApp))
    runChecked('ditto', [mountedApp, copiedApp], { cwd: temporaryRoot })
    return createPreparedArtifact(copiedApp, 'dmg')
  } finally {
    runBestEffort('hdiutil', ['detach', mountPoint], { cwd: temporaryRoot })
  }
}

function createPreparedArtifact(appRoot, installMode) {
  const resourcesPath = getPackagedResourcesPath(appRoot)
  const executable = findPackagedExecutable(appRoot)

  if (!pathExists(path.join(resourcesPath, 'npm-runtime', 'npm', 'bin', 'npm-cli.js'))) {
    throw new Error('O npm-runtime nao foi encontrado no artefato empacotado.')
  }

  if (!pathExists(executable)) {
    throw new Error('O executavel do app nao foi encontrado no artefato empacotado.')
  }

  return { appRoot, resourcesPath, executable, installMode }
}

async function runPackagedApp({ appRoot, executable, temporaryRoot, timeoutMs }) {
  const statusFile = path.join(temporaryRoot, 'app-status.json')
  const userData = path.join(temporaryRoot, 'user-data')
  fs.mkdirSync(userData, { recursive: true })

  const args = []
  // O smoke roda em um runner descartável e não abre conteúdo externo. O
  // helper SUID do Chromium pode não sobreviver à extração do AppImage, e
  // nesse caso o Electron encerra por sinal antes de executar o teste real.
  if (process.platform === 'linux') {
    args.push('--no-sandbox')
  }
  args.push('--release-smoke')

  const startedAt = Date.now()
  const result = await runChild(executable, args, {
    cwd: appRoot,
    env: {
      ...process.env,
      FELIXO_RELEASE_SMOKE_USER_DATA: userData,
      FELIXO_RELEASE_SMOKE_STATUS_FILE: statusFile,
      FELIXO_DISABLE_AUTO_UPDATE: '1',
    },
    timeoutMs,
    windowsHide: true,
  })
  const status = readJson(statusFile)
  const nativeErrors = extractNativeErrors(
    [result.stderr, status?.error].filter(Boolean).join('\n'),
  )

  if (result.error) {
    throw createSmokeError(`O app empacotado nao iniciou: ${result.error}`, nativeErrors)
  }

  if (result.code !== 0 || result.signal || result.timedOut) {
    const outcome = result.timedOut
      ? 'atingiu o timeout'
      : `encerrou com codigo ${result.code ?? 'null'}${result.signal ? ` e sinal ${result.signal}` : ''}`
    const diagnostics = [result.stderr, result.stdout]
      .filter(Boolean)
      .map((value) => sanitizeDiagnostic(value, temporaryRoot))
      .join('\n')
    throw createSmokeError(
      `O app empacotado ${outcome}.${diagnostics ? ` Diagnostico: ${diagnostics}` : ''}`,
      nativeErrors,
    )
  }

  if (!status?.pty?.ok || !status.userDataWritable) {
    throw createSmokeError(
      'O app empacotado encerrou sem validar PTY e userData.',
      nativeErrors,
    )
  }

  return {
    status,
    startupMs: status.readyAt ? Math.max(0, status.readyAt - startedAt) : null,
    nativeErrors,
  }
}

async function runBundledNpmSmoke({ executable, resourcesPath, temporaryRoot, timeoutMs }) {
  const npmCliPath = path.join(resourcesPath, 'npm-runtime', 'npm', 'bin', 'npm-cli.js')
  const sourceDir = path.join(temporaryRoot, 'cli-source')
  const installRoot = path.join(temporaryRoot, 'cli-install')
  const userConfig = path.join(temporaryRoot, 'npmrc')
  const npmCache = path.join(temporaryRoot, 'npm-cache')
  fs.mkdirSync(sourceDir, { recursive: true })
  fs.mkdirSync(installRoot, { recursive: true })
  fs.writeFileSync(userConfig, '', 'utf8')

  const layout = createCliLayout(installRoot, process.platform)
  const npmEnv = createNpmSmokeEnv({ installRoot, userConfig, npmCache })
  const npmArgs = (extra) => [
    npmCliPath,
    ...extra,
    '--no-audit',
    '--no-fund',
    '--ignore-scripts',
    '--loglevel=error',
  ]

  const versionResult = await runPackagedNode({
    executable,
    args: [npmCliPath, '--version'],
    cwd: temporaryRoot,
    env: npmEnv,
    timeoutMs,
  })
  assertCommandSuccess(versionResult, 'O npm empacotado nao respondeu.')
  const npmVersion = findVersion(`${versionResult.stdout}\n${versionResult.stderr}`)
  if (!npmVersion) throw new Error('A versao do npm empacotado nao foi identificada.')

  writeCliFixture(sourceDir, '1.0.0')
  const firstInstall = await runPackagedNode({
    executable,
    args: npmArgs(['install', '--global', '--prefix', installRoot, sourceDir]),
    cwd: temporaryRoot,
    env: npmEnv,
    timeoutMs,
  })
  assertCommandSuccess(firstInstall, 'A instalacao da CLI pelo npm empacotado falhou.')

  const runtime = ensureManagedCliRuntime({
    layout,
    nodeExecutable: executable,
    npmCliPath,
    platformName: process.platform,
  })
  const firstPackage = readInstalledPackage(layout)
  const firstBin = findInstalledBin(layout)
  const pathEnvironment = createCliPathEnv({ layout, baseEnv: process.env })
  const firstRun = await runInstalledCli({
    layout,
    env: pathEnvironment,
    cwd: installRoot,
    timeoutMs,
  })
  assertCommandSuccess(firstRun, 'A CLI instalada nao foi encontrada pelo PATH.')
  assertOutput(firstRun, 'FELIXO_RELEASE_CLI_1.0.0', 'A CLI instalada nao executou pelo runtime.')

  writeCliFixture(sourceDir, '2.0.0')
  const update = await runPackagedNode({
    executable,
    args: npmArgs(['install', '--global', '--prefix', installRoot, '--force', sourceDir]),
    cwd: temporaryRoot,
    env: npmEnv,
    timeoutMs,
  })
  assertCommandSuccess(update, 'A atualizacao da CLI pelo npm empacotado falhou.')

  const secondPackage = readInstalledPackage(layout)
  const secondBin = findInstalledBin(layout)
  const secondRun = await runInstalledCli({
    layout,
    env: pathEnvironment,
    cwd: installRoot,
    timeoutMs,
  })
  assertCommandSuccess(secondRun, 'A CLI atualizada nao persistiu entre processos.')
  assertOutput(secondRun, 'FELIXO_RELEASE_CLI_2.0.0', 'A CLI atualizada nao foi executada.')

  const prefix = await runPackagedNode({
    executable,
    args: [npmCliPath, 'prefix', '--global'],
    cwd: temporaryRoot,
    env: npmEnv,
    timeoutMs,
  })
  assertCommandSuccess(prefix, 'O npm empacotado nao preservou o prefixo privado.')
  if (!normalizesToPath(`${prefix.stdout}\n${prefix.stderr}`, installRoot)) {
    throw new Error('O npm empacotado ignorou o prefixo privado da CLI.')
  }

  const permissions = {
    installedBinExecutable: isExecutableFile(firstBin),
    updatedBinExecutable: isExecutableFile(secondBin),
    nodeShimExecutable: isExecutableFile(runtime.node),
    npmShimExecutable: Boolean(runtime.npm) && isExecutableFile(runtime.npm),
  }

  if (Object.values(permissions).some((value) => !value)) {
    throw new Error('A instalacao nao deixou os executaveis com permissao utilizavel.')
  }

  return {
    ok: true,
    npmVersion,
    packageName: CLI_PACKAGE_NAME,
    installedVersion: firstPackage.version,
    updatedVersion: secondPackage.version,
    path: {
      packagesBin: path.basename(layout.packagesBin),
      runtimeBin: path.basename(layout.runtimeBin),
      command: process.platform === 'win32' ? `${CLI_COMMAND_NAME}.cmd` : CLI_COMMAND_NAME,
    },
    permissions,
    persistence: secondRun.code === 0 && secondPackage.version === '2.0.0',
  }
}

function createCliLayout(installRoot, platformName = process.platform) {
  const packagesRoot = platformName === 'win32'
    ? installRoot
    : path.join(installRoot, 'lib')
  const packagesBin = platformName === 'win32'
    ? installRoot
    : path.join(installRoot, 'bin')
  const runtimeBin = path.join(installRoot, 'runtime-bin')

  return { root: installRoot, packagesRoot, packagesBin, runtimeBin, platformName }
}

function createNpmSmokeEnv({ installRoot, userConfig, npmCache }) {
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    npm_config_prefix: installRoot,
    npm_config_global: 'true',
    npm_config_update_notifier: 'false',
    npm_config_userconfig: userConfig,
    npm_config_cache: npmCache,
  }
  delete env.ELECTRON_NO_ATTACH_CONSOLE
  delete env.ELECTRON_FORCE_WINDOW_MENU_BAR
  return env
}

function createCliPathEnv({ layout, baseEnv }) {
  const env = { ...baseEnv }
  delete env.ELECTRON_RUN_AS_NODE
  const pathKey = findPathKey(env)
  const originalPath = env[pathKey] || env.PATH || ''
  const nextPath = [layout.packagesBin, layout.runtimeBin, originalPath]
    .filter(Boolean)
    .join(path.delimiter)
  env[pathKey] = nextPath
  if (pathKey !== 'PATH') env.PATH = nextPath
  return env
}

async function runInstalledCli({ layout, env, cwd, timeoutMs }) {
  const command = layout.platformName === 'win32' ? `${CLI_COMMAND_NAME}.cmd` : CLI_COMMAND_NAME
  return runChild(command, [], {
    cwd,
    env,
    shell: layout.platformName === 'win32',
    timeoutMs,
    windowsHide: true,
  })
}

async function runPackagedNode({ executable, args, cwd, env, timeoutMs }) {
  return runChild(executable, args, {
    cwd,
    env,
    timeoutMs,
    windowsHide: true,
  })
}

function runChild(command, args, options = {}) {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let timer = null
    let timedOut = false
    let child

    const finish = (result) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve({
        code: result.code ?? null,
        signal: result.signal ?? null,
        error: result.error ?? null,
        timedOut,
        stdout: stdout.slice(-12_000),
        stderr: stderr.slice(-12_000),
      })
    }

    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        shell: Boolean(options.shell),
        windowsHide: Boolean(options.windowsHide),
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      finish({ error })
      return
    }

    child.stdout?.on('data', (chunk) => {
      stdout = `${stdout}${String(chunk)}`
    })
    child.stderr?.on('data', (chunk) => {
      stderr = `${stderr}${String(chunk)}`
    })
    child.once('error', (error) => finish({ error }))
    child.once('close', (code, signal) => finish({ code, signal }))

    timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill()
      } catch {
        // The timeout is reported by the caller.
      }
      setTimeout(() => {
        try {
          if (!settled) child.kill('SIGKILL')
        } catch {
          // Best effort for a stuck installer/process.
        }
      }, 2_000).unref?.()
    }, options.timeoutMs ?? SMOKE_TIMEOUT_MS)
  })
}

function writeCliFixture(sourceDir, version) {
  fs.writeFileSync(
    path.join(sourceDir, 'package.json'),
    `${JSON.stringify({
      name: CLI_PACKAGE_NAME,
      version,
      bin: { [CLI_COMMAND_NAME]: 'cli.cjs' },
    }, null, 2)}\n`,
    'utf8',
  )
  fs.writeFileSync(
    path.join(sourceDir, 'cli.cjs'),
    [
      '#!/usr/bin/env node',
      "const packageJson = require('./package.json')",
      "process.stdout.write(`FELIXO_RELEASE_CLI_${packageJson.version}\\n`)",
      '',
    ].join('\n'),
    'utf8',
  )
  if (process.platform !== 'win32') {
    fs.chmodSync(path.join(sourceDir, 'cli.cjs'), 0o755)
  }
}

function readInstalledPackage(layout) {
  const packagePath = path.join(layout.packagesRoot, 'node_modules', CLI_PACKAGE_NAME, 'package.json')
  if (!pathExists(packagePath)) throw new Error('O pacote da CLI nao foi persistido no prefixo.')
  return JSON.parse(fs.readFileSync(packagePath, 'utf8'))
}

function findInstalledBin(layout) {
  const candidates = process.platform === 'win32'
    ? [
      path.join(layout.packagesBin, `${CLI_COMMAND_NAME}.cmd`),
      path.join(layout.packagesBin, `${CLI_COMMAND_NAME}.exe`),
      path.join(layout.packagesBin, CLI_COMMAND_NAME),
    ]
    : [path.join(layout.packagesBin, CLI_COMMAND_NAME)]
  const candidate = candidates.find(pathExists)
  if (!candidate) throw new Error('O npm nao criou o executavel da CLI no prefixo.')
  return candidate
}

function assertCommandSuccess(result, message) {
  if (result.error || result.timedOut || result.code !== 0) {
    const details = [result.error?.message, result.stderr, result.stdout]
      .filter(Boolean)
      .join('\n')
    const error = new Error(`${message} ${sanitizeDiagnostic(details)}`.trim())
    error.nativeErrors = extractNativeErrors(details)
    throw error
  }
}

function assertOutput(result, expected, message) {
  if (!`${result.stdout}\n${result.stderr}`.includes(expected)) {
    throw new Error(`${message} Marcador ausente: ${expected}`)
  }
}

function findVersion(value) {
  return String(value).match(/\b\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\b/)?.[0] || null
}

function normalizesToPath(value, expected) {
  const normalizedExpected = normalizePath(expected)
  return String(value)
    .split(/\r?\n/)
    .map((line) => normalizePath(line.trim()))
    .some((line) => line === normalizedExpected)
}

function normalizePath(value) {
  return path.normalize(String(value)).replace(/[\\/]$/, '').toLowerCase()
}

function findPathKey(env) {
  return Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH'
}

function getPackagedResourcesPath(appRoot) {
  if (appRoot.toLowerCase().endsWith('.app')) {
    return path.join(appRoot, 'Contents', 'Resources')
  }
  return path.join(appRoot, 'resources')
}

function findPackagedExecutable(appRoot) {
  if (process.platform === 'darwin') {
    return path.join(appRoot, 'Contents', 'MacOS', 'Felixo AI Core')
  }

  const candidates = process.platform === 'win32'
    ? ['Felixo AI Core.exe', 'felixo-ai-core.exe']
    : ['felixo-ai-core', 'Felixo AI Core']
  const candidate = candidates
    .map((name) => path.join(appRoot, name))
    .find(pathExists)
  if (candidate) return candidate

  const files = safeReadDirectory(appRoot)
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(appRoot, entry.name))
  return files.find((candidatePath) => {
    const name = path.basename(candidatePath).toLowerCase()
    return process.platform === 'win32'
      ? name.endsWith('.exe') && !name.includes('uninstall')
      : isExecutableFile(candidatePath) && !name.includes('chrome') && !name.includes('crashpad')
  }) || path.join(appRoot, candidates[0])
}

function findPackagedAppRoot(start, maxDepth = 7) {
  if (!pathExists(start) || maxDepth < 0) return null
  if (isPackagedAppRoot(start)) return start

  if (!fs.statSync(start).isDirectory()) return null
  for (const entry of safeReadDirectory(start)) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const candidate = findPackagedAppRoot(path.join(start, entry.name), maxDepth - 1)
    if (candidate) return candidate
  }
  return null
}

function isPackagedAppRoot(candidate) {
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()) return false
  const resourcesPath = getPackagedResourcesPath(candidate)
  return pathExists(path.join(resourcesPath, 'npm-runtime', 'npm', 'bin', 'npm-cli.js'))
}

function safeReadDirectory(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true })
  } catch {
    return []
  }
}

function measurePath(candidate) {
  if (!pathExists(candidate)) return 0
  const stat = fs.lstatSync(candidate)
  if (!stat.isDirectory() || stat.isSymbolicLink()) return stat.size
  return safeReadDirectory(candidate).reduce(
    (total, entry) => total + measurePath(path.join(candidate, entry.name)),
    0,
  )
}

function isExecutableFile(candidate) {
  try {
    const stat = fs.statSync(candidate)
    if (!stat.isFile()) return false
    return process.platform === 'win32' || Boolean(stat.mode & 0o111)
  } catch {
    return false
  }
}

function makeExecutable(candidate) {
  if (process.platform === 'win32') return
  try {
    fs.chmodSync(candidate, fs.statSync(candidate).mode | 0o111)
  } catch {
    // The subsequent launch reports a useful failure if chmod is impossible.
  }
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    windowsHide: Boolean(options.windowsHide),
    encoding: 'utf8',
    timeout: options.timeoutMs ?? SMOKE_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error || result.status !== 0) {
    const details = [result.error?.message, result.stderr, result.stdout]
      .filter(Boolean)
      .join('\n')
    throw new Error(`Comando de instalacao falhou: ${sanitizeDiagnostic(details)}`.trim())
  }
  return result
}

function runBestEffort(command, args, options = {}) {
  try {
    spawnSync(command, args, {
      cwd: options.cwd,
      windowsHide: Boolean(options.windowsHide),
      stdio: 'ignore',
      timeout: 15_000,
    })
  } catch {
    // Cleanup must not hide the validation result.
  }
}

function extractNativeErrors(value) {
  const patterns = [
    /node-pty/i,
    /native addon/i,
    /module did not self-register/i,
    /dlopen/i,
    /conpty/i,
    /winpty/i,
    /invalid elf/i,
    /bad cpu type/i,
    /not a valid win32 application/i,
    /cannot find module/i,
  ]

  return uniqueStrings(
    String(value || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && patterns.some((pattern) => pattern.test(line)))
      .map((line) => sanitizeDiagnostic(line))
      .slice(0, 20),
  )
}

function createSmokeError(message, nativeErrors) {
  const error = new Error(message)
  error.nativeErrors = nativeErrors
  return error
}

function sanitizeDiagnostic(value, temporaryRoot = null) {
  let text = value?.message ? String(value.message) : String(value || '')
  for (const [source, replacement] of [
    [temporaryRoot, '<temp>'],
    [process.cwd(), '<workspace>'],
  ]) {
    if (source) text = text.split(source).join(replacement)
  }
  return text.replace(/[A-Za-z]:\\[^\r\n]+/g, '<local-path>').slice(0, 2_000)
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))]
}

function pathExists(candidate) {
  try {
    fs.lstatSync(candidate)
    return true
  } catch {
    return false
  }
}

function readJson(candidate) {
  try {
    return JSON.parse(fs.readFileSync(candidate, 'utf8'))
  } catch {
    return null
  }
}

function writeReport(reportPath, report) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

function removeTemporaryDirectory(directory) {
  try {
    fs.rmSync(directory, { recursive: true, force: true })
  } catch {
    // CI runners are disposable; failure to remove a temp directory is not a
    // release validation failure.
  }
}

module.exports = {
  CLI_COMMAND_NAME,
  CLI_PACKAGE_NAME,
  PTY_MARKER,
  createCliLayout,
  createNpmSmokeEnv,
  extractNativeErrors,
  findPackagedAppRoot,
  getArtifactKind,
  getPackagedResourcesPath,
  parseArgs,
  resolveReleaseArtifact,
  runBundledNpmSmoke,
  sanitizeDiagnostic,
}

if (require.main === module) {
  main().catch((error) => {
    process.exitCode = 1
    process.stderr.write(`${sanitizeDiagnostic(error)}\n`)
  })
}
