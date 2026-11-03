'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const benchmark = require('./canvas-connection-performance.cjs')

test('lê os padrões da bancada e permite reduzir a matriz', () => {
  assert.deepEqual(benchmark.parseArgs([]).sizes, [100, 500, 1000])
  assert.deepEqual(benchmark.parseArgs(['--sizes=100,1000']).sizes, [100, 1000])
  assert.deepEqual(benchmark.parseArgs(['--modes=baseline,indexado']).modes, [
    'baseline',
    'indexado',
  ])
  assert.deepEqual(benchmark.parseArgs([]).performanceModes, ['normal', 'performance'])
  assert.deepEqual(
    benchmark.parseArgs(['--performance-modes=performance']).performanceModes,
    ['performance'],
  )
  assert.equal(benchmark.parseArgs(['--iterations=7']).iterations, 7)
  assert.equal(benchmark.parseArgs(['--timeout-ms=3000']).timeoutMs, 3000)
})

test('rejeita argumentos fora dos limites', () => {
  assert.throws(() => benchmark.parseArgs(['--sizes=200']), /sizes/i)
  assert.throws(() => benchmark.parseArgs(['--modes=outro']), /modes/i)
  assert.throws(() => benchmark.parseArgs(['--performance-modes=outro']), /performance-modes/i)
  assert.throws(() => benchmark.parseArgs(['--iterations=1']), /iterations/i)
  assert.throws(() => benchmark.parseArgs(['--timeout-ms=999']), /timeout-ms/i)
  assert.throws(() => benchmark.parseArgs(['--out=']), /out/i)
})

test('o relatório apresenta o modo visual antes do tamanho e do cenário', () => {
  const report = {
    renderer: {},
    method: { iterations: 2 },
    comparisons: [{
      size: 100,
      scenario: 'render-inicial',
      performanceMode: 'performance',
      baselineProfilerP95Ms: 10,
      indexedProfilerP95Ms: 5,
      profilerP95ImprovementPercent: 50,
      baselineHeapDeltaP95Bytes: null,
      indexedHeapDeltaP95Bytes: null,
    }],
    results: [
      { size: 100, scenario: 'render-inicial', mode: 'baseline', performanceMode: 'performance', profiler: { p50: 8 } },
      { size: 100, scenario: 'render-inicial', mode: 'indexado', performanceMode: 'performance', profiler: { p50: 4 } },
    ],
  }

  assert.match(benchmark.formatReport(report), /^performance \| 100 \| render-inicial \|/m)
})

test('valida uma matriz completa e denuncia heap ou Profiler ausente', () => {
  const options = benchmark.parseArgs([
    '--sizes=100',
    '--scenarios=render-inicial',
    '--modes=baseline,indexado',
    '--performance-modes=normal',
    '--iterations=2',
  ])
  const complete = {
    schemaVersion: 2,
    results: [
      { size: 100, scenario: 'render-inicial', mode: 'baseline', performanceMode: 'normal', repetitions: 2, profiler: { count: 2 }, heap: { supported: true, gcAvailable: true }, samples: [{ domNodeCount: 1, performanceModeApplied: 'normal', minimapVisible: true }, { domNodeCount: 1, performanceModeApplied: 'normal', minimapVisible: true }] },
      { size: 100, scenario: 'render-inicial', mode: 'indexado', performanceMode: 'normal', repetitions: 2, profiler: { count: 2 }, heap: { supported: true, gcAvailable: true }, samples: [{ domNodeCount: 1, performanceModeApplied: 'normal', minimapVisible: true }, { domNodeCount: 1, performanceModeApplied: 'normal', minimapVisible: true }] },
    ],
  }
  assert.deepEqual(benchmark.validateReport(complete, options), [])

  complete.results[1].heap.supported = false
  assert.match(benchmark.validateReport(complete, options).join('\n'), /heap indisponível/)
})
