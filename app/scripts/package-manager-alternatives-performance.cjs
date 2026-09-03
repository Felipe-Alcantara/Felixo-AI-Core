'use strict'

/**
 * Compara o npm-runtime distribuído com alternativas de gerenciador sem
 * alterar a instalação do usuário nem a política de produção.
 *
 * O npm é medido pela bancada existente. pnpm e Yarn Classic recebem um
 * pacote local em um prefixo descartável, com o Node do Electron e sem rede.
 * Yarn moderno é registrado como incompatível com a instalação global que o
 * launcher precisa, e Corepack é medido como ponte/bootstrap, não como um
 * gerenciador que instala CLIs por si só.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { performance } = require('node:perf_hooks')
const { spawn, spawnSync } = require('node:child_process')
const tar = require('tar')
const { ensureManagedCliRuntime } = require('../electron/services/managed-cli-runtime.cjs')
const npmBenchmark = require('./npm-runtime-performance.cjs')

const APP_ROOT = path.join(__dirname, '..')
const DEFAULT_ITERATIONS = 2
const MAX_ITERATIONS = 5
const DEFAULT_TIMEOUT_MS = 120_000
const MAX_TIMEOUT_MS = 600_000
const CLI_PACKAGE_NAME = 'felixo-package-manager-benchmark-cli'
const CLI_COMMAND_NAME = 'felixo-package-manager-benchmark-cli'
const CLI_OUTPUT_PREFIX = 'FELIXO_PACKAGE_MANAGER_BENCHMARK'

const MANAGER_SPECS = [
  {
    id: 'pnpm',
    name: 'pnpm',
    version: process.env.FELIXO_PNPM_VERSION || '11.25.0',
    entryCandidates: ['bin/pnpm.cjs', 'bin/pnpm.mjs'],
    kind: 'alternative',
    globalModel: 'global-dir + PNPM_HOME/bin',
  },
  {
    id: 'yarn-classic',
    name: 'Yarn Classic',
    managerName: 'yarn',
    version: process.env.FELIXO_YARN_CLASSIC_VERSION || '1.22.22',
    entryCandidates: ['bin/yarn.js'],
    kind: 'alternative',
    globalModel: 'global-folder + prefix/bin',
  },
  {
    id: 'yarn-modern',
    name: 'Yarn moderno',
    managerName: 'yarn',
    version: process.env.FELIXO_YARN_MODERN_VERSION || '4.10.3',
    entryCandidates: ['yarn.js'],
    kind: 'unsupported',
    globalModel: 'sem instalação global npm-style',
  },
]

function parseArgs(argv = []) {
  const options = {
    check: false,
    help: false,
    iterations: DEFAULT_ITERATIONS,
    out: null,
    strict: false,
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
    if (argument === '--strict') {
      options.strict = true
      continue
    }
    if (argument.startsWith('--iterations=')) {
      options.iterations = parseBoundedInteger(
        argument.slice('--iterations='.length),
        1,
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

function pathExists(target) {
  try {
    fs.lstatSync(target)
    return true
  } catch {
    return false
  }
}

function readPackageVersion(packageJsonPath) {
  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version || null
  } catch {
    return null
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

async function measureCompressedBytes(root, temporaryRoot, label) {
  const archivePath = path.join(temporaryRoot, `${label}.tar.gz`)
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

function findExecutable(command) {
  const locator = process.platform === 'win32' ? 'where' : 'which'
  const result = spawnSync(locator, [command], { encoding: 'utf8' })
  if (result.status !== 0) return null
  return String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || null
}

function resolveElectronExecutable() {
  return npmBenchmark.resolveElectronExecutable()
}

function appendOutput(current, chunk) {
  const next = current + String(chunk || '')
  return next.length > 32_000 ? next.slice(-32_000) : next
}

function runProcess(command, args, { cwd, env, timeoutMs, shell = false }) {
  return new Promise((resolve) => {
    const startedAt = performance.now()
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    let timer = null

    let child
    try {
      child = spawn(command, args, {
        cwd,
        env,
        shell,
        windowsHide: true,
      })
    } catch (error) {
      resolve({
        code: null,
        durationMs: Number((performance.now() - startedAt).toFixed(3)),
        error: error instanceof Error ? error.message : String(error),
        stderr,
        stdout,
        timedOut,
      })
      return
    }

    const finish = (result) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve({
        code: result.code,
        durationMs: Number((performance.now() - startedAt).toFixed(3)),
        error: result.error || null,
        stderr,
        stdout,
        timedOut,
      })
    }

    child.stdout?.on('data', (chunk) => {
      stdout = appendOutput(stdout, chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr = appendOutput(stderr, chunk)
    })
    child.once('error', (error) => {
      finish({ code: null, error: error.message })
    })
    child.once('close', (code) => {
      finish({ code })
    })

    timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)
  })
}

function runtimeEnvironment(extra = {}) {
  const environment = {
    ...process.env,
    ...extra,
    ELECTRON_RUN_AS_NODE: '1',
    ELECTRON_NO_ATTACH_CONSOLE: '1',
  }
  delete environment.ELECTRON_IS_DEV
  return environment
}

function managerEnvironment(extra = {}) {
  return runtimeEnvironment({
    ...extra,
    PATH: joinPathEntries(extra.PATH || process.env.PATH || process.env.Path || ''),
  })
}

function joinPathEntries(...values) {
  return values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .flatMap((value) => String(value || '').split(path.delimiter))
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(path.delimiter)
}

function runManager(manager, executable, args, options) {
  return runProcess(
    executable,
    [manager.entry, ...args],
    {
      ...options,
      env: managerEnvironment(options.env),
    },
  )
}

function runCorepack(corepackPath, managerSpec, args, { cwd, env, timeoutMs }) {
  return runProcess(
    corepackPath,
    [managerSpec, ...args],
    {
      cwd,
      env: {
        ...process.env,
        ...env,
        COREPACK_DEFAULT_TO_LATEST: '0',
        COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
      },
      shell: commandShell(corepackPath),
      timeoutMs,
    },
  )
}

function pickLastOutputLine(result) {
  return [...String(result.stdout || '').split(/\r?\n/), ...String(result.stderr || '').split(/\r?\n/)]
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1) || null
}

function findPackageManifest(root, packageName, maxEntries = 20_000) {
  if (!pathExists(root)) return null

  const queue = [root]
  const visited = new Set()
  let inspected = 0

  while (queue.length > 0 && inspected < maxEntries) {
    const current = queue.shift()
    let realCurrent
    try {
      realCurrent = fs.realpathSync(current)
    } catch {
      continue
    }
    if (visited.has(realCurrent)) continue
    visited.add(realCurrent)

    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      inspected += 1
      const child = path.join(current, entry.name)
      if (entry.isFile() && entry.name === 'package.json') {
        try {
          const manifest = JSON.parse(fs.readFileSync(child, 'utf8'))
          if (manifest.name === packageName) return { manifest, path: child }
        } catch {
          // O diretório ainda pode conter outros pacotes válidos.
        }
      } else if (entry.isDirectory() || entry.isSymbolicLink()) {
        queue.push(child)
      }
    }
  }

  return null
}

function findExecutablePath(binDir) {
  if (!binDir) return null
  const names = process.platform === 'win32'
    ? [CLI_COMMAND_NAME, `${CLI_COMMAND_NAME}.cmd`, `${CLI_COMMAND_NAME}.exe`]
    : [CLI_COMMAND_NAME]
  return names.map((name) => path.join(binDir, name)).find(pathExists) || null
}

function isPathWithin(root, target) {
  if (!root || !target) return false
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function normalizeError(result, temporaryRoot) {
  const text = String(result.error || result.stderr || result.stdout || `exit code ${result.code}`)
    .trim()
    .replaceAll(temporaryRoot, '<temp>')
    .replaceAll(process.cwd(), '<repo>')
    .replaceAll(os.homedir(), '<home>')
  return text.slice(-1_000) || `exit code ${result.code}`
}

function createCliFixture(root, version) {
  const packageRoot = path.join(root, 'package')
  fs.mkdirSync(packageRoot, { recursive: true })
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({
    name: CLI_PACKAGE_NAME,
    version,
    bin: {
      [CLI_COMMAND_NAME]: 'cli.cjs',
    },
    description: 'Fixture local da bancada de gerenciadores de pacotes.',
  }, null, 2) + '\n', 'utf8')
  const cliPath = path.join(packageRoot, 'cli.cjs')
  fs.writeFileSync(cliPath, [
    '#!/usr/bin/env node',
    `process.stdout.write('${CLI_OUTPUT_PREFIX}_${version}\\n')`,
    '',
  ].join('\n'), 'utf8')
  if (process.platform !== 'win32') fs.chmodSync(cliPath, 0o755)
  return packageRoot
}

async function createCliArchive(temporaryRoot, version) {
  const fixtureRoot = path.join(temporaryRoot, `fixture-${version}`)
  createCliFixture(fixtureRoot, version)
  const archivePath = path.join(temporaryRoot, `fixture-${version}.tgz`)
  await tar.c({
    cwd: fixtureRoot,
    file: archivePath,
    gzip: true,
    mtime: new Date(0),
    portable: true,
  }, ['package'])
  return archivePath
}

function createRuntimeShim(runtimeBin, executable) {
  return ensureManagedCliRuntime({
    layout: { runtimeBin },
    nodeExecutable: executable,
    npmCliPath: null,
    platformName: process.platform,
  })
}

function pathWithRuntime(runtimeBin, extraEntries = []) {
  const current = process.env.PATH || process.env.Path || ''
  return joinPathEntries(extraEntries, runtimeBin, current)
}

function commandShell(command) {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)
}

async function installWithPnpm({ manager, executable, archivePath, version, sampleRoot, options }) {
  const pnpmHome = path.join(sampleRoot, 'pnpm-home')
  const globalDir = path.join(sampleRoot, 'pnpm-global')
  const storeDir = path.join(sampleRoot, 'pnpm-store')
  const runtimeBin = path.join(sampleRoot, 'runtime-bin')
  fs.mkdirSync(pnpmHome, { recursive: true })
  fs.mkdirSync(globalDir, { recursive: true })
  fs.mkdirSync(storeDir, { recursive: true })
  const runtime = createRuntimeShim(runtimeBin, executable)
  const environment = {
    PNPM_HOME: pnpmHome,
    PATH: pathWithRuntime(runtimeBin, [path.join(pnpmHome, 'bin'), pnpmHome]),
  }
  if (process.platform === 'win32') environment.Path = environment.PATH

  const result = await runManager(manager, executable, [
    'add',
    '--global',
    '--global-dir', globalDir,
    '--store-dir', storeDir,
    '--offline',
    '--ignore-scripts',
    archivePath,
  ], {
    cwd: sampleRoot,
    env: environment,
    timeoutMs: options.timeoutMs,
  })
  if (result.code !== 0) {
    return { error: normalizeError(result, options.temporaryRoot), result, runtime }
  }

  const binResult = await runManager(manager, executable, ['bin', '--global'], {
    cwd: sampleRoot,
    env: environment,
    timeoutMs: options.timeoutMs,
  })
  const binDir = pickLastOutputLine(binResult)
  const executablePath = findExecutablePath(binDir) || findExecutablePath(path.join(pnpmHome, 'bin'))
  const rootResult = await runManager(manager, executable, ['root', '--global'], {
    cwd: sampleRoot,
    env: environment,
    timeoutMs: options.timeoutMs,
  })
  const manifest = findPackageManifest(globalDir, CLI_PACKAGE_NAME)
  const smoke = executablePath
    ? await runProcess(executablePath, [], {
      cwd: sampleRoot,
      env: managerEnvironment({ PATH: pathWithRuntime(runtimeBin, [binDir, path.join(pnpmHome, 'bin')]) }),
      shell: commandShell(executablePath),
      timeoutMs: options.timeoutMs,
    })
    : null

  return {
    binDir,
    executable: Boolean(executablePath),
    manifest: Boolean(manifest && manifest.manifest.version === version),
    profileIsolation: Boolean(
      isPathWithin(sampleRoot, binDir)
      && isPathWithin(sampleRoot, executablePath)
      && isPathWithin(sampleRoot, manifest?.path)
      && isPathWithin(sampleRoot, pickLastOutputLine(rootResult)),
    ),
    prefix: rootResult.code === 0 && Boolean(pickLastOutputLine(rootResult)),
    result,
    root: rootResult,
    runtime,
    smoke: smoke && {
      durationMs: smoke.durationMs,
      output: String(smoke.stdout || '').trim(),
      successful: smoke.code === 0 && String(smoke.stdout || '').includes(`${CLI_OUTPUT_PREFIX}_${version}`),
    },
  }
}

async function installWithYarnClassic({ manager, executable, archivePath, version, sampleRoot, options }) {
  const prefix = path.join(sampleRoot, 'yarn-prefix')
  const globalFolder = path.join(sampleRoot, 'yarn-global')
  const cacheFolder = path.join(sampleRoot, 'yarn-cache')
  const runtimeBin = path.join(sampleRoot, 'runtime-bin')
  fs.mkdirSync(prefix, { recursive: true })
  fs.mkdirSync(globalFolder, { recursive: true })
  fs.mkdirSync(cacheFolder, { recursive: true })
  const runtime = createRuntimeShim(runtimeBin, executable)
  const environment = {
    YARN_CACHE_FOLDER: cacheFolder,
    PATH: pathWithRuntime(runtimeBin),
  }
  if (process.platform === 'win32') environment.Path = environment.PATH
  const installArgs = [
    'global',
    'add',
    `file:${archivePath}`,
    '--prefix', prefix,
    '--global-folder', globalFolder,
    '--cache-folder', cacheFolder,
    '--offline',
    '--ignore-scripts',
    '--non-interactive',
  ]
  const result = await runManager(manager, executable, installArgs, {
    cwd: sampleRoot,
    env: environment,
    timeoutMs: options.timeoutMs,
  })
  if (result.code !== 0) {
    return { error: normalizeError(result, options.temporaryRoot), result, runtime }
  }

  const binResult = await runManager(manager, executable, [
    'global', 'bin', '--prefix', prefix, '--global-folder', globalFolder,
  ], {
    cwd: sampleRoot,
    env: environment,
    timeoutMs: options.timeoutMs,
  })
  const binDir = pickLastOutputLine(binResult)
  const executablePath = findExecutablePath(binDir) || findExecutablePath(path.join(prefix, 'bin'))
  const dirResult = await runManager(manager, executable, [
    'global', 'dir', '--prefix', prefix, '--global-folder', globalFolder,
  ], {
    cwd: sampleRoot,
    env: environment,
    timeoutMs: options.timeoutMs,
  })
  const manifest = findPackageManifest(globalFolder, CLI_PACKAGE_NAME)
  const smoke = executablePath
    ? await runProcess(executablePath, [], {
      cwd: sampleRoot,
      env: managerEnvironment({ PATH: pathWithRuntime(runtimeBin, [binDir]) }),
      shell: commandShell(executablePath),
      timeoutMs: options.timeoutMs,
    })
    : null

  return {
    binDir,
    executable: Boolean(executablePath),
    manifest: Boolean(manifest && manifest.manifest.version === version),
    profileIsolation: Boolean(
      isPathWithin(sampleRoot, binDir)
      && isPathWithin(sampleRoot, executablePath)
      && isPathWithin(sampleRoot, manifest?.path)
      && isPathWithin(sampleRoot, pickLastOutputLine(dirResult)),
    ),
    prefix: dirResult.code === 0 && Boolean(pickLastOutputLine(dirResult)),
    result,
    root: dirResult,
    runtime,
    smoke: smoke && {
      durationMs: smoke.durationMs,
      output: String(smoke.stdout || '').trim(),
      successful: smoke.code === 0 && String(smoke.stdout || '').includes(`${CLI_OUTPUT_PREFIX}_${version}`),
    },
  }
}

async function updateAlternative({ candidate, manager, executable, archivePath, version, sampleRoot, options }) {
  if (candidate.id === 'pnpm') {
    return installWithPnpm({ manager, executable, archivePath, version, sampleRoot, options })
  }

  return installWithYarnClassic({ manager, executable, archivePath, version, sampleRoot, options })
}

async function benchmarkAlternative(candidate, context) {
  const samples = []
  for (let iteration = 1; iteration <= context.options.iterations; iteration += 1) {
    const sampleRoot = path.join(context.temporaryRoot, `${candidate.id}-sample-${iteration}`)
    fs.mkdirSync(sampleRoot, { recursive: true })
    const firstVersion = `1.0.${iteration}`
    const updatedVersion = `1.1.${iteration}`
    const firstArchive = await createCliArchive(sampleRoot, firstVersion)
    const updatedArchive = await createCliArchive(sampleRoot, updatedVersion)
    const firstStartedAt = performance.now()
    const first = candidate.id === 'pnpm'
      ? await installWithPnpm({
        manager: candidate.manager,
        executable: context.executable,
        archivePath: firstArchive,
        version: firstVersion,
        sampleRoot,
        options: context.options,
      })
      : await installWithYarnClassic({
        manager: candidate.manager,
        executable: context.executable,
        archivePath: firstArchive,
        version: firstVersion,
        sampleRoot,
        options: context.options,
      })
    const updateStartedAt = performance.now()
    const update = first.error
      ? { error: 'primeira instalação falhou; atualização não executada', result: null }
      : await updateAlternative({
        candidate,
        manager: candidate.manager,
        executable: context.executable,
        archivePath: updatedArchive,
        version: updatedVersion,
        sampleRoot,
        options: context.options,
      })
    const firstInstallMs = Number((updateStartedAt - firstStartedAt).toFixed(3))
    const updateMs = Number((performance.now() - updateStartedAt).toFixed(3))
    const sample = {
      firstInstallMs,
      first: summarizeAlternativeStep(first, firstVersion),
      updateMs,
      update: summarizeAlternativeStep(update, updatedVersion),
      successful: !first.error && !update.error
        && first.manifest && first.executable && first.prefix
        && first.profileIsolation
        && update.manifest && update.executable && update.prefix
        && update.profileIsolation
        && first.smoke?.successful && update.smoke?.successful,
    }
    samples.push(sample)
    console.log(
      `[package-managers:${candidate.id}] ${iteration}/${context.options.iterations} `
      + `install=${formatMs(firstInstallMs)} update=${formatMs(updateMs)} `
      + `status=${sample.successful ? 'ok' : 'falhou'}`,
    )
  }

  return {
    samples,
    summary: {
      firstInstallMs: npmBenchmark.summarize(samples.map((sample) => sample.firstInstallMs)),
      updateMs: npmBenchmark.summarize(samples.map((sample) => sample.updateMs)),
    },
    successful: samples.every((sample) => sample.successful),
  }
}

function summarizeAlternativeStep(step, version) {
  return {
    error: step.error || null,
    executable: Boolean(step.executable),
    manifest: Boolean(step.manifest),
    output: step.smoke?.output || null,
    profileIsolation: Boolean(step.profileIsolation),
    prefix: Boolean(step.prefix),
    successful: Boolean(
      step.smoke?.successful
      && step.manifest
      && step.executable
      && step.prefix
      && step.profileIsolation,
    ),
    version,
  }
}

async function resolveCorepackManager({ candidate, corepackPath, executable, temporaryRoot, options }) {
  const managerName = candidate.managerName || candidate.name
  const managerSpec = `${managerName}@${candidate.version}`
  const corepackHome = path.join(temporaryRoot, 'corepack', candidate.id)
  const cwd = path.join(temporaryRoot, 'corepack-cwd', candidate.id)
  fs.mkdirSync(corepackHome, { recursive: true })
  fs.mkdirSync(cwd, { recursive: true })
  const environment = {
    COREPACK_HOME: corepackHome,
    COREPACK_ENABLE_NETWORK: '1',
  }
  const cold = await runCorepack(corepackPath, managerSpec, ['--version'], {
    cwd,
    env: environment,
    timeoutMs: options.timeoutMs,
  })
  const warm = cold.code === 0
    ? await runCorepack(corepackPath, managerSpec, ['--version'], {
      cwd,
      env: environment,
      timeoutMs: options.timeoutMs,
    })
    : null
  const reportedVersion = pickLastOutputLine(cold)
  const managerRoot = resolveManagerRoot(corepackHome, managerName, reportedVersion || candidate.version)
  const entry = managerRoot && candidate.entryCandidates
    .map((relative) => path.join(managerRoot, relative))
    .find(pathExists)
  if (cold.code !== 0 || !managerRoot || !entry) {
    return {
      availability: 'unavailable',
      bootstrap: {
        coldMs: cold.durationMs,
        error: normalizeError(cold, temporaryRoot),
        warmMs: warm?.durationMs || null,
      },
      error: normalizeError(cold, temporaryRoot),
      manager: null,
      startup: null,
    }
  }

  const startup = await runProcess(executable, [entry, '--version'], {
    cwd,
    env: runtimeEnvironment({ PATH: process.env.PATH || process.env.Path || '' }),
    timeoutMs: options.timeoutMs,
  })

  return {
    availability: 'ready',
    bootstrap: {
      coldMs: cold.durationMs,
      error: null,
      warmMs: warm?.durationMs || null,
    },
    manager: {
      entry,
      managerRoot,
      version: reportedVersion || candidate.version,
    },
    startup: {
      durationMs: startup.durationMs,
      successful: startup.code === 0,
    },
  }
}

function resolveManagerRoot(corepackHome, managerName, version) {
  const direct = path.join(corepackHome, 'v1', managerName, version)
  if (pathExists(direct)) return direct
  const managerRoot = path.join(corepackHome, 'v1', managerName)
  if (!pathExists(managerRoot)) return null
  try {
    const versions = fs.readdirSync(managerRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(managerRoot, entry.name))
    return versions.find((entry) => pathExists(path.join(entry, 'package.json'))) || null
  } catch {
    return null
  }
}

function resolveCorepackPackageRoot(corepackPath) {
  try {
    const realPath = fs.realpathSync(corepackPath)
    const candidates = [
      path.dirname(realPath),
      path.dirname(path.dirname(realPath)),
    ]
    return candidates.find((candidate) => pathExists(path.join(candidate, 'package.json'))) || null
  } catch {
    return null
  }
}

function buildRuntimeInventory(root, temporaryRoot, label) {
  if (!root || !pathExists(root)) return null
  const tree = measureTree(root)
  return {
    compressedBytes: null,
    files: tree.files,
    unpackedBytes: tree.bytes,
    archivePending: { root, temporaryRoot, label },
  }
}

async function finalizeRuntimeInventory(inventory) {
  if (!inventory) return null
  const compressedBytes = await measureCompressedBytes(
    inventory.archivePending.root,
    inventory.archivePending.temporaryRoot,
    inventory.archivePending.label,
  )
  delete inventory.archivePending
  inventory.compressedBytes = compressedBytes
  return inventory
}

async function benchmarkModernYarn(candidate, context) {
  const sampleRoot = path.join(context.temporaryRoot, `${candidate.id}-probe`)
  fs.mkdirSync(sampleRoot, { recursive: true })
  const probe = await runManager(candidate.manager, context.executable, ['global', 'add', 'example-package'], {
    cwd: sampleRoot,
    env: { PATH: pathWithRuntime(path.join(sampleRoot, 'runtime-bin')) },
    timeoutMs: context.options.timeoutMs,
  })
  return {
    availability: candidate.availability,
    reason: 'Yarn moderno não oferece a instalação global npm-style exigida pelo launcher; a alternativa é projeto/dlx.',
    probe: {
      exitCode: probe.code,
      expectedFailure: probe.code !== 0,
      error: probe.code === 0 ? null : normalizeError(probe, context.temporaryRoot),
    },
  }
}

function buildRecommendation(report) {
  const npm = report.candidates.npm
  const pnpm = report.candidates.pnpm
  const yarnClassic = report.candidates['yarn-classic']
  const reasons = [
    'Manter o npm-runtime nesta versão: ele já tem instalação global isolada por userData, shims node/npm, atualização e smoke offline cobertos pelo produto.',
    'pnpm reduz o modelo de armazenamento com um store global e exige uma política adicional para PNPM_HOME, global-dir, scripts de build e cache offline; a medição não autoriza substituir o runtime sem essa camada.',
    'Yarn Classic preserva o conceito global, mas adiciona prefix/global-folder/cache-folder próprios e sua manutenção está separada do fluxo atual do npm.',
    'Yarn moderno não é substituto direto: PnP/dlx e a ausência de global add mudam a instalação e o ciclo de vida das CLIs.',
    'Corepack é uma ponte que baixa/seleciona gerenciadores; não elimina o custo de distribuir ou pré-popular os gerenciadores e introduz política de versão/cache/rede.',
  ]
  const gates = [
    'Definir versões fixas e hashes dos gerenciadores e do cache antes de qualquer migração.',
    'Repetir o smoke de instalação, atualização, PATH, shims, permissões, prefixo e persistência na matriz Linux/Windows/macOS.',
    'Testar CLIs oficiais reais com scripts nativos, proxy, rede bloqueada e primeiro uso sem internet.',
    'Medir startup, primeira CLI, atualização, memória e tamanho do artefato no instalador real.',
  ]
  return {
    decision: 'manter-npm-runtime',
    reasons,
    gates,
    measured: {
      npm: npm?.status || 'unavailable',
      pnpm: pnpm?.status || 'unavailable',
      yarnClassic: yarnClassic?.status || 'unavailable',
    },
  }
}

function validateReport(report, { strict = false } = {}) {
  const failures = []
  const npm = report.candidates?.npm
  if (!npm || npm.status !== 'passed') failures.push('npm-runtime não concluiu o smoke atual.')

  for (const id of ['pnpm', 'yarn-classic']) {
    const candidate = report.candidates?.[id]
    if (candidate?.status === 'available' && candidate.startup?.successful !== true) {
      failures.push(`${candidate.name} foi encontrado, mas não iniciou pelo Electron.`)
    }
    if (candidate?.status === 'available' && !candidate.benchmark?.successful) {
      failures.push(`${candidate.name} foi encontrado, mas falhou no smoke local.`)
    }
    if (strict && (!candidate || candidate.status !== 'available')) {
      failures.push(`${id} não ficou disponível nesta máquina.`)
    }
  }

  const modern = report.candidates?.['yarn-modern']
  if (modern?.status === 'available' && modern.benchmark?.probe?.expectedFailure !== true) {
    failures.push('Yarn moderno aceitou global add; revisar a classificação de compatibilidade.')
  }
  return failures
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return 'n/a'
  if (value < 1_024) return `${value} B`
  if (value < 1_024 * 1_024) return `${(value / 1_024).toFixed(1)} KiB`
  return `${(value / (1_024 * 1_024)).toFixed(2)} MiB`
}

function formatMs(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}ms` : 'n/a'
}

function createReport(options) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    electron: readPackageVersion(path.join(APP_ROOT, 'node_modules', 'electron', 'package.json')),
    method: {
      iterations: options.iterations,
      timeoutMs: options.timeoutMs,
      offlineFixture: true,
      lifecycleScripts: false,
      profileIsolation: 'cada prefixo, store/cache e binário deve ficar dentro do userData descartável da amostra',
      note: 'npm preserva o smoke de lifecycle da bancada própria; alternativas medem instalação, atualização, prefixo, binário e execução sem scripts externos.',
    },
    candidates: {},
    recommendation: null,
    validation: [],
    result: 'failed',
    error: null,
  }
}

async function benchmarkNpm(options, temporaryRoot, executable) {
  const policy = npmBenchmark.NPM_RUNTIME_POLICIES.current
  const result = await npmBenchmark.benchmarkPolicy({
    policy,
    options,
    temporaryRoot: path.join(temporaryRoot, 'npm-runtime'),
    executable,
  })
  return {
    name: 'npm-runtime',
    status: 'passed',
    source: 'dependência npm empacotada no app',
    version: readPackageVersion(path.join(APP_ROOT, 'node_modules', 'npm', 'package.json')),
    runtime: result.inventory,
    benchmark: {
      successful: result.samples.every((sample) => sample.successful),
      samples: result.samples,
      summary: result.summary,
    },
  }
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (options.help) {
    process.stdout.write([
      'Uso: node scripts/package-manager-alternatives-performance.cjs [opções]',
      '',
      '--check             falha se um gerenciador disponível reprovar o smoke',
      '--strict            também exige pnpm e Yarn Classic disponíveis',
      '--iterations=N      repete cada instalação (1–5; padrão 2)',
      '--timeout-ms=N      timeout de cada processo (1000–600000)',
      '--out=ARQUIVO       grava o JSON de medição',
      '',
    ].join('\n'))
    return null
  }

  if (!pathExists(path.join(APP_ROOT, 'node_modules', 'npm', 'bin', 'npm-cli.js'))) {
    throw new Error('npm não encontrado em app/node_modules; rode npm ci antes da bancada.')
  }

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-package-managers-'))
  options.temporaryRoot = temporaryRoot
  const report = createReport(options)
  const executable = resolveElectronExecutable()
  const corepackPath = findExecutable('corepack')

  try {
    report.candidates.npm = await benchmarkNpm(options, temporaryRoot, executable)

    let corepackInventory = null
    if (corepackPath) {
      const corepackRoot = resolveCorepackPackageRoot(corepackPath)
      corepackInventory = buildRuntimeInventory(corepackRoot, temporaryRoot, 'corepack')
      if (corepackInventory) corepackInventory = await finalizeRuntimeInventory(corepackInventory)
    }

    for (const spec of MANAGER_SPECS) {
      const candidate = {
        id: spec.id,
        name: spec.name,
        status: 'unavailable',
        source: corepackPath ? `Corepack ${spec.version}` : 'não encontrado no PATH',
        version: spec.version,
        globalModel: spec.globalModel,
        runtime: null,
        bootstrap: null,
        benchmark: null,
        error: null,
      }
      report.candidates[spec.id] = candidate

      if (!corepackPath) {
        candidate.error = 'Corepack não encontrado; a comparação alternativa foi registrada como indisponível neste host.'
        continue
      }

      const resolved = await resolveCorepackManager({
        candidate: spec,
        corepackPath,
        executable,
        temporaryRoot,
        options,
      })
      candidate.bootstrap = resolved.bootstrap
      if (resolved.availability !== 'ready') {
        candidate.error = resolved.error
        continue
      }

      candidate.status = 'available'
      candidate.version = resolved.manager.version
      candidate.startup = resolved.startup
      candidate.runtime = await finalizeRuntimeInventory(buildRuntimeInventory(
        resolved.manager.managerRoot,
        temporaryRoot,
        spec.id,
      ))

      if (spec.kind === 'unsupported') {
        candidate.benchmark = await benchmarkModernYarn({
          ...spec,
          availability: candidate.status,
          manager: resolved.manager,
        }, {
          executable,
          options,
          temporaryRoot,
        })
      } else {
        candidate.manager = resolved.manager
        candidate.benchmark = await benchmarkAlternative(candidate, {
          executable,
          options,
          temporaryRoot,
        })
        delete candidate.manager
      }
    }

    report.candidates.corepack = {
      name: 'Corepack',
      status: corepackPath ? 'available' : 'unavailable',
      source: 'ponte de seleção/bootstrap, não instalador persistente de CLI',
      version: corepackPath
        ? (await runProcess(corepackPath, ['--version'], {
          cwd: temporaryRoot,
          env: process.env,
          shell: commandShell(corepackPath),
          timeoutMs: options.timeoutMs,
        })).stdout.trim()
        : null,
      runtime: corepackInventory,
      benchmark: {
        managers: Object.fromEntries(MANAGER_SPECS.map((spec) => [spec.id, {
          coldMs: report.candidates[spec.id].bootstrap?.coldMs || null,
          directMs: report.candidates[spec.id].startup?.durationMs || null,
          warmMs: report.candidates[spec.id].bootstrap?.warmMs || null,
        }])),
      },
    }

    report.recommendation = buildRecommendation(report)
    report.validation = options.check
      ? validateReport(report, { strict: options.strict })
      : []
    report.result = report.validation.length > 0 ? 'failed' : 'passed'
    if (report.result === 'failed') throw new Error(report.validation.join('; '))
  } catch (error) {
    report.result = 'failed'
    report.error = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    if (options.out) {
      fs.mkdirSync(path.dirname(options.out), { recursive: true })
      fs.writeFileSync(options.out, JSON.stringify(report, null, 2) + '\n', 'utf8')
    }
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }

  const summary = Object.values(report.candidates)
    .map((candidate) => `${candidate.name}=${candidate.status}`)
    .join(' ')
  process.stdout.write(`[package-managers] ${summary}; decisão=${report.recommendation.decision}\n`)
  return report
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`[package-managers] falhou: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}

module.exports = {
  buildRecommendation,
  measureTree,
  parseArgs,
  validateReport,
}
