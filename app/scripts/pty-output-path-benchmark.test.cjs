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

/** Relatório da vigia dentro de todos os tetos. */
function vigiaOk() {
  const flow = () => ({
    watchers: 3,
    deliveredAll: true,
    detections: 0,
    scans: 10,
    prefilterHits: 10,
    overheadPct: { p50: 2, p95: 8, blocks: 5 },
    scanMs: { p50: 0.2, p95: 0.4, count: 5 },
    scanRawMs: { p50: 0.2, p95: 0.5 },
  })
  return { spinner: { ...flow(), prefilterHits: 0 }, piorCaso: flow(), cpuPct: 2, cpuSessions: 20 }
}

test('o --check reprova cauda diferente, pedaço perdido e ganho abaixo do mínimo', () => {
  const ok = { sameReplay: true, deliveredAll: true, speedup: 500, vigia: vigiaOk() }
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

test('a variante atual+vigia roda nos dois fluxos, sem detecção falsa, e o pior caso passa no pré-filtro', () => {
  const report = benchmark.runBenchmark({ sessions: 2, chunks: 80, iterations: 1 })
  const { spinner, piorCaso } = report.vigia

  assert.equal(spinner.watchers, 2)
  assert.equal(piorCaso.watchers, 2)
  assert.equal(spinner.deliveredAll, true)
  assert.equal(piorCaso.deliveredAll, true)
  assert.equal(spinner.detections, 0)
  assert.equal(piorCaso.detections, 0)
  assert.equal(spinner.prefilterHits, 0, 'o spinner não deveria passar no pré-filtro')
  assert.ok(piorCaso.scans > 0)
  assert.equal(piorCaso.prefilterHits, piorCaso.scans, 'o pior caso tem de passar no pré-filtro em toda varredura')
  assert.ok(Number.isFinite(report.vigia.cpuPct))
  assert.match(benchmark.formatReport(report), /atual\+vigia \(pior caso\)/)
})

test('o --check da vigia reprova custo extra, varredura lenta, CPU, detecção falsa e pior caso não medido', () => {
  assert.deepEqual(benchmark.validateWatcher(vigiaOk()), [])
  assert.match(benchmark.validateWatcher(undefined).join(), /não rodou/)

  const comSpinner = (patch) => {
    const vigia = vigiaOk()
    Object.assign(vigia.spinner, patch)
    return vigia
  }
  const comPiorCaso = (patch) => {
    const vigia = vigiaOk()
    Object.assign(vigia.piorCaso, patch)
    return vigia
  }
  assert.match(
    benchmark.validateWatcher(comSpinner({ overheadPct: { p50: benchmark.MAX_WATCHER_OVERHEAD_PCT + 0.1 } })).join(),
    /custo extra/,
  )
  assert.match(benchmark.validateWatcher(comSpinner({ overheadPct: { p50: null } })).join(), /custo extra/)
  assert.match(
    benchmark.validateWatcher(comPiorCaso({ scanMs: { p95: benchmark.MAX_WATCHER_SCAN_P95_MS + 0.01 } })).join(),
    /varredura do pior caso/,
  )
  assert.match(benchmark.validateWatcher({ ...vigiaOk(), cpuPct: benchmark.MAX_WATCHER_CPU_PCT + 0.1 }).join(), /CPU/)
  assert.match(benchmark.validateWatcher(comPiorCaso({ detections: 1 })).join(), /onde não havia/)
  assert.match(benchmark.validateWatcher(comPiorCaso({ prefilterHits: 3 })).join(), /pré-filtro/)
  assert.match(benchmark.validateWatcher(comSpinner({ watchers: 0 })).join(), /nenhuma sessão/)
  assert.match(benchmark.validateWatcher(comSpinner({ deliveredAll: false })).join(), /não chegou/)
})

test('os tetos da vigia são os da política de contas', () => {
  assert.equal(benchmark.MAX_WATCHER_OVERHEAD_PCT, 10)
  assert.equal(benchmark.MAX_WATCHER_SCAN_P95_MS, 1)
  assert.equal(benchmark.MAX_WATCHER_CPU_PCT, 5)
  assert.notEqual(benchmark.worstCaseChunkFor(0, 1), benchmark.worstCaseChunkFor(1, 1))
  assert.match(benchmark.worstCaseChunkFor(0, 1), /rate limit 429/)
})
