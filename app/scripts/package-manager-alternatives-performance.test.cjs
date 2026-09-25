'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const benchmark = require('./package-manager-alternatives-performance.cjs')

test('a bancada valida argumentos e mantém o limite de iterações', () => {
  assert.deepEqual(benchmark.parseArgs([
    '--check',
    '--strict',
    '--iterations=1',
    '--timeout-ms=1000',
    '--out=report.json',
  ]), {
    check: true,
    help: false,
    iterations: 1,
    managers: ['npm-runtime', 'pnpm', 'yarn-classic', 'yarn-modern'],
    out: path.resolve('report.json'),
    strict: true,
    timeoutMs: 1000,
  })
  assert.equal(benchmark.parseArgs(['--help']).help, true)
  assert.throws(() => benchmark.parseArgs(['--iterations=0']), /iterations/i)
  assert.throws(() => benchmark.parseArgs(['--iterations=6']), /iterations/i)
  assert.throws(() => benchmark.parseArgs(['--timeout-ms=999']), /timeout-ms/i)
  assert.throws(() => benchmark.parseArgs(['--out=']), /out/i)
  assert.throws(() => benchmark.parseArgs(['--unknown']), /argumento/i)
})

test('a medição de árvore conta bytes sem seguir a forma do pacote', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-package-manager-test-'))
  try {
    fs.mkdirSync(path.join(root, 'nested'))
    fs.writeFileSync(path.join(root, 'a.txt'), 'abc')
    fs.writeFileSync(path.join(root, 'nested', 'b.txt'), '12345')
    assert.deepEqual(benchmark.measureTree(root), { files: 2, bytes: 8 })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('a busca do manifesto prefere a versão atual no store', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-package-manager-manifest-'))
  try {
    for (const [folder, version] of [['a-old', '1.0.0'], ['b-current', '1.1.0']]) {
      const packageRoot = path.join(root, folder)
      fs.mkdirSync(packageRoot)
      fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({
        name: 'fixture-cli',
        version,
      }))
    }
    assert.equal(
      benchmark.findPackageManifest(root, 'fixture-cli', '1.1.0').manifest.version,
      '1.1.0',
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('a decisão registra por que npm continua sendo o runtime padrão', () => {
  const report = {
    candidates: {
      npm: { status: 'passed' },
      pnpm: { status: 'available' },
      'yarn-classic': { status: 'available' },
    },
  }
  const recommendation = benchmark.buildRecommendation(report)
  assert.equal(recommendation.decision, 'manter-npm-runtime')
  assert.equal(recommendation.reasons.length, 5)
  assert.equal(recommendation.gates.length, 4)
  assert.equal(recommendation.measured.pnpm, 'available')
})

test('o check aceita Yarn moderno como incompatibilidade esperada', () => {
  const report = {
    candidates: {
      npm: { status: 'passed' },
      pnpm: {
        status: 'available',
        name: 'pnpm',
        startup: { successful: true },
        benchmark: { successful: true },
      },
      'yarn-classic': {
        status: 'available',
        name: 'Yarn Classic',
        startup: { successful: true },
        benchmark: { successful: true },
      },
      'yarn-modern': {
        status: 'available',
        benchmark: { probe: { expectedFailure: true } },
      },
    },
  }
  assert.deepEqual(benchmark.validateReport(report), [])
  assert.match(
    benchmark.validateReport({ ...report, candidates: {
      ...report.candidates,
      pnpm: { ...report.candidates.pnpm, benchmark: { successful: false } },
    } }).join('\n'),
    /pnpm.*falhou/i,
  )
})

test('sem --managers a bancada continua medindo npm e todas as alternativas', () => {
  assert.deepEqual(benchmark.MANAGER_IDS, ['npm-runtime', 'pnpm', 'yarn-classic', 'yarn-modern'])
  assert.deepEqual(benchmark.parseArgs([]).managers, benchmark.MANAGER_IDS)
  const plan = benchmark.planMeasurements(benchmark.parseArgs([]).managers)
  assert.equal(plan.npm, true)
  assert.deepEqual(plan.specs.map((spec) => spec.id), ['pnpm', 'yarn-classic', 'yarn-modern'])
})

test('--managers aceita só ids conhecidos; Corepack é ponte, não id', () => {
  assert.deepEqual(benchmark.parseArgs(['--managers=npm-runtime']).managers, ['npm-runtime'])
  assert.deepEqual(benchmark.parseArgs(['--managers=yarn-classic,pnpm']).managers, ['yarn-classic', 'pnpm'])
  assert.throws(
    () => benchmark.parseArgs(['--managers=corepack']),
    /Gerenciador desconhecido em --managers: corepack\. Válidos: npm-runtime, pnpm, yarn-classic, yarn-modern\./,
  )
  assert.throws(() => benchmark.parseArgs(['--managers=']), /--managers precisa listar ids/)
  assert.throws(() => benchmark.parseArgs(['--managers=pnpm,pnpm']), /ids únicos/)
})

test('--check sem npm-runtime é recusado: a bancada é gate do Release e o npm é o que o app usa', () => {
  assert.throws(() => benchmark.parseArgs(['--check', '--managers=pnpm']), /--check exige npm-runtime/)
  assert.throws(() => benchmark.parseArgs(['--check', '--strict', '--managers=pnpm,yarn-classic']), /--check exige npm-runtime/)
  assert.deepEqual(benchmark.parseArgs(['--check', '--managers=npm-runtime,pnpm']).managers, ['npm-runtime', 'pnpm'])
  // Sem --check a seleção livre continua valendo (medição exploratória).
  assert.deepEqual(benchmark.parseArgs(['--managers=pnpm']).managers, ['pnpm'])
})

test('--managers=npm-runtime mede só o npm e deixa o Corepack de fora', () => {
  const soNpm = benchmark.planMeasurements(['npm-runtime'])
  assert.equal(soNpm.npm, true)
  assert.deepEqual(soNpm.specs, [])
  // Sem alternativa pedida o Corepack nem é procurado: fica "fora", não "indisponível".
  assert.equal(benchmark.corepackStatus(soNpm, null), 'not-selected')

  const soPnpm = benchmark.planMeasurements(['pnpm'])
  assert.equal(soPnpm.npm, false)
  assert.deepEqual(soPnpm.specs.map((spec) => spec.id), ['pnpm'])
  assert.equal(benchmark.corepackStatus(soPnpm, null), 'unavailable')
  assert.equal(benchmark.corepackStatus(soPnpm, '/usr/bin/corepack'), 'available')
})

/** Forma do relatório que o main grava com `--managers=npm-runtime`. */
function relatorioSoNpm() {
  const fora = (id, name) => ({ id, name, status: 'not-selected', source: 'fora de --managers' })
  return {
    candidates: {
      npm: { name: 'npm-runtime', status: 'passed', benchmark: { successful: true } },
      pnpm: fora('pnpm', 'pnpm'),
      'yarn-classic': fora('yarn-classic', 'Yarn Classic'),
      'yarn-modern': fora('yarn-modern', 'Yarn moderno'),
      corepack: { name: 'Corepack', status: 'not-selected' },
    },
  }
}

test('o check aceita o relatório só com npm, inclusive no modo --strict', () => {
  assert.deepEqual(benchmark.validateReport(relatorioSoNpm()), [])
  assert.deepEqual(benchmark.validateReport(relatorioSoNpm(), { strict: true }), [])
  assert.equal(benchmark.buildRecommendation(relatorioSoNpm()).measured.pnpm, 'not-selected')
})

test('o check continua exigindo o que foi pedido em --managers', () => {
  const npmFalhou = relatorioSoNpm()
  npmFalhou.candidates.npm = { name: 'npm-runtime', status: 'failed' }
  assert.match(benchmark.validateReport(npmFalhou).join('\n'), /npm-runtime não concluiu/)

  // pnpm pedido e ausente continua reprovando o --strict; os fora da lista não.
  const pnpmPedido = relatorioSoNpm()
  pnpmPedido.candidates.pnpm = { id: 'pnpm', name: 'pnpm', status: 'unavailable' }
  assert.deepEqual(benchmark.validateReport(pnpmPedido, { strict: true }), ['pnpm não ficou disponível nesta máquina.'])

  // Só alternativas pedidas: o npm fora da lista não reprova, a alternativa que falha sim.
  const soAlternativa = relatorioSoNpm()
  soAlternativa.candidates.npm = { name: 'npm-runtime', status: 'not-selected' }
  soAlternativa.candidates.pnpm = {
    name: 'pnpm',
    status: 'available',
    startup: { successful: true },
    benchmark: { successful: true },
  }
  assert.deepEqual(benchmark.validateReport(soAlternativa), [])
  soAlternativa.candidates.pnpm.benchmark = { successful: false }
  assert.match(benchmark.validateReport(soAlternativa).join('\n'), /pnpm.*falhou/i)
})

test('sem a flag o check segue exigindo npm e, no --strict, pnpm e Yarn Classic', () => {
  assert.match(benchmark.validateReport({ candidates: {} }).join('\n'), /npm-runtime não concluiu/)
  assert.deepEqual(
    benchmark.validateReport({ candidates: { npm: { status: 'passed' } } }, { strict: true }),
    ['pnpm não ficou disponível nesta máquina.', 'yarn-classic não ficou disponível nesta máquina.'],
  )
})
