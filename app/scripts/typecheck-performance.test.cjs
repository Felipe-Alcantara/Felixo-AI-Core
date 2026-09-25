'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const benchmark = require('./typecheck-performance.cjs')
const toolchain = require('./typescript-toolchain.cjs')

test('a bancada executa o tsc do TypeScript 7 (@typescript/native), não a API do 6', () => {
  const esperado = path.join(toolchain.APP_ROOT, 'node_modules', '@typescript', 'native', 'bin', 'tsc')
  assert.equal(benchmark.TSC_PATH, esperado)
  assert.ok(
    fs.existsSync(benchmark.TSC_PATH),
    `compilador ausente em ${benchmark.TSC_PATH}; rode npm ci em app/`,
  )
  // A versão gravada no relatório vem do mesmo pacote que a bancada executa.
  assert.equal(toolchain.versaoMaior(toolchain.versaoDoCompilador()), 7)
})

test('a bancada mede o build mode oficial sem noCheck', () => {
  assert.deepEqual(benchmark.buildTscArgs(), [
    '-b',
    'tsconfig.json',
    '--pretty',
    'false',
  ])
  assert.ok(!benchmark.buildTscArgs().includes('--noCheck'))
})

test('a bancada valida os argumentos e calcula percentis lineares', () => {
  assert.deepEqual(benchmark.parseArgs([]), {
    check: false,
    iterations: 5,
    mode: 'both',
    out: null,
  })
  assert.deepEqual(benchmark.parseArgs(['--iterations=7', '--mode=incremental', '--check']), {
    check: true,
    iterations: 7,
    mode: 'incremental',
    out: null,
  })
  assert.equal(benchmark.percentile([10, 20, 30, 40, 50], 0.5), 30)
  assert.equal(benchmark.percentile([10, 20, 30, 40, 50], 0.95), 48)
  assert.throws(() => benchmark.parseArgs(['--iterations=0']), /inteiro entre 1 e 20/)
  assert.throws(() => benchmark.parseArgs(['--mode=full']), /cold, incremental ou both/)
})

test('o resumo separa amostras válidas, tempo e RSS', () => {
  const summary = benchmark.summarize([
    { exitCode: 0, wallMs: 100, peakRssKb: 400 },
    { exitCode: 0, wallMs: 200, peakRssKb: 500 },
    { exitCode: 0, wallMs: 300, peakRssKb: null },
    { exitCode: 1, wallMs: 400, peakRssKb: 600 },
  ])

  assert.equal(summary.samples, 4)
  assert.equal(summary.successful, 3)
  assert.equal(summary.wallMs.p50, 250)
  assert.equal(summary.wallMs.p95, 385)
  assert.equal(summary.peakRssKb.p50, 500)
  assert.equal(summary.peakRssKb.p95, 590)
})

test('o modo check rejeita amostras incompletas ou falhas', () => {
  const okReport = {
    modes: {
      cold: {
        samples: [{ exitCode: 0 }],
        summary: { successful: 1 },
      },
    },
  }
  assert.equal(benchmark.validateReport(okReport, 1), null)
  assert.match(
    benchmark.validateReport(
      { modes: { cold: { samples: [], summary: { successful: 0 } } } },
      1,
    ),
    /amostras incompletas/,
  )
  assert.match(
    benchmark.validateReport(
      { modes: { cold: { samples: [{ exitCode: 1 }], summary: { successful: 0 } } } },
      1,
    ),
    /falha em cold/,
  )
})

test('amostra de RSS tirada enquanto o PID ainda é o Node do lançador é descartada', () => {
  // Regressão: no Linux o pico do build incremental publicava o Node do
  // lançador (~46.600 KB) em vez do compilador nativo (~20.500 KB).
  assert.equal(benchmark.isStillNodeLauncher('/usr/bin/node', '/usr/bin/node'), true)
  assert.equal(benchmark.isStillNodeLauncher('node', '/usr/local/bin/node'), true)
  const nativo = '/app/node_modules/@typescript/typescript-linux-x64/lib/tsc'
  assert.equal(benchmark.isStillNodeLauncher(nativo, '/usr/bin/node'), false)
  assert.equal(benchmark.isStillNodeLauncher(null, '/usr/bin/node'), false)
})

test('o executável lido do PID distingue o Node de outro programa', { skip: process.platform === 'win32' }, async () => {
  const { spawn } = require('node:child_process')
  const esperar = (filho) => new Promise((resolve) => filho.once('spawn', resolve))
  const nodeFilho = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { stdio: 'ignore' })
  const outroFilho = spawn('sleep', ['5'], { stdio: 'ignore' })
  try {
    await Promise.all([esperar(nodeFilho), esperar(outroFilho)])
    assert.equal(benchmark.isStillNodeLauncher(benchmark.readExecutablePath(nodeFilho.pid)), true)
    assert.equal(benchmark.isStillNodeLauncher(benchmark.readExecutablePath(outroFilho.pid)), false)
  } finally {
    nodeFilho.kill()
    outroFilho.kill()
  }
})
