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
    atual: { usPerChunk: { p50: 0.4, p95: 0.6 } },
    atualVigia: { usPerChunk: { p50: 0.41, p95: 0.62 } },
    scanMs: { p50: 0.2, p95: 0.4, count: 5 },
    scanRawMs: { p50: 0.2, p95: 0.5 },
  })
  return { spinner: { ...flow(), prefilterHits: 0 }, piorCaso: flow(), cpuPct: 2, cpuSessions: 20 }
}

/** Relatório do arquivo em disco dentro de todos os tetos. */
function arquivoOk() {
  return {
    intact: true,
    deliveredAll: true,
    overheadPct: { p50: 3, p95: 9, blocks: 5 },
    atual: { usPerChunk: { p50: 0.4, p95: 0.6 } },
    atualArquivo: { usPerChunk: { p50: 0.41, p95: 0.63 } },
    flushMs: { p50: 0.1, p95: 0.3, count: 10 },
  }
}

/** Relatório da variante ipc dentro de todos os tetos. */
function ipcOk() {
  const side = (messagesPerSecond, serializeMsPerSecond) => ({
    messagesPerSecond,
    serializeMsPerSecond,
    echoMs: { p50: 0.01, p95: 0.02, count: 6 },
    intact: true,
  })
  return { antes: side(1280, 10), depois: side(110, 5), messagesRatio: 0.086 }
}

test('o --check reprova cauda diferente, pedaço perdido e ganho abaixo do mínimo', () => {
  const ok = { sameReplay: true, deliveredAll: true, speedup: 500, vigia: vigiaOk(), arquivo: arquivoOk(), ipc: ipcOk() }
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
    benchmark.validateWatcher(
      comSpinner({
        overheadPct: { p50: benchmark.MAX_WATCHER_OVERHEAD_PCT + 0.1 },
        atualVigia: { usPerChunk: { p50: 0.4 + benchmark.MIN_WATCHER_OVERHEAD_US + 0.01 } },
      }),
    ).join(),
    /custo extra/,
  )
  assert.match(benchmark.validateWatcher(comSpinner({ overheadPct: { p50: null } })).join(), /custo extra/)
  // Piso absoluto: acima de 10% mas com menos de 0,5 µs por pedaço (o caso do
  // CI no PR #97: +14,6% = 0,124 µs) passa; acima dos dois, reprova.
  assert.deepEqual(
    benchmark.validateWatcher(
      comSpinner({
        overheadPct: { p50: 14.646 },
        atual: { usPerChunk: { p50: 0.354 } },
        atualVigia: { usPerChunk: { p50: 0.478 } },
      }),
    ),
    [],
  )
  assert.match(
    benchmark.validateWatcher(
      comSpinner({
        overheadPct: { p50: 40 },
        atual: { usPerChunk: { p50: 0.4 } },
        atualVigia: { usPerChunk: { p50: 0.4 + benchmark.MIN_WATCHER_OVERHEAD_US + 0.1 } },
      }),
    ).join(),
    /custo extra/,
  )
  assert.match(benchmark.validateWatcher(comSpinner({ atual: null })).join(), /custo extra/)
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

test('a variante atual+arquivo grava a saída inteira de cada sessão em disco e mede o lote à parte', async () => {
  const arquivo = await benchmark.runArchiveBenchmark({ sessions: 2, chunks: 60, iterations: 1 })

  assert.equal(arquivo.intact, true)
  assert.equal(arquivo.deliveredAll, true)
  assert.ok(arquivo.archivedBytes > 2 * 200_000, 'o prefill da cauda também vai para o disco')
  assert.equal(arquivo.flushMs.count, 2)
  assert.ok(arquivo.atualArquivo.usPerChunk.p50 > 0)
  assert.match(benchmark.formatReport({ ...benchmark.runBenchmark({ sessions: 1, chunks: 5, iterations: 1 }), arquivo }), /saída inteira em disco: sim/)
})

test('o --check do arquivo reprova saída incompleta, custo extra e lote lento, e exige a variante', () => {
  assert.deepEqual(benchmark.validateArchive(arquivoOk()), [])
  assert.match(benchmark.validateArchive(undefined).join(), /não rodou/)
  assert.match(benchmark.validateArchive({ ...arquivoOk(), intact: false }).join(), /inteira e em ordem/)
  assert.match(benchmark.validateArchive({ ...arquivoOk(), deliveredAll: false }).join(), /não chegou ao callback/)
  assert.match(
    benchmark.validateArchive({
      ...arquivoOk(),
      overheadPct: { p50: benchmark.MAX_ARCHIVE_OVERHEAD_PCT + 1 },
      atualArquivo: { usPerChunk: { p50: 0.4 + benchmark.MIN_ARCHIVE_OVERHEAD_US + 0.01 } },
    }).join(),
    /custo extra do arquivo/,
  )
  // Acima do percentual mas abaixo do piso absoluto passa, como na vigia.
  assert.deepEqual(
    benchmark.validateArchive({
      ...arquivoOk(),
      overheadPct: { p50: benchmark.MAX_ARCHIVE_OVERHEAD_PCT + 5 },
      atualArquivo: { usPerChunk: { p50: 0.45 } },
    }),
    [],
  )
  assert.match(
    benchmark.validateArchive({ ...arquivoOk(), flushMs: { p95: benchmark.MAX_ARCHIVE_FLUSH_P95_MS + 0.1 } }).join(),
    /lote do arquivo/,
  )
})

test('a variante ipc entrega a saída inteira e em ordem nos dois lados e agrupa as mensagens', async () => {
  const ipc = await benchmark.runIpcBenchmark({ ipcMs: 250 })

  assert.equal(ipc.antes.intact, true)
  assert.equal(ipc.depois.intact, true)
  assert.ok(ipc.depois.messagesPerSecond < ipc.antes.messagesPerSecond, 'agrupar tem de mandar menos mensagens')
  assert.ok(ipc.depois.echoMs.count > 0, 'o eco precisa ter sido medido')
  assert.match(benchmark.formatReport({ ...benchmark.runBenchmark({ sessions: 1, chunks: 5, iterations: 1 }), ipc }), /ipc depois \(agrupado\)/)
})

test('o --check da ipc reprova saída fora de ordem, pouco agrupamento, eco lento e serialização maior', () => {
  assert.deepEqual(benchmark.validateIpc(ipcOk()), [])
  assert.match(benchmark.validateIpc(undefined).join(), /não rodou/)
  const com = (patch) => ({ ...ipcOk(), ...patch })
  assert.match(benchmark.validateIpc(com({ depois: { ...ipcOk().depois, intact: false } })).join(), /inteira e em ordem/)
  assert.match(benchmark.validateIpc(com({ messagesRatio: benchmark.MAX_IPC_MESSAGES_RATIO + 0.01 })).join(), /mensagens agrupadas/)
  assert.match(
    benchmark.validateIpc(com({ depois: { ...ipcOk().depois, echoMs: { p95: benchmark.MAX_ECHO_P95_MS + 1 } } })).join(),
    /eco de tecla/,
  )
  assert.match(benchmark.validateIpc(com({ depois: { ...ipcOk().depois, serializeMsPerSecond: 11 } })).join(), /serialização/)
})
