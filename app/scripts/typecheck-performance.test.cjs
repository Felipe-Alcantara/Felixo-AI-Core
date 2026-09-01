'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const benchmark = require('./typecheck-performance.cjs')

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
