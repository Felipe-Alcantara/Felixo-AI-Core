'use strict'

/**
 * Mede o runtime do npm que chega ao instalador.
 *
 * O baseline reproduz a política anterior (somente docs/man/Markdown eram
 * removidos); o modo atual usa a poda conservadora do hook beforePack. Cada
 * modo executa o mesmo npm-cli.js com o binário do Electron, em um prefixo e
 * cache descartáveis, instalando uma CLI local sem rede. Assim o relatório
 * separa redução de artefato de regressão funcional.
 *
 * O benchmark usa somente o modo Node do Electron, portanto não precisa de
 * display nem de flags Chromium como `--no-sandbox`.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { performance } = require('node:perf_hooks')
const { spawn } = require('node:child_process')
const tar = require('tar')
const { ensureManagedCliRuntime } = require('../electron/services/managed-cli-runtime.cjs')
const {
  NPM_RUNTIME_POLICIES,
  copyNpmRuntime,
} = require('./bundle-npm-runtime.cjs')

const APP_ROOT = path.join(__dirname, '..')
const NPM_SOURCE = path.join(APP_ROOT, 'node_modules', 'npm')
const DEFAULT_ITERATIONS = 3
const MAX_ITERATIONS = 10
const DEFAULT_TIMEOUT_MS = 120_000
const MAX_TIMEOUT_MS = 600_000
const CLI_PACKAGE_NAME = 'felixo-npm-runtime-benchmark-cli'
const CLI_COMMAND_NAME = 'felixo-npm-runtime-benchmark-cli'
const ARCHIVE_FORMAT = 'tar.gz'

function parseArgs(argv = []) {
  const options = {
    check: false,
    help: false,
    iterations: DEFAULT_ITERATIONS,
    out: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  }

  for (const argument of argv) {
    if (argument === '--check') {
      options.check = true
      continue
    }
    if (argument === '--help') {
      options.help = true
      continue
    }
    if (argument.startsWith('--iterations=')) {
      options.iterations = parseBoundedInteger(
        argument.slice('--iterations='.length),
        2,
        MAX_ITERATIONS,
        'iterations',
      )
      continue
    }
    if (argument.startsWith('--timeout-ms=')) {
      options.timeoutMs = parseBoundedInteger(
        argument.slice('--timeout-ms='.length),
        1_000,
        MAX_TIMEOUT_MS,
        'timeout-ms',
      )
      continue
    }
    if (argument.startsWith('--out=')) {
      const outputPath = argument.slice('--out='.length).trim()
      if (!outputPath) throw new Error('--out precisa apontar para um arquivo.')
      options.out = path.resolve(outputPath)
      continue
    }
    throw new Error(`Argumento desconhecido: ${argument}`)
  }

  return options
}

function parseBoundedInteger(value, minimum, maximum, label) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} deve estar entre ${minimum} e ${maximum}.`)
  }
  return parsed
}

function percentile(values, proportion) {
  const clean = values.filter(Number.isFinite).sort((left, right) => left - right)
  if (clean.length === 0) return null

  const position = (clean.length - 1) * proportion
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  const value = lower === upper
    ? clean[lower]
    : clean[lower] + (clean[upper] - clean[lower]) * (position - lower)
  return Number(value.toFixed(3))
}

function summarize(values) {
  const clean = values.filter(Number.isFinite)
  return {
    count: clean.length,
    p50: percentile(clean, 0.5),
    p95: percentile(clean, 0.95),
    max: clean.length > 0 ? Number(Math.max(...clean).toFixed(3)) : null,
  }
}

function measureTree(root) {
  if (!pathExists(root)) return { files: 0, bytes: 0 }

  const stat = fs.lstatSync(root)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    return { files: stat.isFile() ? 1 : 0, bytes: stat.size }
  }

  return fs.readdirSync(root, { withFileTypes: true }).reduce(
    (total, entry) => {
      const child = measureTree(path.join(root, entry.name))
      return {
        files: total.files + child.files,
        bytes: total.bytes + child.bytes,
      }
    },
    { files: 0, bytes: 0 },
  )
}

async function measureCompressedBytes(root, temporaryRoot) {
  const archivePath = path.join(temporaryRoot, `${path.basename(root)}.tar.gz`)
  await tar.c({
    cwd: root,
    file: archivePath,
    gzip: true,
    mtime: new Date(0),
    portable: true,
  }, ['.'])

  try {
    return fs.statSync(archivePath).size
  } finally {
    fs.rmSync(archivePath, { force: true })
  }
}

function resolveElectronExecutable() {
  try {
    const electron = require('electron')
    if (typeof electron === 'string' && electron) return electron
  } catch {
    // O fallback mantém o script testável quando executado pelo próprio
    // Electron ou em uma instalação parcial das dependências.
  }
  return process.execPath
}

function createEmptyReport(options) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    electron: readPackageVersion(path.join(APP_ROOT, 'node_modules', 'electron', 'package.json')),
    npm: readPackageVersion(path.join(NPM_SOURCE, 'package.json')),
    method: {
      archiveFormat: ARCHIVE_FORMAT,
      archivePolicy: 'tar.gz portátil, com mtime fixo para comparar o conteúdo',
      iterations: options.iterations,
      timeoutMs: options.timeoutMs,
      offlineFixture: true,
      lifecycleScripts: true,
      policies: [NPM_RUNTIME_POLICIES.baseline, NPM_RUNTIME_POLICIES.current],
    },
    policies: {},
    comparison: null,
    validation: [],
    result: 'failed',
    error: null,
  }
}

async function benchmarkPolicy({ policy, options, temporaryRoot, executable }) {
  const runtimeRoot = path.join(temporaryRoot, policy, 'npm')
  copyNpmRuntime({
    source: NPM_SOURCE,
    target: runtimeRoot,
    policy,
  })

  const inventory = measureTree(runtimeRoot)
  const compressedBytes = await measureCompressedBytes(runtimeRoot, path.join(temporaryRoot, policy))
  const samples = []

  for (let iteration = 1; iteration <= options.iterations; iteration += 1) {
    const sample = await runInstallScenario({
      executable,
      iteration,
      npmCliPath: path.join(runtimeRoot, 'bin', 'npm-cli.js'),
      options,
      temporaryRoot,
      policy,
    })
    samples.push(sample)
    console.log(
      `[npm-runtime:${policy}] ${iteration}/${options.iterations} `
      + `startup=${formatMs(sample.startupMs)} `
      + `install=${formatMs(sample.firstInstallMs)} `
      + `update=${formatMs(sample.updateMs)}`,
    )
  }

  return {
    inventory: {
      files: inventory.files,
      unpackedBytes: inventory.bytes,
      compressedBytes,
    },
    samples,
    summary: {
      startupMs: summarize(samples.map((sample) => sample.startupMs)),
      firstInstallMs: summarize(samples.map((sample) => sample.firstInstallMs)),
      updateMs: summarize(samples.map((sample) => sample.updateMs)),
    },
  }
}

async function runInstallScenario({
  executable,
  iteration,
  npmCliPath,
  options,
  temporaryRoot,
  policy,
}) {
  const sampleRoot = fs.mkdtempSync(
    path.join(temporaryRoot, `${policy}-sample-${iteration}-`),
  )
  const sourceDir = path.join(sampleRoot, 'cli-source')
  const installRoot = path.join(sampleRoot, 'cli-install')
  const userConfig = path.join(sampleRoot, 'npmrc')
  const npmCache = path.join(sampleRoot, 'npm-cache')
  const marker = path.join(sampleRoot, 'lifecycle-marker.txt')

  try {
    fs.mkdirSync(sourceDir, { recursive: true })
    fs.mkdirSync(installRoot, { recursive: true })
    fs.writeFileSync(userConfig, '', 'utf8')

    const layout = createCliLayout(installRoot, process.platform)
    const runtime = ensureManagedCliRuntime({
      layout,
      nodeExecutable: executable,
      npmCliPath,
      platformName: process.platform,
    })
    const environment = createNpmEnvironment({
      installRoot,
      userConfig,
      npmCache,
      marker,
      layout,
    })

    const startupStartedAt = performance.now()
    const versionResult = await runNpmProcess({
      executable,
      npmCliPath,
      args: ['--version'],
      cwd: sampleRoot,
      env: environment,
      timeoutMs: options.timeoutMs,
    })
    const startupMs = performance.now() - startupStartedAt
    assertCommandSuccess(versionResult, 'O npm empacotado nao respondeu.')
    const npmVersion = findVersion(`${versionResult.stdout}\n${versionResult.stderr}`)
    if (!npmVersion) throw new Error('A versao do npm empacotado nao foi identificada.')

    writeCliFixture(sourceDir, '1.0.0')
    const firstInstallStartedAt = performance.now()
    const firstInstall = await runNpmProcess({
      executable,
      npmCliPath,
      args: npmInstallArgs(installRoot, sourceDir),
      cwd: sampleRoot,
      env: environment,
      timeoutMs: options.timeoutMs,
    })
    const firstInstallMs = performance.now() - firstInstallStartedAt
    assertCommandSuccess(firstInstall, 'A primeira instalacao offline da CLI falhou.')

    const firstPackage = readInstalledPackage(layout)
    const firstBin = findInstalledBin(layout)
    const firstLifecycle = readMarker(marker, '1.0.0')
    const pathEnvironment = createCliPathEnv({ layout, baseEnv: environment })
    const firstRun = await runInstalledCli({
      layout,
      env: pathEnvironment,
      cwd: installRoot,
      timeoutMs: options.timeoutMs,
    })
    assertCommandSuccess(firstRun, 'A CLI instalada nao foi encontrada pelo PATH.')
    assertOutput(firstRun, 'FELIXO_NPM_RUNTIME_CLI_1.0.0', 'A CLI instalada nao executou.')

    writeCliFixture(sourceDir, '2.0.0')
    const updateStartedAt = performance.now()
    const update = await runNpmProcess({
      executable,
      npmCliPath,
      args: npmInstallArgs(installRoot, sourceDir, ['--force']),
      cwd: sampleRoot,
      env: environment,
      timeoutMs: options.timeoutMs,
    })
    const updateMs = performance.now() - updateStartedAt
    assertCommandSuccess(update, 'A atualizacao offline da CLI falhou.')

    const secondPackage = readInstalledPackage(layout)
    const secondBin = findInstalledBin(layout)
    const secondRun = await runInstalledCli({
      layout,
      env: pathEnvironment,
      cwd: installRoot,
      timeoutMs: options.timeoutMs,
    })
    assertCommandSuccess(secondRun, 'A CLI atualizada nao persistiu entre processos.')
    assertOutput(secondRun, 'FELIXO_NPM_RUNTIME_CLI_2.0.0', 'A CLI atualizada nao executou.')

    const prefix = await runNpmProcess({
      executable,
      npmCliPath,
      args: ['prefix', '--global'],
      cwd: sampleRoot,
      env: environment,
      timeoutMs: options.timeoutMs,
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
    const lifecycle = {
      firstInstall: firstLifecycle,
      update: readMarker(marker, '2.0.0'),
    }

    if (Object.values(permissions).some((value) => !value)) {
      throw new Error('A instalacao nao deixou os executaveis com permissao utilizavel.')
    }
    if (Object.values(lifecycle).some((value) => !value)) {
      throw new Error(`O npm offline nao executou os scripts de ciclo de vida da fixture: ${JSON.stringify(lifecycle)}`)
    }

    return {
      iteration,
      npmVersion,
      startupMs,
      firstInstallMs,
      updateMs,
      firstInstall: {
        version: firstPackage.version,
        path: firstRun.code === 0,
        lifecycle: lifecycle.firstInstall,
      },
      update: {
        version: secondPackage.version,
        path: secondRun.code === 0,
        lifecycle: lifecycle.update,
      },
      offline: true,
      permissions,
      prefix: true,
      successful: true,
      exitCode: 0,
    }
  } finally {
    fs.rmSync(sampleRoot, { recursive: true, force: true })
  }
}

function npmInstallArgs(installRoot, sourceDir, extra = []) {
  return [
    'install',
    '--global',
    '--prefix',
    installRoot,
    '--offline',
    '--no-audit',
    '--no-fund',
    '--loglevel=error',
    ...extra,
    sourceDir,
  ]
}

function createCliLayout(installRoot, platformName) {
  const isWindows = platformName === 'win32'
  return {
    root: installRoot,
    packagesRoot: isWindows ? installRoot : path.join(installRoot, 'lib'),
    packagesBin: isWindows ? installRoot : path.join(installRoot, 'bin'),
    runtimeBin: path.join(installRoot, 'runtime-bin'),
    platformName,
  }
}

function createNpmEnvironment({ installRoot, userConfig, npmCache, marker, layout }) {
  const environment = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    FELIXO_NPM_RUNTIME_MARKER: marker,
    npm_config_cache: npmCache,
    npm_config_global: 'true',
    npm_config_offline: 'true',
    npm_config_prefix: installRoot,
    npm_config_update_notifier: 'false',
    npm_config_userconfig: userConfig,
  }
  const pathKey = findPathKey(environment)
  const originalPath = environment[pathKey] || environment.PATH || ''
  const nextPath = [layout.packagesBin, layout.runtimeBin, originalPath]
    .filter(Boolean)
    .join(path.delimiter)
  environment[pathKey] = nextPath
  if (pathKey !== 'PATH') environment.PATH = nextPath
  delete environment.ELECTRON_NO_ATTACH_CONSOLE
  delete environment.ELECTRON_FORCE_WINDOW_MENU_BAR
  return environment
}

function createCliPathEnv({ layout, baseEnv }) {
  const environment = { ...baseEnv }
  const pathKey = findPathKey(environment)
  const originalPath = environment[pathKey] || environment.PATH || ''
  const nextPath = [layout.packagesBin, layout.runtimeBin, originalPath]
    .filter(Boolean)
    .join(path.delimiter)
  environment[pathKey] = nextPath
  if (pathKey !== 'PATH') environment.PATH = nextPath
  delete environment.ELECTRON_RUN_AS_NODE
  return environment
}

function findPathKey(environment) {
  return Object.keys(environment).find((key) => key.toLowerCase() === 'path') || 'PATH'
}

function runNpmProcess({ executable, npmCliPath, args, cwd, env, timeoutMs }) {
  return runChild(executable, electronArgs(npmCliPath, args), {
    cwd,
    env,
    timeoutMs,
  })
}

function electronArgs(npmCliPath, args) {
  return [npmCliPath, ...args]
}

function runInstalledCli({ layout, env, cwd, timeoutMs }) {
  const command = layout.platformName === 'win32'
    ? `${CLI_COMMAND_NAME}.cmd`
    : CLI_COMMAND_NAME
  return runChild(command, [], {
    cwd,
    env,
    shell: layout.platformName === 'win32',
    timeoutMs,
  })
}

function runChild(command, args, options = {}) {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false
    let timer = null
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
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } catch (error) {
      finish({ error })
      return
    }

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.once('error', (error) => finish({ error }))
    child.once('close', (code, signal) => finish({ code, signal }))

    timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill()
      } catch {
        // O resultado temporizado já será informado ao chamador.
      }
      setTimeout(() => {
        try {
          if (!settled) child.kill('SIGKILL')
        } catch {
          // Best effort para não deixar uma fixture pendurada.
        }
      }, 2_000).unref?.()
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  })
}

function writeCliFixture(sourceDir, version) {
  fs.writeFileSync(
    path.join(sourceDir, 'package.json'),
    `${JSON.stringify({
      name: CLI_PACKAGE_NAME,
      version,
      bin: { [CLI_COMMAND_NAME]: 'cli.cjs' },
      scripts: { preinstall: 'node lifecycle.cjs' },
    }, null, 2)}\n`,
    'utf8',
  )
  fs.writeFileSync(
    path.join(sourceDir, 'lifecycle.cjs'),
    [
      "const fs = require('node:fs')",
      "fs.writeFileSync(process.env.FELIXO_NPM_RUNTIME_MARKER, require('./package.json').version)",
      '',
    ].join('\n'),
    'utf8',
  )
  fs.writeFileSync(
    path.join(sourceDir, 'cli.cjs'),
    [
      '#!/usr/bin/env node',
      "const packageJson = require('./package.json')",
      "process.stdout.write(`FELIXO_NPM_RUNTIME_CLI_${packageJson.version}\\n`)",
      '',
    ].join('\n'),
    'utf8',
  )
  if (process.platform !== 'win32') fs.chmodSync(path.join(sourceDir, 'cli.cjs'), 0o755)
}

function readInstalledPackage(layout) {
  const packagePath = path.join(layout.packagesRoot, 'node_modules', CLI_PACKAGE_NAME, 'package.json')
  if (!pathExists(packagePath)) throw new Error('O pacote da fixture nao foi persistido no prefixo.')
  return JSON.parse(fs.readFileSync(packagePath, 'utf8'))
}

function findInstalledBin(layout) {
  const candidates = layout.platformName === 'win32'
    ? [
      path.join(layout.packagesBin, `${CLI_COMMAND_NAME}.cmd`),
      path.join(layout.packagesBin, `${CLI_COMMAND_NAME}.exe`),
      path.join(layout.packagesBin, CLI_COMMAND_NAME),
    ]
    : [path.join(layout.packagesBin, CLI_COMMAND_NAME)]
  const candidate = candidates.find(pathExists)
  if (!candidate) throw new Error('O npm nao criou o executavel da fixture.')
  return candidate
}

function readMarker(marker, expected) {
  try {
    return fs.readFileSync(marker, 'utf8').trim() === expected
  } catch {
    return false
  }
}

function assertCommandSuccess(result, message) {
  if (result.error || result.timedOut || result.code !== 0) {
    const details = [result.error?.message, result.stderr, result.stdout]
      .filter(Boolean)
      .join('\n')
    throw new Error(`${message} ${details}`.trim())
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

function isExecutableFile(candidate) {
  try {
    const stat = fs.statSync(candidate)
    return stat.isFile() && (process.platform === 'win32' || Boolean(stat.mode & 0o111))
  } catch {
    return false
  }
}

function validateReport(report, expectedIterations) {
  const failures = []
  const baseline = report.policies?.[NPM_RUNTIME_POLICIES.baseline]
  const current = report.policies?.[NPM_RUNTIME_POLICIES.current]

  if (!baseline || !current) {
    failures.push('as duas políticas do npm-runtime precisam produzir relatório')
    return failures
  }

  if (current.inventory.unpackedBytes >= baseline.inventory.unpackedBytes) {
    failures.push('a política atual não reduziu os bytes descompactados')
  }
  if (current.inventory.compressedBytes >= baseline.inventory.compressedBytes) {
    failures.push('a política atual não reduziu os bytes comprimidos')
  }
  if (current.inventory.files >= baseline.inventory.files) {
    failures.push('a política atual não reduziu a quantidade de arquivos')
  }

  for (const policy of [baseline, current]) {
    if (policy.samples.length !== expectedIterations) {
      failures.push(`amostras incompletas em ${policy === baseline ? 'baseline' : 'atual'}`)
    }
    if (policy.samples.some((sample) => !sample.successful || sample.exitCode !== 0)) {
      failures.push(`falha funcional em ${policy === baseline ? 'baseline' : 'atual'}`)
    }
    if (policy.samples.some((sample) => (
      !sample.offline
      || !sample.prefix
      || !sample.firstInstall.path
      || !sample.update.path
      || !sample.firstInstall.lifecycle
      || !sample.update.lifecycle
      || Object.values(sample.permissions).some((value) => !value)
    ))) {
      failures.push(`o smoke de instalação não foi completo em ${policy === baseline ? 'baseline' : 'atual'}`)
    }
  }

  return [...new Set(failures)]
}

function buildComparison(policies) {
  const baseline = policies[NPM_RUNTIME_POLICIES.baseline].inventory
  const current = policies[NPM_RUNTIME_POLICIES.current].inventory
  return {
    filesSaved: baseline.files - current.files,
    unpackedBytesSaved: baseline.unpackedBytes - current.unpackedBytes,
    unpackedReductionPercent: percentageReduction(baseline.unpackedBytes, current.unpackedBytes),
    compressedBytesSaved: baseline.compressedBytes - current.compressedBytes,
    compressedReductionPercent: percentageReduction(baseline.compressedBytes, current.compressedBytes),
  }
}

function percentageReduction(before, after) {
  return before > 0 ? Number((((before - after) / before) * 100).toFixed(2)) : null
}

function formatMs(value) {
  return value == null ? 'n/d' : `${Math.round(value)}ms`
}

function formatBytes(value) {
  return `${(value / 1024 / 1024).toFixed(2)} MiB`
}

function readPackageVersion(packagePath) {
  try {
    return JSON.parse(fs.readFileSync(packagePath, 'utf8')).version || null
  } catch {
    return null
  }
}

function pathExists(candidate) {
  try {
    fs.lstatSync(candidate)
    return true
  } catch {
    return false
  }
}

function writeReport(outputPath, report) {
  if (!outputPath) return
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

function removeTemporaryDirectory(directory) {
  try {
    fs.rmSync(directory, { recursive: true, force: true })
  } catch {
    // A bancada não deve transformar lixo temporário em falso negativo.
  }
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (options.help) {
    process.stdout.write([
      'Uso: node scripts/npm-runtime-performance.cjs [opções]',
      '',
      '--check             exige redução de tamanho e smoke funcional completo',
      '--iterations=N      repete cada política (2–10; padrão 3)',
      '--timeout-ms=N      timeout de cada processo npm (1000–600000)',
      '--out=ARQUIVO       grava o JSON de medição',
      '',
    ].join('\n'))
    return null
  }

  if (!pathExists(path.join(NPM_SOURCE, 'bin', 'npm-cli.js'))) {
    throw new Error('npm não encontrado em app/node_modules; rode npm ci antes da bancada.')
  }

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-npm-runtime-'))
  const report = createEmptyReport(options)
  const executable = resolveElectronExecutable()

  try {
    for (const policy of [NPM_RUNTIME_POLICIES.baseline, NPM_RUNTIME_POLICIES.current]) {
      report.policies[policy] = await benchmarkPolicy({
        policy,
        options,
        temporaryRoot,
        executable,
      })
    }
    report.comparison = buildComparison(report.policies)
    report.validation = options.check
      ? validateReport(report, options.iterations)
      : []
    if (report.validation.length > 0) {
      throw new Error(report.validation.join('; '))
    }
    report.result = 'passed'
  } catch (error) {
    report.result = 'failed'
    report.error = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    writeReport(options.out, report)
    removeTemporaryDirectory(temporaryRoot)
  }

  const baseline = report.policies.baseline.inventory
  const current = report.policies.current.inventory
  process.stdout.write(
    `[npm-runtime] ${formatBytes(baseline.unpackedBytes)} -> ${formatBytes(current.unpackedBytes)} `
    + `(${report.comparison.unpackedReductionPercent}% descompactado); `
    + `${formatBytes(baseline.compressedBytes)} -> ${formatBytes(current.compressedBytes)} `
    + `(${report.comparison.compressedReductionPercent}% tar.gz)\n`,
  )
  return report
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`[npm-runtime] falhou: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}

module.exports = {
  buildComparison,
  measureTree,
  parseArgs,
  percentile,
  summarize,
  validateReport,
}
