'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const {
  capacidadesDeLink,
  criarLinkDeDiretorio,
} = require('../electron/__fixtures__/link-fixtures.cjs')
const {
  MANAGER_IDS,
  settleOrphans,
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

test('parseArgs sem --managers mede todos os gerenciadores conhecidos', () => {
  assert.deepEqual(MANAGER_IDS, ['npm-runtime', 'pnpm', 'yarn-classic', 'corepack'])
  assert.deepEqual(parseArgs([]).managers, MANAGER_IDS)
  assert.deepEqual(parseArgs(['--check']).managers, MANAGER_IDS)
})

test('parseArgs aceita --managers com ids conhecidos e recusa o resto com erro claro', () => {
  assert.deepEqual(parseArgs(['--managers=npm-runtime']).managers, ['npm-runtime'])
  assert.deepEqual(parseArgs(['--check', '--managers=npm-runtime,corepack']).managers, ['npm-runtime', 'corepack'])
  assert.deepEqual(parseArgs(['--managers= pnpm , yarn-classic ']).managers, ['pnpm', 'yarn-classic'])
  assert.throws(
    () => parseArgs(['--managers=npm-runtime,bun']),
    /Gerenciador desconhecido em --managers: bun\. Válidos: npm-runtime, pnpm, yarn-classic, corepack\./,
  )
  assert.throws(() => parseArgs(['--managers=']), /--managers precisa listar ids/)
  assert.throws(() => parseArgs(['--managers=pnpm,,npm-runtime']), /--managers precisa listar ids/)
  assert.throws(() => parseArgs(['--managers=pnpm,pnpm']), /ids únicos/)
})

test('parseArgs recusa --check sem a linha de base npm-runtime', () => {
  assert.throws(() => parseArgs(['--check', '--managers=pnpm']), /--check exige npm-runtime/)
  assert.throws(() => parseArgs(['--managers=pnpm', '--check']), /--check exige npm-runtime/)
  // Sem --check a medição exploratória de uma alternativa isolada continua possível.
  assert.deepEqual(parseArgs(['--managers=pnpm']).managers, ['pnpm'])
})

/**
 * PATH com pnpm, yarn e corepack falsos e um npm-runtime desempacotado falso:
 * sem filtro, todos aparecem disponíveis — é o que prova que o filtro, e não a
 * máquina, decide quem fica de fora.
 */
function criarHostComTodosOsGerenciadores() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-package-manager-discovery-'))
  const binDir = path.join(root, 'bin')
  const runtimeRoot = path.join(root, 'npm-runtime')
  fs.mkdirSync(binDir, { recursive: true })
  fs.mkdirSync(path.join(runtimeRoot, 'bin'), { recursive: true })
  fs.writeFileSync(path.join(runtimeRoot, 'bin', 'npm-cli.js'), '', 'utf8')
  for (const command of ['pnpm', 'yarn', 'corepack']) fs.writeFileSync(path.join(binDir, command), '', 'utf8')
  return { root, runtimeRoot, env: { PATH: binDir } }
}

function resumoDaDescoberta(managers) {
  return managers.map(({ id, available, source, availabilityReason }) => ({ id, available, source, availabilityReason }))
}

test('discoverManagers com --managers=npm-runtime não procura nem mede as alternativas', () => {
  const host = criarHostComTodosOsGerenciadores()
  try {
    const managers = discoverManagers({ env: host.env, runtimeRoot: host.runtimeRoot, managers: ['npm-runtime'] })
    assert.deepEqual(resumoDaDescoberta(managers), [
      { id: 'npm-runtime', available: true, source: 'artifact', availabilityReason: null },
      { id: 'pnpm', available: false, source: 'not-selected', availabilityReason: 'not-selected' },
      { id: 'yarn-classic', available: false, source: 'not-selected', availabilityReason: 'not-selected' },
      { id: 'corepack', available: false, source: 'not-selected', availabilityReason: 'not-selected' },
    ])
    assert.equal(managers.find((manager) => manager.id === 'pnpm').command, null)
  } finally {
    fs.rmSync(host.root, { recursive: true, force: true })
  }
})

test('discoverManagers sem --managers descobre exatamente o mesmo que antes da flag', () => {
  const host = criarHostComTodosOsGerenciadores()
  try {
    const semFlag = discoverManagers({ env: host.env, runtimeRoot: host.runtimeRoot })
    assert.deepEqual(resumoDaDescoberta(semFlag), [
      { id: 'npm-runtime', available: true, source: 'artifact', availabilityReason: null },
      { id: 'pnpm', available: true, source: 'path', availabilityReason: null },
      { id: 'yarn-classic', available: true, source: 'path', availabilityReason: null },
      { id: 'corepack', available: true, source: 'path', availabilityReason: null },
    ])
    assert.deepEqual(
      semFlag.map(({ installMode }) => installMode),
      ['global-prefix', 'global-dir', 'local-project', 'global-dir-via-corepack'],
    )
    const todosExplicitos = discoverManagers({ env: host.env, runtimeRoot: host.runtimeRoot, managers: [...MANAGER_IDS] })
    assert.deepEqual(resumoDaDescoberta(todosExplicitos), resumoDaDescoberta(semFlag))
  } finally {
    fs.rmSync(host.root, { recursive: true, force: true })
  }
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
  // No Windows a amostra é UMA consulta PowerShell/CIM por vez; num runner carregado ela levou
  // mais que a vida do filho e voltou vazia (CI do #75 e do #81, 21/09: uma única amostra com
  // pids [] mesmo com o filho vivo 6 s). O teste só precisa provar que o amostrador CONSEGUE ler
  // RSS de um processo real: tenta até 3 vezes e exige sucesso em pelo menos uma. Um amostrador
  // que nunca lê nada continua reprovando.
  let samples = []
  for (let tentativa = 1; tentativa <= 3 && !samples.some((sample) => sample.rssBytes > 0); tentativa += 1) {
    const result = await runChild(process.execPath, ['-e', 'setTimeout(() => {}, 4000)'], {
      cwd: process.cwd(),
      env: process.env,
      timeoutMs: 20_000,
    })
    assert.equal(result.code, 0)
    samples = result.samples
  }
  assert.ok(samples.some((sample) => sample.rssBytes > 0), JSON.stringify(samples))
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
  const externo = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-package-manager-externo-'))
  try {
    fs.writeFileSync(path.join(root, 'one.txt'), '123', 'utf8')
    fs.mkdirSync(path.join(root, 'nested'))
    fs.writeFileSync(path.join(root, 'nested', 'two.txt'), '4567', 'utf8')
    fs.writeFileSync(path.join(externo, 'ignorado.txt'), '89', 'utf8')
    // Symlink de arquivo so existe onde a plataforma permite. O link de
    // diretorio cobre a mesma regra ("nao siga o reparse point") em todo
    // sistema suportado: antes disto o Windows nao criava link nenhum e a
    // assercao passava sem exercer a regra.
    if (capacidadesDeLink().symlinkDeArquivo) {
      fs.symlinkSync(path.join(root, 'one.txt'), path.join(root, 'link.txt'), 'file')
    }
    criarLinkDeDiretorio(externo, path.join(root, 'linked-dir'))
    const measured = measureTree(root)
    assert.equal(measured.files, 2)
    assert.equal(measured.bytes, 7)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(externo, { recursive: true, force: true })
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

test('validateReport aceita o relatório só com npm-runtime e ainda exige a linha de base', () => {
  const scenario = {
    successful: true,
    cold: { sampling: { processTree: true, rss: true } },
    hot: { sampling: { processTree: true, rss: true } },
  }
  const naoSelecionado = { source: 'not-selected', available: false, availabilityReason: 'not-selected', scenarios: [] }
  assert.deepEqual(validateReport({
    managers: {
      'npm-runtime': { source: 'artifact', available: true, scenarios: [scenario] },
      pnpm: naoSelecionado,
      'yarn-classic': naoSelecionado,
      corepack: naoSelecionado,
    },
  }, 1, [1]), [])
  // A linha de base continua obrigatória e funcional mesmo com o filtro.
  assert.match(validateReport({
    managers: { 'npm-runtime': { source: 'artifact', available: true, scenarios: [{ ...scenario, successful: false }] } },
  }, 1, [1]).join('; '), /falha funcional em npm-runtime/)
  assert.match(validateReport({
    managers: { 'npm-runtime': naoSelecionado, pnpm: { source: 'path', available: true, scenarios: [scenario] } },
  }, 1, [1]).join('; '), /npm-runtime ficou fora de --managers/)
})

test('settleOrphans: filho que sai da tabela de processos durante a espera não é órfão', async () => {
  const respostas = [[101, 102], [101], []]
  let chamadas = 0
  const esperas = []
  const resultado = await settleOrphans(async () => respostas[Math.min(chamadas++, respostas.length - 1)], {
    sleep: async (ms) => { esperas.push(ms) },
  })
  assert.deepEqual(resultado, [])
  assert.equal(chamadas, 3)
  assert.deepEqual(esperas, [500, 500])
})

test('settleOrphans: filho que PERMANECE depois do prazo continua reportado (gate não afrouxa)', async () => {
  let esperado = 0
  const resultado = await settleOrphans(async () => [7], { settleMs: 2000, intervalMs: 500, sleep: async (ms) => { esperado += ms } })
  assert.deepEqual(resultado, [7])
  assert.equal(esperado, 2000)
})

test('settleOrphans: sem órfãos não espera nada', async () => {
  let dormiu = false
  assert.deepEqual(await settleOrphans(async () => [], { sleep: async () => { dormiu = true } }), [])
  assert.equal(dormiu, false)
})
