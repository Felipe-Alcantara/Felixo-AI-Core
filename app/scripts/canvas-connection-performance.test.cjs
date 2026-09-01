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
  assert.equal(benchmark.parseArgs(['--iterations=7']).iterations, 7)
  assert.equal(benchmark.parseArgs(['--timeout-ms=3000']).timeoutMs, 3000)
})

test('rejeita argumentos fora dos limites', () => {
  assert.throws(() => benchmark.parseArgs(['--sizes=200']), /sizes/i)
  assert.throws(() => benchmark.parseArgs(['--modes=outro']), /modes/i)
  assert.throws(() => benchmark.parseArgs(['--iterations=1']), /iterations/i)
  assert.throws(() => benchmark.parseArgs(['--timeout-ms=999']), /timeout-ms/i)
  assert.throws(() => benchmark.parseArgs(['--out=']), /out/i)
})

test('valida uma matriz completa e denuncia heap ou Profiler ausente', () => {
  const options = benchmark.parseArgs([
    '--sizes=100',
    '--scenarios=render-inicial',
    '--modes=baseline,indexado',
    '--iterations=2',
  ])
  const complete = {
    schemaVersion: 1,
    results: [
      { size: 100, scenario: 'render-inicial', mode: 'baseline', repetitions: 2, profiler: { count: 2 }, heap: { supported: true, gcAvailable: true }, samples: [{ domNodeCount: 1 }, { domNodeCount: 1 }] },
      { size: 100, scenario: 'render-inicial', mode: 'indexado', repetitions: 2, profiler: { count: 2 }, heap: { supported: true, gcAvailable: true }, samples: [{ domNodeCount: 1 }, { domNodeCount: 1 }] },
    ],
  }
  assert.deepEqual(benchmark.validateReport(complete, options), [])

  complete.results[1].heap.supported = false
  assert.match(benchmark.validateReport(complete, options).join('\n'), /heap indisponível/)
})
