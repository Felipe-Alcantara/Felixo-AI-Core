'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const benchmark = require('./terminal-scrollback-benchmark.cjs')

test('a bancada usa os quatro tamanhos pedidos por padrão', () => {
  const options = benchmark.parseArgs([])

  assert.deepEqual(options.counts, [1, 5, 10, 20])
  assert.deepEqual(options.scrollbacks, [5_000, 20_000])
})

test('a bancada rejeita cenários acima do teto controlado', () => {
  assert.throws(() => benchmark.parseArgs(['--counts=21']), /counts.*20/i)
  assert.throws(() => benchmark.parseArgs(['--scrollbacks=50001']), /scrollbacks.*50000/i)
  assert.throws(() => benchmark.parseArgs(['--lines=30001']), /lines.*30000/i)
  assert.throws(() => benchmark.parseArgs(['--native-lines=30001']), /native-lines.*30000/i)
  assert.throws(() => benchmark.parseArgs(['--native-drain-ms=10001']), /native-drain-ms.*10000/i)
})

test('o modo check valida que todos os cenários entregaram a carga', () => {
  assert.equal(benchmark.parseArgs(['--check']).check, true)
  assert.deepEqual(benchmark.validateReport({
    results: [
      {
        phase: 'native-pty',
        count: 2,
        linesPerTerminal: 4,
        linesBySession: [4, 4],
        timedOut: false,
      },
      {
        phase: 'renderer-xterm',
        count: 2,
        scrollback: 5000,
        linesPerTerminal: 4,
        linesWritten: [4, 4],
        resumedRows: [36, 36],
      },
    ],
  }), [])
  assert.deepEqual(benchmark.validateReport({
    results: [{
      phase: 'native-pty',
      count: 20,
      linesPerTerminal: 4,
      linesBySession: [4, 3],
      timedOut: true,
    }],
  }), ['native count=20: timeout', 'native count=20: saída incompleta'])
})

test('percentis são estáveis para amostras vazias, pares e ímpares', () => {
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

test('o emissor nativo não injeta valores fora dos parâmetros do cenário', () => {
  const source = benchmark.buildEmitterCode({
    lines: 10,
    burst: 2,
    intervalMs: 4,
    holdMs: 100,
    sessionIndex: 3,
    lineWidth: 80,
    longPromptChars: 16,
    longEvery: 5,
  })

  assert.match(source, /const total = 10/)
  assert.match(source, /const burst = 2/)
  assert.match(source, /sessionIndex = 3/)
  assert.match(source, /longPromptChars = 16/)
})
