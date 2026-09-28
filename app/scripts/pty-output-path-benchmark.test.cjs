'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const benchmark = require('./pty-output-path-benchmark.cjs')

test('a bancada do caminho de saída usa limites finitos e recusa argumento desconhecido', () => {
  assert.deepEqual(benchmark.parseArgs([]), {
    check: false,
    json: false,
    sessions: 20,
    chunks: 2_000,
    iterations: 5,
  })
  assert.equal(benchmark.parseArgs(['--sessions=5', '--chunks=10', '--iterations=1', '--check']).check, true)
  assert.throws(() => benchmark.parseArgs(['--sessions=51']), /sessions.*50/)
  assert.throws(() => benchmark.parseArgs(['--chunks=0']), /chunks/)
  assert.throws(() => benchmark.parseArgs(['--iterations=21']), /iterations.*20/)
  assert.throws(() => benchmark.parseArgs(['--qualquer']), /desconhecido/)
})

test('uma rodada curta compara as duas estratégias no mesmo fluxo e confere a cauda', () => {
  const report = benchmark.runBenchmark({ sessions: 3, chunks: 40, iterations: 1 })

  assert.equal(report.sameReplay, true)
  assert.equal(report.deliveredAll, true)
  assert.equal(report.sessions, 3)
  assert.ok(report.anterior.usPerChunk.p50 > 0)
  assert.ok(report.atual.usPerChunk.p50 > 0)
  assert.match(benchmark.formatReport(report), /mesma cauda no attach: sim/)
})

test('o --check reprova cauda diferente, pedaço perdido e ganho abaixo do mínimo', () => {
  const ok = { sameReplay: true, deliveredAll: true, speedup: 500 }
  assert.deepEqual(benchmark.validateReport(ok), [])
  assert.match(benchmark.validateReport({ ...ok, sameReplay: false }).join(), /mesma cauda/)
  assert.match(benchmark.validateReport({ ...ok, deliveredAll: false }).join(), /não chegou/)
  assert.match(benchmark.validateReport({ ...ok, speedup: 2 }).join(), /abaixo do mínimo de 10×/)
  assert.match(benchmark.validateReport({ ...ok, speedup: null }).join(), /abaixo do mínimo/)
})

test('cada pedaço é único por terminal e posição, para a conferência de cauda ter valor', () => {
  assert.notEqual(benchmark.chunkFor(0, 1), benchmark.chunkFor(1, 1))
  assert.notEqual(benchmark.chunkFor(0, 1), benchmark.chunkFor(0, 2))
  assert.equal(benchmark.percentile([1, 3, 2], 0.5), 2)
})
