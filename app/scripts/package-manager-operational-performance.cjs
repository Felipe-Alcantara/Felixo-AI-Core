'use strict'

/**
 * Mede o custo operacional dos gerenciadores que podem substituir o
 * npm-runtime do instalador.
 *
 * A bancada não instala nada no ambiente do usuário. Cada gerenciador recebe
 * um prefixo, cache e configuração temporários; os processos filhos são amostrados
 * pela árvore de PID e os arquivos criados são contabilizados no diretório de
 * trabalho. O relatório não carrega comandos, caminhos privados ou conteúdo
 * da fixture.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFile, execFileSync } = require('node:child_process')
const { promisify } = require('node:util')
const spawn = require('cross-spawn')
const { performance } = require('node:perf_hooks')

const execFileAsync = promisify(execFile)

const APP_ROOT = path.join(__dirname, '..')
const DEFAULT_ITERATIONS = 2
const MAX_ITERATIONS = 5
const DEFAULT_TIMEOUT_MS = 120_000
const MAX_TIMEOUT_MS = 600_000
const DEFAULT_AGENT_COUNTS = [1, 2, 5, 10]
const FIXTURE_NAME = 'felixo-package-manager-benchmark-cli'
const FIXTURE_COMMAND = 'felixo-package-manager-benchmark-cli'

function parseBoundedInteger(value, min, max, name) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} deve estar entre ${min} e ${max}.`)
  }
  return parsed
}

function parseArgs(argv = []) {
  const options = {
    check: false,
    help: false,
    iterations: DEFAULT_ITERATIONS,
    agentCounts: [...DEFAULT_AGENT_COUNTS],
    out: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    runtimeRoot: null,
  }

  for (const argument of argv) {
    if (argument === '--check') options.check = true
    else if (argument === '--help') options.help = true
    else if (argument.startsWith('--iterations=')) {
      options.iterations = parseBoundedInteger(argument.slice(13), 1, MAX_ITERATIONS, 'iterations')
    } else if (argument.startsWith('--agents=')) {
      const values = argument.slice(9).split(',').map((value) => parseBoundedInteger(value, 1, 10, 'agents'))
      if (values.length === 0 || new Set(values).size !== values.length) throw new Error('agents deve conter contagens únicas.')
      options.agentCounts = values
    } else if (argument.startsWith('--timeout-ms=')) {
      options.timeoutMs = parseBoundedInteger(argument.slice(13), 1_000, MAX_TIMEOUT_MS, 'timeout-ms')
    } else if (argument.startsWith('--out=')) {
      const value = argument.slice(6).trim()
      if (!value) throw new Error('--out precisa apontar para um arquivo.')
      options.out = path.resolve(value)
    } else if (argument.startsWith('--runtime-root=')) {
      const value = argument.slice(15).trim()
      if (!value) throw new Error('--runtime-root precisa apontar para uma pasta.')
      options.runtimeRoot = path.resolve(value)
    } else {
      throw new Error(`Argumento desconhecido: ${argument}`)
    }
  }
  return options
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
    max: clean.length ? Number(Math.max(...clean).toFixed(3)) : null,
  }
}

function summarizePositive(values) {
  return summarize(values.filter((value) => Number.isFinite(value) && value > 0))
}

function normalizePath(value) {
  return path.normalize(String(value)).replace(/[\\/]$/, '').toLowerCase()
}

function findPackagedRuntime(releaseRoot = path.join(APP_ROOT, 'release')) {
  if (!fs.existsSync(releaseRoot)) return null
  const pending = [releaseRoot]
  const visited = new Set()
  while (pending.length) {
    const current = pending.pop()
    const normalized = normalizePath(current)
    if (visited.has(normalized)) continue
    visited.add(normalized)
    let entries
    try { entries = fs.readdirSync(current, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      const child = path.join(current, entry.name)
      if (entry.isDirectory() && entry.name === 'npm-runtime') {
        if (fs.existsSync(path.join(child, 'bin', 'npm-cli.js'))) return child
        const nested = path.join(child, 'npm')
        if (fs.existsSync(path.join(nested, 'bin', 'npm-cli.js'))) return nested
      }
      if (entry.isDirectory() && !entry.isSymbolicLink()) pending.push(child)
    }
  }
  return null
}

function measureTree(root) {
  if (!fs.existsSync(root)) return { files: 0, bytes: 0 }
  const stat = fs.lstatSync(root)
  if (stat.isSymbolicLink()) return { files: 0, bytes: 0 }
  if (!stat.isDirectory()) return { files: stat.isFile() ? 1 : 0, bytes: stat.size }
  return fs.readdirSync(root, { withFileTypes: true }).reduce((total, entry) => {
    const child = measureTree(path.join(root, entry.name))
    return { files: total.files + child.files, bytes: total.bytes + child.bytes }
  }, { files: 0, bytes: 0 })
}

function readPackageVersion(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).version ?? null } catch { return null }
}

function executableOnPath(command, env = process.env) {
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
  const suffixes = process.platform === 'win32' ? ['.cmd', '.exe', '.bat', '', '.ps1'] : ['']
  for (const directory of String(env[pathKey] ?? '').split(path.delimiter)) {
    if (!directory) continue
    for (const suffix of suffixes) {
      const candidate = path.join(directory, `${command}${suffix}`)
      if (fs.existsSync(candidate)) return candidate
    }
  }
  return null
}

function discoverManagers({ env = process.env, runtimeRoot = null } = {}) {
  const packagedRuntime = runtimeRoot ?? findPackagedRuntime()
  const npmCli = packagedRuntime
    ? path.join(packagedRuntime, 'bin', 'npm-cli.js')
    : path.join(APP_ROOT, 'node_modules', 'npm', 'bin', 'npm-cli.js')
  const managers = [{
    id: 'npm-runtime',
    label: 'npm-runtime',
    command: process.execPath,
    versionArgs: [npmCli, '--version'],
    installArgs: (root, fixture) => [npmCli, 'install', '--global', '--prefix', root, '--offline', '--no-audit', '--no-fund', '--loglevel=error', fixture],
    available: fs.existsSync(npmCli),
    source: packagedRuntime ? 'artifact' : 'source-runtime',
    installMode: 'global-prefix',
    availabilityReason: fs.existsSync(npmCli) ? null : 'npm-runtime-not-found',
  }]

  for (const [id, command, versionArgs, installArgs] of [
    ['pnpm', 'pnpm', ['--version'], (root, fixture) => ['add', '--global', '--offline', '--global-dir', root, fixture]],
    ['yarn-classic', 'yarn', ['--version'], (root, fixture) => ['--cwd', root, 'add', '--offline', fixture]],
  ]) {
    const executable = executableOnPath(command, env)
    managers.push({
      id,
      label: id,
      command: executable ?? command,
      versionArgs,
      installArgs,
      available: Boolean(executable),
      source: executable ? 'path' : 'unavailable',
      installMode: id === 'pnpm' ? 'global-dir' : 'local-project',
      availabilityReason: executable ? null : `${command}-not-found`,
    })
  }

  const corepack = executableOnPath('corepack', env)
  const pnpm = executableOnPath('pnpm', env)
  managers.push({
    id: 'corepack',
    label: 'corepack',
    command: corepack ?? 'corepack',
    versionArgs: ['pnpm', '--version'],
    installArgs: (root, fixture) => ['pnpm', 'add', '--global', '--offline', '--global-dir', root, fixture],
    available: Boolean(corepack && pnpm),
    source: corepack && pnpm ? 'path' : 'unavailable',
    installMode: 'global-dir-via-corepack',
    availabilityReason: corepack && pnpm ? null : 'corepack-ou-pnpm-not-found',
  })
  return managers
}

function emptySnapshot() {
  return { pids: [], processIdentities: [], rssBytes: 0, cpuPercent: 0, cpuTimeSeconds: 0, readBytes: 0, writeBytes: 0 }
}

function windowsSnapshotScript(pid) {
  return `$all=@(Get-CimInstance Win32_Process); $root=$all | Where-Object ProcessId -eq ${pid}; if ($root) { $allowedNames=@('node.exe','cmd.exe','conhost.exe','npm.exe','pnpm.exe','yarn.exe','powershell.exe','bash.exe','sh.exe'); $byId=@{}; foreach ($item in $all) { $byId[[int]$item.ProcessId]=$item }; $ids=[System.Collections.Generic.HashSet[int]]::new(); [void]$ids.Add(${pid}); do { $added=$false; foreach ($item in $all) { $parent=$byId[[int]$item.ParentProcessId]; $sameGeneration=(-not $parent -or -not $item.CreationDate -or -not $parent.CreationDate -or $item.CreationDate -ge $parent.CreationDate); $knownExecutable=$allowedNames -contains [string]$item.Name; if ($ids.Contains([int]$item.ParentProcessId) -and $sameGeneration -and $knownExecutable -and $ids.Add([int]$item.ProcessId)) { $added=$true } } } while ($added); $idsArray=@($ids | ForEach-Object { [int]$_ }); $processes=@($all | Where-Object { $ids.Contains([int]$_.ProcessId) } | Select-Object ProcessId,ParentProcessId,Name,CreationDate,WorkingSetSize,ReadTransferCount,WriteTransferCount,KernelModeTime,UserModeTime); [pscustomobject]@{ Pids=$idsArray; Processes=$processes } | ConvertTo-Json -Compress }`
}

function parseWindowsSnapshot(output) {
  if (!String(output).trim()) return emptySnapshot()
  const parsed = JSON.parse(String(output))
  const processes = Array.isArray(parsed.Processes) ? parsed.Processes : [parsed.Processes].filter(Boolean)
  return {
    pids: (Array.isArray(parsed.Pids) ? parsed.Pids : [parsed.Pids]).map(Number).filter((value) => Number.isInteger(value)),
    processIdentities: processes.map((item) => ({
      pid: Number(item.ProcessId),
      name: item.Name ? String(item.Name) : null,
      creationDate: item.CreationDate ? String(item.CreationDate) : null,
    })).filter((item) => Number.isInteger(item.pid)),
    rssBytes: processes.reduce((sum, item) => sum + Number(item.WorkingSetSize ?? 0), 0),
    cpuPercent: null,
    cpuTimeSeconds: processes.reduce((sum, item) => sum + (Number(item.KernelModeTime ?? 0) + Number(item.UserModeTime ?? 0)) / 10_000_000, 0),
    readBytes: processes.reduce((sum, item) => sum + Number(item.ReadTransferCount ?? 0), 0),
    writeBytes: processes.reduce((sum, item) => sum + Number(item.WriteTransferCount ?? 0), 0),
  }
}

function windowsProcessIdentitiesScript(pids) {
  const values = pids.map((pid) => Number(pid)).filter((pid) => Number.isInteger(pid) && pid > 0)
  return `$ids=${JSON.stringify(values)}; @(Get-CimInstance Win32_Process | Where-Object { $ids -contains [int]$_.ProcessId } | Select-Object ProcessId,Name,CreationDate) | ConvertTo-Json -Compress`
}

function parseWindowsProcessIdentities(output) {
  if (!String(output).trim()) return new Map()
  const parsed = JSON.parse(String(output))
  const rows = parsed == null ? [] : (Array.isArray(parsed) ? parsed : [parsed])
  return new Map(rows.map((item) => [Number(item.ProcessId), {
    pid: Number(item.ProcessId),
    name: item.Name ? String(item.Name) : null,
    creationDate: item.CreationDate ? String(item.CreationDate) : null,
  }]).filter(([pid]) => Number.isInteger(pid)))
}

async function currentWindowsProcessIdentities(pids) {
  if (!pids.length) return new Map()
  try {
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', windowsProcessIdentitiesScript(pids)], {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 1_000_000,
    })
    return parseWindowsProcessIdentities(stdout)
  } catch { return null }
}

function sameProcessIdentity(expected, current) {
  if (!expected || !current) return false
  if (expected.name && current.name && expected.name !== current.name) return false
  if (expected.creationDate && current.creationDate && expected.creationDate !== current.creationDate) return false
  return Boolean(expected.name || expected.creationDate)
}

async function findOrphans(samples) {
  const identities = new Map(samples.flatMap((sample) => (sample.processIdentities ?? []).map((identity) => [identity.pid, identity])))
  const pids = [...new Set(samples.flatMap((sample) => sample.pids))]
  const check = async () => {
    if (process.platform === 'win32' && identities.size) {
      const current = await currentWindowsProcessIdentities(pids)
      if (current) return pids.filter((pid) => sameProcessIdentity(identities.get(pid), current.get(pid)))
    }
    return pids.filter(processStillRunning)
  }
  const orphans = await check()
  if (process.platform !== 'win32' || orphans.length === 0) return orphans
  // Windows can emit `close` while a short-lived cmd/node child is still
  // leaving the process table. Recheck after teardown has settled, while
  // retaining identity checks so a genuinely persistent child still fails.
  await new Promise((resolve) => setTimeout(resolve, 750))
  return check()
}

function processSnapshot(pid, { platform = process.platform, execFileSyncImpl = execFileSync } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return emptySnapshot()
  if (platform === 'linux' || platform === 'darwin') {
    try {
      const output = execFileSyncImpl('ps', ['-axo', 'pid=,ppid=,rss=,%cpu='], { encoding: 'utf8' })
      const rows = output.split(/\r?\n/).map((line) => line.trim().split(/\s+/)).filter((row) => row.length >= 4)
      const children = new Map(rows.map(([childPid, parentPid, rss, cpu]) => [Number(childPid), { parentPid: Number(parentPid), rss, cpu }]))
      const pids = []
      const visit = (candidate) => {
        if (pids.includes(candidate)) return
        const row = children.get(candidate)
        if (!row) return
        pids.push(candidate)
        for (const [child, value] of children) if (value.parentPid === candidate) visit(child)
      }
      visit(pid)
      const io = platform === 'linux'
        ? pids.reduce((total, item) => {
          try {
            const values = fs.readFileSync(`/proc/${item}/io`, 'utf8')
            const read = Number(values.match(/^read_bytes:\s*(\d+)/m)?.[1] ?? 0)
            const write = Number(values.match(/^write_bytes:\s*(\d+)/m)?.[1] ?? 0)
            return { readBytes: total.readBytes + read, writeBytes: total.writeBytes + write }
          } catch { return total }
        }, { readBytes: 0, writeBytes: 0 })
        : { readBytes: null, writeBytes: null }
      return {
        pids,
        rssBytes: pids.reduce((sum, item) => sum + Number(children.get(item)?.rss ?? 0) * 1024, 0),
        cpuPercent: pids.reduce((sum, item) => sum + Number(children.get(item)?.cpu ?? 0), 0),
        cpuTimeSeconds: null,
        ...io,
      }
    } catch { return emptySnapshot() }
  }
  try {
    const output = execFileSyncImpl('powershell', ['-NoProfile', '-NonInteractive', '-Command', windowsSnapshotScript(pid)], { encoding: 'utf8' }).trim()
    return parseWindowsSnapshot(output)
  } catch { return emptySnapshot() }
}

async function processSnapshotAsync(pid, { platform = process.platform } = {}) {
  if (platform !== 'win32') return processSnapshot(pid, { platform })
  if (!Number.isInteger(pid) || pid <= 0) return emptySnapshot()
  try {
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', windowsSnapshotScript(pid)], {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 1_000_000,
    })
    return parseWindowsSnapshot(stdout.trim())
  } catch { return emptySnapshot() }
}

function createEnvironment(root, manager) {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (/^(npm_config_|npm_token$|node_auth_token$|yarn_npm_auth_token$)/i.test(key)) delete env[key]
  }
  const isolatedHome = path.join(root, 'user-home')
  const cache = path.join(root, 'cache')
  fs.mkdirSync(isolatedHome, { recursive: true })
  fs.mkdirSync(cache, { recursive: true })
  env.HOME = isolatedHome
  env.USERPROFILE = isolatedHome
  env.npm_config_cache = cache
  env.npm_config_userconfig = path.join(root, 'npmrc')
  env.npm_config_update_notifier = 'false'
  env.npm_config_audit = 'false'
  env.npm_config_fund = 'false'
  env.PNPM_HOME = path.join(root, 'pnpm-home')
  env.pnpm_config_store_dir = path.join(root, 'pnpm-store')
  env.pnpm_config_global_bin_dir = path.join(root, 'pnpm-bin')
  env.YARN_GLOBAL_FOLDER = path.join(root, 'yarn-global')
  env.YARN_CACHE_FOLDER = path.join(root, 'yarn-cache')
  env.COREPACK_HOME = path.join(root, 'corepack-home')
  env.XDG_CONFIG_HOME = path.join(root, 'xdg-config')
  env.XDG_CACHE_HOME = path.join(root, 'xdg-cache')
  env.XDG_DATA_HOME = path.join(root, 'xdg-data')
  env.LOCALAPPDATA = path.join(root, 'local-app-data')
  env.APPDATA = path.join(root, 'app-data')
  fs.mkdirSync(env.PNPM_HOME, { recursive: true })
  fs.mkdirSync(env.pnpm_config_global_bin_dir, { recursive: true })
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
  env[pathKey] = [env.pnpm_config_global_bin_dir, env.PNPM_HOME, env[pathKey]].filter(Boolean).join(path.delimiter)
  if (pathKey !== 'PATH') delete env.PATH
  env.FELIXO_PACKAGE_MANAGER = manager.id
  delete env.ELECTRON_RUN_AS_NODE
  fs.writeFileSync(env.npm_config_userconfig, '', 'utf8')
  return env
}

function writeFixture(root) {
  const fixture = path.join(root, 'fixture')
  fs.mkdirSync(fixture, { recursive: true })
  fs.writeFileSync(path.join(fixture, 'package.json'), `${JSON.stringify({
    name: FIXTURE_NAME,
    version: '1.0.0',
    bin: { [FIXTURE_COMMAND]: 'cli.cjs' },
    scripts: { preinstall: 'node lifecycle.cjs' },
  }, null, 2)}\n`, 'utf8')
  fs.writeFileSync(path.join(fixture, 'cli.cjs'), `process.stdout.write('${FIXTURE_COMMAND}:ok\\n')\n`, 'utf8')
  fs.writeFileSync(path.join(fixture, 'lifecycle.cjs'), "require('node:fs').writeFileSync(process.env.FELIXO_PACKAGE_MANAGER_MARKER, 'ok')\n", 'utf8')
  if (process.platform !== 'win32') fs.chmodSync(path.join(fixture, 'cli.cjs'), 0o755)
  return fixture
}

function runChild(command, args, { cwd, env, timeoutMs, samplePid = null, snapshot = processSnapshot, intervalMs = process.platform === 'win32' ? 500 : 100 } = {}) {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let child
    let settled = false
    let timedOut = false
    const samples = []
    const startedAt = performance.now()
    let timeoutTimer
    let sampling = false
    let pendingSample = null
    const collectSample = (pid) => {
      if (!pid || sampling) return
      sampling = true
      const samplePromise = process.platform === 'win32' && snapshot === processSnapshot
        ? processSnapshotAsync(pid)
        : Promise.resolve().then(() => snapshot(pid))
      pendingSample = samplePromise
        .catch(() => emptySnapshot())
        .then((sample) => { samples.push(sample) })
        .finally(() => {
          sampling = false
          pendingSample = null
        })
    }
    const timer = setInterval(() => {
      const pid = samplePid ?? child?.pid
      collectSample(pid)
    }, intervalMs)
    const finish = (result) => {
      if (settled) return
      settled = true
      clearInterval(timer)
      if (timeoutTimer) clearTimeout(timeoutTimer)
      const complete = async () => resolve({
          code: result.code ?? null,
          signal: result.signal ?? null,
          error: result.error ?? null,
          timedOut,
          durationMs: performance.now() - startedAt,
          stdout: stdout.slice(-2_000),
          stderr: stderr.slice(-2_000),
          samples,
          orphanPids: await findOrphans(samples),
        })
      if (pendingSample) pendingSample.then(complete, complete)
      else complete()
    }
    try {
      child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false })
      if (child.pid) collectSample(samplePid ?? child.pid)
      child.stdout?.on('data', (chunk) => { stdout += String(chunk) })
      child.stderr?.on('data', (chunk) => { stderr += String(chunk) })
      child.once('error', (error) => finish({ error }))
      child.once('close', (code, signal) => finish({ code, signal }))
      timeoutTimer = setTimeout(() => {
        if (settled) return
        timedOut = true
        try { child.kill() } catch {}
        setTimeout(() => { try { if (!settled) child.kill('SIGKILL') } catch {} }, 2_000).unref?.()
      }, timeoutMs)
    } catch (error) { finish({ error }) }
  })
}

function aggregateSamples(samples) {
  return {
    rssBytes: summarizePositive(samples.map((sample) => sample.rssBytes)),
    cpuPercent: summarize(samples.map((sample) => sample.cpuPercent)),
    cpuTimeSeconds: summarize(samples.map((sample) => sample.cpuTimeSeconds)),
    readBytes: summarize(samples.map((sample) => sample.readBytes)),
    writeBytes: summarize(samples.map((sample) => sample.writeBytes)),
    processCount: summarizePositive(samples.map((sample) => sample.pids.length)),
  }
}

function commandSucceeded(result) { return !result.error && !result.timedOut && result.code === 0 }

async function runWithRetry(command, args, options) {
  const first = await runChild(command, args, options)
  if (commandSucceeded(first)) return { ...first, attempts: 1, initialFailure: null }
  await new Promise((resolve) => setTimeout(resolve, 50))
  const retry = await runChild(command, args, options)
  return {
    ...retry,
    attempts: 2,
    initialFailure: {
      code: first.code,
      signal: first.signal,
      timedOut: first.timedOut,
      error: first.error?.code ?? first.error?.message ?? null,
      stderr: first.stderr,
    },
  }
}

function processStillRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch { return false }
}

function sanitizeOutput(value, root) {
  return String(value ?? '')
    .replaceAll(root, '<temp>')
    .replace(/(?:[A-Za-z]:[\\/]|\\\\|\/)[^\r\n]*/g, '<path>')
    .trim()
    .slice(-1_000)
}

async function runScenario(manager, agentCount, options, temporaryRoot) {
  const root = fs.mkdtempSync(path.join(temporaryRoot, `${manager.id}-${agentCount}-`))
  const fixture = writeFixture(root)
  const env = createEnvironment(root, manager)
  const installRoots = Array.from({ length: agentCount }, (_, index) => {
    const installRoot = path.join(root, `agent-${index + 1}`)
    fs.mkdirSync(installRoot, { recursive: true })
    return installRoot
  })
  const version = await runChild(manager.command, manager.versionArgs, {
    cwd: root,
    env,
    timeoutMs: options.timeoutMs,
  })
  const runPhase = () => Promise.all(installRoots.map((installRoot, index) => runWithRetry(
    manager.command,
    manager.installArgs(installRoot, fixture),
    {
      cwd: root,
      env: { ...env, FELIXO_PACKAGE_MANAGER_MARKER: path.join(root, `marker-${index + 1}`) },
      timeoutMs: options.timeoutMs,
    },
  )))
  const coldResults = await runPhase()
  const hotResults = await runPhase()
  const phaseMetrics = (results) => {
    const samples = results.flatMap((result) => result.samples)
    const aggregate = aggregateSamples(samples)
    return {
      installMs: summarize(results.map((result) => result.durationMs)),
      rss: aggregate.rssBytes,
      cpu: { percent: aggregate.cpuPercent, seconds: aggregate.cpuTimeSeconds },
      processCount: aggregate.processCount,
      processIo: { readBytes: aggregate.readBytes, writeBytes: aggregate.writeBytes },
      children: [...new Set(samples.flatMap((sample) => sample.pids))].length,
      orphanPids: [...new Set(results.flatMap((result) => result.orphanPids))],
      successful: results.every((result) => commandSucceeded(result) && result.orphanPids.length === 0),
      exitCodes: results.map((result) => result.code),
      sampling: {
        processTree: aggregate.processCount.count > 0,
        rss: aggregate.rssBytes.count > 0,
      },
      diagnostics: results.filter((result) => !commandSucceeded(result)).map((result) => ({
        code: result.code,
        error: result.error?.code ?? result.error?.message ?? null,
        stderr: sanitizeOutput(result.stderr, root),
      })),
      retries: results.filter((result) => result.attempts > 1).map((result) => ({
        attempts: result.attempts,
        initialCode: result.initialFailure?.code ?? null,
        initialError: result.initialFailure?.error ?? null,
        initialStderr: sanitizeOutput(result.initialFailure?.stderr, root),
        recovered: commandSucceeded(result),
      })),
    }
  }
  const cold = phaseMetrics(coldResults)
  const coldTree = measureTree(root)
  const hot = phaseMetrics(hotResults)
  const hotTree = measureTree(root)
  return {
    agentCount,
    version: version.stdout.trim().split(/\s+/)[0] || null,
    versionMs: version.durationMs,
    installMode: manager.installMode,
    cold,
    hot,
    io: {
      files: hotTree.files,
      bytesOnDisk: hotTree.bytes,
      cold: { files: coldTree.files, bytesOnDisk: coldTree.bytes },
      hot: { files: hotTree.files, bytesOnDisk: hotTree.bytes },
      growth: {
        files: hotTree.files - coldTree.files,
        bytesOnDisk: hotTree.bytes - coldTree.bytes,
      },
    },
    successful: commandSucceeded(version) && cold.successful && hot.successful,
    exitCodes: { cold: cold.exitCodes, hot: hot.exitCodes },
    offline: true,
  }
}

function createReport(options, managers) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    electron: readPackageVersion(path.join(APP_ROOT, 'node_modules', 'electron', 'package.json')),
    method: {
      iterations: options.iterations,
      agentCounts: options.agentCounts,
      timeoutMs: options.timeoutMs,
      coldAndHot: true,
      isolatedFilesystem: true,
      sanitized: true,
      budgets: {
        installP95Ms: 120_000,
        peakRssMiB: 512,
        processCount: 64,
        diskMiB: 512,
      },
      scope: {
        app: 'not-started',
        manager: 'measured',
        cli: 'local-fixture',
        corepack: 'separate-route-when-available',
        responsiveness: 'not-collected',
        energy: 'not-collected',
      },
    },
    managers: Object.fromEntries(managers.map((manager) => [manager.id, {
      source: manager.source,
      available: manager.available,
      availabilityReason: manager.availabilityReason,
      installMode: manager.installMode,
      version: null,
      scenarios: [],
    }])),
    result: 'failed',
    validation: [],
    comparison: null,
    recommendation: null,
    error: null,
  }
}

function budgetFailuresForScenario(scenario, budgets) {
  const failures = []
  for (const phaseName of ['cold', 'hot']) {
    const phase = scenario[phaseName]
    if (!phase) {
      failures.push(`${phaseName} ausente`)
      continue
    }
    if ((phase.installMs?.p95 ?? 0) > budgets.installP95Ms) failures.push(`${phaseName}.installMs.p95>${budgets.installP95Ms}`)
    if ((phase.rss?.max ?? 0) > budgets.peakRssMiB * 1024 * 1024) failures.push(`${phaseName}.rss.max>${budgets.peakRssMiB}MiB`)
    if ((phase.processCount?.max ?? 0) > budgets.processCount) failures.push(`${phaseName}.processCount.max>${budgets.processCount}`)
  }
  if ((scenario.io?.bytesOnDisk ?? 0) > budgets.diskMiB * 1024 * 1024) failures.push(`io.bytesOnDisk>${budgets.diskMiB}MiB`)
  return failures
}

function compareWithBaseline(report) {
  const baseline = report.managers?.['npm-runtime']
  if (!baseline?.available) return null
  const baselineByKey = new Map(baseline.scenarios.map((scenario) => [`${scenario.iteration}:${scenario.agentCount}`, scenario]))
  const managers = {}
  for (const [id, manager] of Object.entries(report.managers ?? {})) {
    if (!manager.available || id === 'npm-runtime') continue
    const rows = manager.scenarios.map((scenario) => {
      const baselineScenario = baselineByKey.get(`${scenario.iteration}:${scenario.agentCount}`)
      if (!baselineScenario) return { iteration: scenario.iteration, agentCount: scenario.agentCount, missingBaseline: true }
      return {
        iteration: scenario.iteration,
        agentCount: scenario.agentCount,
        coldInstallP95DeltaMs: Number(((scenario.cold.installMs.p95 ?? 0) - (baselineScenario.cold.installMs.p95 ?? 0)).toFixed(3)),
        hotInstallP95DeltaMs: Number(((scenario.hot.installMs.p95 ?? 0) - (baselineScenario.hot.installMs.p95 ?? 0)).toFixed(3)),
        coldPeakRssDeltaBytes: Number(((scenario.cold.rss.max ?? 0) - (baselineScenario.cold.rss.max ?? 0)).toFixed(3)),
        hotPeakRssDeltaBytes: Number(((scenario.hot.rss.max ?? 0) - (baselineScenario.hot.rss.max ?? 0)).toFixed(3)),
      }
    })
    managers[id] = { baseline: 'npm-runtime', scenarios: rows }
  }
  return managers
}

function recommendManager(report) {
  const budgets = report.method?.budgets ?? {}
  const candidates = Object.entries(report.managers ?? {})
    .filter(([id, manager]) => id !== 'npm-runtime' && manager.available && manager.scenarios.length)
    .map(([id, manager]) => {
      const valid = manager.scenarios.every((scenario) => scenario.successful && budgetFailuresForScenario(scenario, budgets).length === 0)
      const values = manager.scenarios.flatMap((scenario) => [scenario.cold.installMs.p95, scenario.hot.installMs.p95]).filter(Number.isFinite)
      return { id, valid, meanInstallP95Ms: values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3)) : null }
    })
    .filter((candidate) => candidate.valid && candidate.meanInstallP95Ms !== null)
    .sort((left, right) => left.meanInstallP95Ms - right.meanInstallP95Ms)
  if (!candidates.length) {
    return {
      decision: 'manter-npm-runtime',
      reason: 'nenhuma alternativa disponível, funcional e dentro dos budgets medidos',
      candidates: [],
    }
  }
  return {
    decision: `avaliar-${candidates[0].id}`,
    reason: 'alternativa elegível com menor média de p95 entre instalação fria e quente; decisão de migração permanece humana',
    candidates,
  }
}

function validateReport(report, expectedIterations, expectedAgentCounts) {
  const failures = []
  const budgets = report.method?.budgets ?? {
    installP95Ms: DEFAULT_TIMEOUT_MS,
    peakRssMiB: 512,
    processCount: 64,
    diskMiB: 512,
  }
  const available = Object.values(report.managers ?? {}).filter((manager) => manager.available)
  if (!report.managers?.['npm-runtime']?.available) failures.push('npm-runtime do artefato não foi encontrado')
  if (available.length === 0) failures.push('nenhum gerenciador disponível')
  for (const [id, manager] of Object.entries(report.managers ?? {})) {
    if (!manager.available) continue
    const expected = expectedIterations * expectedAgentCounts.length
    if (manager.scenarios.length !== expected) failures.push(`amostras incompletas em ${id}`)
    if (manager.scenarios.some((scenario) => !scenario.successful)) failures.push(`falha funcional em ${id}`)
    const hasMeasuredScenario = manager.scenarios.some((scenario) => {
      const coldMeasured = scenario.cold?.sampling?.processTree && scenario.cold?.sampling?.rss
      const hotMeasured = scenario.hot?.sampling?.processTree && scenario.hot?.sampling?.rss
      return coldMeasured || hotMeasured
    })
    if (!hasMeasuredScenario) failures.push(`métricas de processo ausentes em ${id}`)
    for (const scenario of manager.scenarios) {
      for (const failure of budgetFailuresForScenario(scenario, budgets)) failures.push(`${id}: ${failure}`)
    }
    if (manager.scenarios.some((scenario) => scenario.cold?.orphanPids?.length > 0 || scenario.hot?.orphanPids?.length > 0)) {
      failures.push(`processos órfãos detectados em ${id}`)
    }
  }
  return [...new Set(failures)]
}

function writeReport(file, report) {
  if (!file) return
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (options.help) {
    process.stdout.write([
      'Uso: node scripts/package-manager-alternatives-performance.cjs [opções]',
      '',
      '--check                 exige npm-runtime e métricas completas',
      '--iterations=N          repete cada cenário (1–5; padrão 2)',
      '--agents=1,2,5,10       contagens concorrentes (1–10)',
      '--runtime-root=PASTA    usa o npm-runtime desempacotado do artefato',
      '--timeout-ms=N          limite por processo (1000–600000)',
      '--out=ARQUIVO            grava JSON sanitizado',
      '',
    ].join('\n'))
    return null
  }
  const managers = discoverManagers({ runtimeRoot: options.runtimeRoot })
  const report = createReport(options, managers)
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-package-managers-'))
  try {
    for (const manager of managers) {
      if (!manager.available) continue
      for (let iteration = 1; iteration <= options.iterations; iteration += 1) {
        for (const agentCount of options.agentCounts) {
          const scenario = await runScenario(manager, agentCount, options, temporaryRoot)
          report.managers[manager.id].scenarios.push({ iteration, ...scenario })
          report.managers[manager.id].version ??= scenario.version
          const installP95 = scenario.cold.installMs.p95 ?? 0
          const rssP95 = Math.max(scenario.cold.rss.p95 ?? 0, scenario.hot.rss.p95 ?? 0)
          process.stdout.write(`[package-managers:${manager.id}] ${iteration}/${options.iterations} agents=${agentCount} cold-install-p95=${Math.round(installP95)}ms peak-rss-p95=${Math.round(rssP95 / 1024 / 1024)}MiB\n`)
        }
      }
    }
    report.comparison = compareWithBaseline(report)
    report.recommendation = recommendManager(report)
    report.validation = validateReport(report, options.iterations, options.agentCounts)
    report.result = report.validation.length ? 'failed' : 'passed'
    if (options.check && report.validation.length) throw new Error(report.validation.join('; '))
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    writeReport(options.out, report)
    try { fs.rmSync(temporaryRoot, { recursive: true, force: true }) } catch {}
  }
  process.stdout.write(`[package-managers] ${Object.values(report.managers).filter((manager) => manager.available).length} gerenciador(es) medido(s); indisponíveis foram registrados\n`)
  return report
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`[package-managers] falhou: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}

module.exports = {
  aggregateSamples,
  createEnvironment,
  discoverManagers,
  findPackagedRuntime,
  measureTree,
  parseArgs,
  percentile,
  processSnapshot,
  runChild,
  runWithRetry,
  summarize,
  validateReport,
}
