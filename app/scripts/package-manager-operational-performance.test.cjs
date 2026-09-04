'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const {
  aggregateSamples,
  createEnvironment,
  findPackagedRuntime,
  measureTree,
  parseArgs,
  percentile,
  processSnapshot,
  runChild,
  runWithRetry,
  summarize,
  validateReport,
} = require('./package-manager-operational-performance.cjs')

test('createEnvironment isola HOME, cache e credenciais herdadas', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-package-manager-env-test-'))
  const previous = {
    NPM_CONFIG_TOKEN: process.env.NPM_CONFIG_TOKEN,
    NODE_AUTH_TOKEN: process.env.NODE_AUTH_TOKEN,
  }
  try {
    process.env.NPM_CONFIG_TOKEN = 'must-not-leak'
    process.env.NODE_AUTH_TOKEN = 'must-not-leak'
    const environment = createEnvironment(root, { id: 'test-manager' })
    assert.equal(environment.HOME, path.join(root, 'user-home'))
    assert.equal(environment.USERPROFILE, path.join(root, 'user-home'))
    assert.equal(environment.npm_config_cache, path.join(root, 'cache'))
    assert.equal(environment.NPM_CONFIG_TOKEN, undefined)
    assert.equal(environment.NODE_AUTH_TOKEN, undefined)
    assert.equal(environment.FELIXO_PACKAGE_MANAGER, 'test-manager')
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('parseArgs aplica limites e preserva os cenários de concorrência', () => {
  const options = parseArgs(['--check', '--iterations=3', '--agents=1,5,10', '--timeout-ms=5000', '--out=report.json'])
  assert.equal(options.check, true)
  assert.equal(options.iterations, 3)
  assert.deepEqual(options.agentCounts, [1, 5, 10])
  assert.equal(options.timeoutMs, 5000)
  assert.equal(options.out, path.resolve('report.json'))
  assert.throws(() => parseArgs(['--agents=1,1']), /contagens únicas/)
  assert.throws(() => parseArgs(['--iterations=0']), /iterations deve estar entre/)
})

test('percentis e resumos ignoram amostras não numéricas', () => {
  assert.equal(percentile([1, 2, 3, 4], 0.95), 3.85)
  assert.deepEqual(summarize([1, Number.NaN, 3]), { count: 2, p50: 2, p95: 2.9, max: 3 })
  assert.deepEqual(aggregateSamples([
    { pids: [1], rssBytes: 10, cpuPercent: 2, cpuTimeSeconds: null, readBytes: 4, writeBytes: 5 },
    { pids: [1, 2], rssBytes: 20, cpuPercent: 4, cpuTimeSeconds: null, readBytes: 8, writeBytes: 9 },
  ]).processCount, { count: 2, p50: 1.5, p95: 1.95, max: 2 })
})

test('processSnapshot soma a árvore de processos POSIX', () => {
  const snapshot = processSnapshot(10, {
    platform: 'linux',
    execFileSyncImpl: () => '10 1 100 2\n11 10 50 1\n12 11 25 0.5\n',
  })
  assert.deepEqual(snapshot.pids, [10, 11, 12])
  assert.equal(snapshot.rssBytes, 175 * 1024)
  assert.equal(snapshot.cpuPercent, 3.5)
})

test('processSnapshot preserva identidade do processo no Windows', () => {
  const snapshot = processSnapshot(10, {
    platform: 'win32',
    execFileSyncImpl: () => JSON.stringify({
      Pids: [10],
      Processes: {
        ProcessId: 10,
        Name: 'node.exe',
        CreationDate: '20260904014943.000000-180',
        WorkingSetSize: 1024,
        KernelModeTime: 1_000_000,
        UserModeTime: 2_000_000,
      },
    }),
  })
  assert.deepEqual(snapshot.processIdentities, [{ pid: 10, name: 'node.exe', creationDate: '20260904014943.000000-180' }])
  assert.equal(snapshot.rssBytes, 1024)
})

test('runChild sempre coleta uma amostra inicial e não mantém o timer do timeout', async () => {
  const samples = []
  const result = await runChild(process.execPath, ['-e', 'process.stdout.write("ok")'], {
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 5_000,
    snapshot: (pid) => {
      samples.push(pid)
      return { pids: [pid], rssBytes: 1, cpuPercent: 0, cpuTimeSeconds: null, readBytes: null, writeBytes: null }
    },
  })
  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'ok')
  assert.ok(samples.length >= 1)
  assert.equal(result.samples.length, samples.length)
})

test('runChild consegue ler RSS de um processo real', async () => {
  const result = await runChild(process.execPath, ['-e', 'setTimeout(() => {}, 1500)'], {
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 5_000,
  })
  assert.equal(result.code, 0)
  assert.ok(result.samples.some((sample) => sample.rssBytes > 0), JSON.stringify(result.samples))
})

test('runWithRetry recupera uma falha transitória e registra a tentativa', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-package-manager-retry-test-'))
  const marker = path.join(root, 'first-attempt')
  const script = path.join(root, 'retry.cjs')
  try {
    fs.writeFileSync(script, [
      "const fs = require('node:fs')",
      "if (!fs.existsSync(process.env.FELIXO_RETRY_MARKER)) { fs.writeFileSync(process.env.FELIXO_RETRY_MARKER, 'failed'); process.exitCode = 1 }",
    ].join('\n'), 'utf8')
    const result = await runWithRetry(process.execPath, [script], {
      cwd: root,
      env: { ...process.env, FELIXO_RETRY_MARKER: marker },
      timeoutMs: 5_000,
    })
    assert.equal(result.attempts, 2)
    assert.equal(result.initialFailure.code, 1)
    assert.equal(result.code, 0)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('measureTree contabiliza arquivos sem seguir symlinks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-package-manager-test-'))
  try {
    fs.writeFileSync(path.join(root, 'one.txt'), '123', 'utf8')
    fs.mkdirSync(path.join(root, 'nested'))
    fs.writeFileSync(path.join(root, 'nested', 'two.txt'), '4567', 'utf8')
    if (process.platform !== 'win32') fs.symlinkSync(path.join(root, 'one.txt'), path.join(root, 'link.txt'))
    const measured = measureTree(root)
    assert.equal(measured.files, 2)
    assert.equal(measured.bytes, 7)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('findPackagedRuntime reconhece a estrutura resources/npm-runtime/npm', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-package-manager-runtime-test-'))
  try {
    const runtime = path.join(root, 'linux-unpacked', 'resources', 'npm-runtime', 'npm')
    fs.mkdirSync(path.join(runtime, 'bin'), { recursive: true })
    fs.writeFileSync(path.join(runtime, 'bin', 'npm-cli.js'), '', 'utf8')
    assert.equal(findPackagedRuntime(root), runtime)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('validateReport exige npm-runtime, cenários frios/quentes e métricas de processo', () => {
  const baseScenario = {
    successful: true,
    cold: { processCount: { count: 1 }, rss: { count: 1 }, sampling: { processTree: true, rss: true } },
    hot: { processCount: { count: 1 }, rss: { count: 1 }, sampling: { processTree: true, rss: true } },
  }
  const report = {
    managers: {
      'npm-runtime': { available: true, scenarios: [baseScenario] },
      pnpm: { available: false, scenarios: [] },
    },
  }
  assert.deepEqual(validateReport(report, 1, [1]), [])
  const ultrafast = {
    successful: true,
    cold: { processCount: { count: 0 }, rss: { count: 0 }, sampling: { processTree: false, rss: false } },
    hot: { processCount: { count: 0 }, rss: { count: 0 }, sampling: { processTree: false, rss: false } },
  }
  assert.deepEqual(validateReport({
    managers: {
      'npm-runtime': { available: true, scenarios: [baseScenario, ultrafast] },
      pnpm: { available: false, scenarios: [] },
    },
  }, 2, [1]), [])
  assert.match(validateReport({ managers: { 'npm-runtime': { available: false, scenarios: [] } } }, 1, [1]).join('; '), /npm-runtime/)
})
