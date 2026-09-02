'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const benchmark = require('./npm-runtime-performance.cjs')

test('a bancada valida argumentos, limites e modo check', () => {
  assert.deepEqual(benchmark.parseArgs([]), {
    check: false,
    help: false,
    iterations: 3,
    out: null,
    timeoutMs: 120_000,
  })
  assert.deepEqual(
    benchmark.parseArgs(['--iterations=2', '--timeout-ms=5000', '--out=report.json', '--check']),
    {
      check: true,
      help: false,
      iterations: 2,
      out: require('node:path').resolve('report.json'),
      timeoutMs: 5_000,
    },
  )
  assert.equal(benchmark.parseArgs(['--help']).help, true)
  assert.throws(() => benchmark.parseArgs(['--iterations=1']), /iterations/i)
  assert.throws(() => benchmark.parseArgs(['--timeout-ms=999']), /timeout-ms/i)
  assert.throws(() => benchmark.parseArgs(['--out=']), /out/i)
  assert.throws(() => benchmark.parseArgs(['--unknown']), /argumento/i)
})

test('percentis e resumo não mutam a amostra', () => {
  const values = [40, 10, 30, 20]
  assert.equal(benchmark.percentile(values, 0.5), 25)
  assert.equal(benchmark.percentile(values, 0.95), 38.5)
  assert.deepEqual(values, [40, 10, 30, 20])
  assert.deepEqual(benchmark.summarize(values), {
    count: 4,
    p50: 25,
    p95: 38.5,
    max: 40,
  })
  assert.deepEqual(benchmark.summarize([]), {
    count: 0,
    p50: null,
    p95: null,
    max: null,
  })
})

test('a comparação calcula redução de bytes e arquivos', () => {
  const comparison = benchmark.buildComparison({
    baseline: { inventory: { files: 100, unpackedBytes: 1_000, compressedBytes: 800 } },
    current: { inventory: { files: 80, unpackedBytes: 750, compressedBytes: 600 } },
  })

  assert.deepEqual(comparison, {
    filesSaved: 20,
    unpackedBytesSaved: 250,
    unpackedReductionPercent: 25,
    compressedBytesSaved: 200,
    compressedReductionPercent: 25,
  })
})

test('o check exige redução e instalação offline completa nas duas políticas', () => {
  const sample = {
    successful: true,
    exitCode: 0,
    offline: true,
    prefix: true,
    firstInstall: { path: true, lifecycle: true },
    update: { path: true, lifecycle: true },
    permissions: {
      installedBinExecutable: true,
      updatedBinExecutable: true,
      nodeShimExecutable: true,
      npmShimExecutable: true,
    },
  }
  const report = {
    policies: {
      baseline: {
        inventory: { files: 100, unpackedBytes: 1_000, compressedBytes: 800 },
        samples: [{ ...sample }, { ...sample }],
      },
      current: {
        inventory: { files: 80, unpackedBytes: 750, compressedBytes: 600 },
        samples: [{ ...sample }, { ...sample }],
      },
    },
  }

  assert.deepEqual(benchmark.validateReport(report, 2), [])
  report.policies.current.samples[1].update.path = false
  assert.match(benchmark.validateReport(report, 2).join('\n'), /smoke de instalação/i)
})
