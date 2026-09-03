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
