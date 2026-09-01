'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const benchmark = require('./terminal-output-performance.cjs')

test('a bancada usa os quatro fixtures e os dois modos por padrão', () => {
  const options = benchmark.parseArgs([])

  assert.deepEqual(options.scenarios, [
    'curta',
    'longa',
    'alta-frequencia',
    'multiplas-sessoes',
  ])
  assert.deepEqual(options.modes, ['baseline', 'atual'])
  assert.equal(options.iterations, 3)
  assert.equal(options.check, false)
})

test('a bancada permite reduzir a matriz e rejeita argumentos fora do contrato', () => {
  assert.deepEqual(
    benchmark.parseArgs(['--scenarios=curta,longa', '--modes=atual', '--iterations=5']).scenarios,
    ['curta', 'longa'],
  )
  assert.deepEqual(benchmark.parseArgs(['--modes=atual']).modes, ['atual'])
  assert.throws(
    () => benchmark.parseArgs(['--scenarios=curta,desconhecida']),
    /scenarios/i,
  )
  assert.throws(() => benchmark.parseArgs(['--modes=outro']), /modes/i)
  assert.throws(() => benchmark.parseArgs(['--iterations=1']), /iterations/i)
  assert.throws(() => benchmark.parseArgs(['--timeout-ms=999']), /timeout-ms/i)
  assert.throws(() => benchmark.parseArgs(['--out=']), /out/i)
})

test('percentis e resumo ignoram valores ausentes sem inventar RSS', () => {
  assert.equal(benchmark.percentile([], 0.5), null)
  assert.equal(benchmark.percentile([1, 3, 2], 0.5), 2)
  assert.equal(benchmark.percentile([1, 2, 3, 4], 0.95), 3.85)
  assert.deepEqual(benchmark.summarize([4, 1, 3, 2]), {
    count: 4,
    p50: 2.5,
    p95: 3.85,
    max: 4,
  })
})

test('o modo check exige as amostras do Profiler, heap/GC, janela e RSS', () => {
  const options = benchmark.parseArgs([
    '--scenarios=curta',
    '--modes=atual',
    '--iterations=2',
  ])
  const result = {
    schemaVersion: 1,
    results: [
      {
        mode: 'atual',
        scenario: 'curta',
        iterations: 2,
        profiler: { count: 2 },
        updateLatency: { count: 2 },
        heap: { supported: true, gcAvailable: true },
        rendererWorkingSetKiB: 100,
        samples: [{ inputEvents: 4 }],
        maxDomNodes: { max: 10 },
        droppedChunks: { max: 0 },
      },
    ],
  }

  assert.deepEqual(benchmark.validateReport(result, options), [])
  result.results[0].rendererWorkingSetKiB = null
  assert.match(benchmark.validateReport(result, options).join('\n'), /RSS/i)
})
