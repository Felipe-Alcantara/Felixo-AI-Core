#!/usr/bin/env node
'use strict'

/**
 * Bancada do caminho de saída do PTY no processo principal.
 *
 * Mede quanto custa, por pedaço, o que o processo principal faz a cada
 * `onData` de cada terminal, com N terminais transmitindo ao mesmo tempo e a
 * cauda de replay já cheia (o estado de uma sessão longa). Compara, no mesmo
 * fluxo de pedaços:
 *
 * - `anterior`: a estratégia que o `PtyProcessManager` usava até 28/09/2026,
 *   `${buffer}${pedaço}`.slice(-200000) em todo pedaço;
 * - `atual`: o `PtyProcessManager` real (com PTY falso), que guarda a cauda em
 *   `pty-replay-buffer.cjs`.
 *
 * Confere também que as duas reenviam exatamente a mesma cauda no `attach`:
 * ganho que muda o que o usuário recebe não conta.
 *
 * Variante `atual+vigia` (28/09/2026): o mesmo manager com a vigia de falha
 * por conta (`accounts/account-output-watcher.cjs`) em sessões `codex`,
 * comparado com ele mesmo sem vigia, intercalados pedaço a pedaço na mesma
 * rodada. A vigia recebe um agendador manual: a cada 40 pedaços por sessão
 * (cerca de 400 ms a 100 pedaços/s) a bancada força a varredura e a mede à
 * parte. Dois fluxos: o spinner, que nunca passa no pré-filtro, e o pior
 * caso, em que todo pedaço passa nele e a taxonomia roda sobre a cauda
 * inteira. Os tetos do `--check` vêm da política (definidos antes de medir;
 * só podem baixar): custo extra por pedaço p50 ≤ 10%, varredura do pior caso
 * p95 ≤ 1 ms e, com 20 sessões, 20 × p95 / 400 ms ≤ 5% de um núcleo.
 *
 * É a parte do caminho que as bancadas de terminal existentes não alcançam —
 * `benchmark:terminal` usa node-pty e xterm crus, sem manager, IPC nem replay.
 *
 * Uso: `npm run benchmark:pty-output -- --sessions=20 --chunks=2000 --iterations=5 [--check] [--json]`
 */

const { performance } = require('node:perf_hooks')

const {
  PtyProcessManager,
  MAX_REPLAY_BUFFER_CHARS,
} = require('../electron/services/pty-process-manager.cjs')
const { createAccountOutputWatcher } = require('../electron/services/accounts/account-output-watcher.cjs')
const { OUTPUT_WATCHER_DEBOUNCE_MS } = require('../electron/services/accounts/account-chain-constants.cjs')

const DEFAULT_SESSIONS = 20
const DEFAULT_CHUNKS = 2_000
const DEFAULT_ITERATIONS = 5
const MAX_SESSIONS = 50
const MAX_CHUNKS = 20_000
const MAX_ITERATIONS = 20
/** O `--check` exige que a estratégia atual seja pelo menos isto mais barata. */
const MIN_SPEEDUP = 10

/** Um quadro de spinner típico de CLI de agente, com texto de mais de um byte. */
const SPINNER_CHUNK = '\x1b[2K\r⠋ Thinking… (12s · esc to interrupt) '.padEnd(100, 'x')

/**
 * Pior caso da vigia: o agente escrevendo sobre limite o tempo todo. Todo
 * pedaço passa no pré-filtro do Codex ("usage", "reached") e traz "rate
 * limit" e "429", mas nenhum é o aviso de verdade — a taxonomia roda inteira
 * sobre a cauda e não pode detectar nada.
 */
const WORST_CASE_CHUNK = '\x1b[2K\r⠋ usage limit reached? rate limit 429 (status 429) retrying… '.padEnd(100, 'x')

/** Tetos da vigia (política de contas, §15.1). */
const MAX_WATCHER_OVERHEAD_PCT = 10
const MAX_WATCHER_SCAN_P95_MS = 1
const MAX_WATCHER_CPU_PCT = 5
/** Sessões usadas no cálculo de CPU do pior caso, fixo como na política. */
const WATCHER_CPU_SESSIONS = 20
/** A cada quantos pedaços por sessão a bancada força a varredura. */
const WATCHER_SCAN_EVERY_CHUNKS = 40

/**
 * Percentil linear, igual ao usado nas outras bancadas do projeto.
 *
 * @param {number[]} values
 * @param {number} percentage
 * @returns {number|null}
 */
function percentile(values, percentage) {
  const clean = values.filter(Number.isFinite).sort((left, right) => left - right)
  if (!clean.length) return null

  const index = (clean.length - 1) * percentage
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const result =
    lower === upper
      ? clean[lower]
      : clean[lower] + (clean[upper] - clean[lower]) * (index - lower)

  return Number(result.toFixed(3))
}

function parsePositiveInteger(value, fallback, maximum, label) {
  if (value === undefined || value === '') return fallback

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${label} deve ser um inteiro entre 1 e ${maximum}.`)
  }

  return parsed
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv = []) {
  const raw = {}
  const options = { check: false, json: false }

  for (const argument of argv) {
    if (argument === '--check') {
      options.check = true
      continue
    }
    if (argument === '--json') {
      options.json = true
      continue
    }
    const match = /^--(sessions|chunks|iterations)=(.*)$/.exec(argument)
    if (!match) {
      throw new Error(`Argumento desconhecido: ${argument}`)
    }
    raw[match[1]] = match[2]
  }

  return {
    ...options,
    sessions: parsePositiveInteger(raw.sessions, DEFAULT_SESSIONS, MAX_SESSIONS, 'sessions'),
    chunks: parsePositiveInteger(raw.chunks, DEFAULT_CHUNKS, MAX_CHUNKS, 'chunks'),
    iterations: parsePositiveInteger(raw.iterations, DEFAULT_ITERATIONS, MAX_ITERATIONS, 'iterations'),
  }
}

/** Pedaço `index` do terminal `session`: único, para a conferência de cauda valer. */
function chunkFor(session, index) {
  return `${SPINNER_CHUNK}${session}:${index}\r\n`
}

/** Pedaço do pior caso da vigia, também único por terminal e posição. */
function worstCaseChunkFor(session, index) {
  return `${WORST_CASE_CHUNK}${session}:${index}\r\n`
}

/**
 * Pedaços que enchem a cauda antes de medir, do tamanho dos pedaços reais —
 * não um bloco único de 200.000: assim o buffer atual já está no regime de
 * descarte (cada pedaço novo tira o mais antigo) desde o primeiro pedaço
 * medido, mesmo nas rodadas curtas do CI.
 */
function prefillChunks(session) {
  const size = chunkFor(session, 0).length
  const count = Math.ceil(MAX_REPLAY_BUFFER_CHARS / size) + 1
  return Array.from({ length: count }, (_, index) => chunkFor(session, -1 - index))
}

/** A estratégia anterior, exatamente como estava em pty-process-manager.cjs:301. */
function runPrevious({ sessions, chunks }) {
  const buffers = Array.from({ length: sessions }, (_, session) =>
    prefillChunks(session).join('').slice(-MAX_REPLAY_BUFFER_CHARS),
  )
  const delivered = []
  const onData = (data) => delivered.push(data.length)

  const startedAt = performance.now()
  for (let index = 0; index < chunks; index += 1) {
    for (let session = 0; session < sessions; session += 1) {
      const data = chunkFor(session, index)
      buffers[session] = `${buffers[session]}${String(data)}`.slice(-MAX_REPLAY_BUFFER_CHARS)
      onData(data)
    }
  }
  const elapsedMs = performance.now() - startedAt

  return { elapsedMs, replays: buffers, delivered: delivered.length }
}

/** PTY falso com a mesma superfície que o manager usa do node-pty. */
function createFakePtyFactory() {
  const ptys = []
  const spawnPty = () => {
    const listeners = []
    const pty = {
      pid: 4242 + ptys.length,
      write() {},
      resize() {},
      kill() {},
      onData(listener) {
        listeners.push(listener)
      },
      onExit() {},
      emitData(data) {
        for (const listener of listeners) listener(data)
      },
    }
    ptys.push(pty)
    return pty
  }
  return { ptys, spawnPty }
}

/** O caminho atual: o PtyProcessManager real recebendo os mesmos pedaços. */
function runCurrent({ sessions, chunks }) {
  const { ptys, spawnPty } = createFakePtyFactory()
  const manager = new PtyProcessManager({
    spawnPty,
    platform: { name: 'linux', getDefaultShell: () => '/bin/bash' },
  })
  let delivered = 0
  const ids = Array.from({ length: sessions }, (_, session) => `bench:${session}`)
  for (const id of ids) {
    manager.spawn(id, { command: 'bash', onData: () => { delivered += 1 } })
  }
  // Cauda cheia antes de medir, com os mesmos pedaços da estratégia anterior.
  ptys.forEach((pty, session) => {
    for (const chunk of prefillChunks(session)) pty.emitData(chunk)
  })
  delivered = 0

  const startedAt = performance.now()
  for (let index = 0; index < chunks; index += 1) {
    for (let session = 0; session < sessions; session += 1) {
      ptys[session].emitData(chunkFor(session, index))
    }
  }
  const elapsedMs = performance.now() - startedAt

  const replays = ids.map((id) => {
    let replay = ''
    manager.spawn(id, { command: 'bash', reuseExisting: true, onData: (data) => { replay += data } })
    return replay
  })
  for (const id of ids) manager.kill(id, { force: true })

  return { elapsedMs, replays, delivered }
}

/**
 * Manager real com PTY falso e sessões `codex`, com ou sem a vigia. A vigia
 * recebe um agendador que nunca dispara: quem varre é a bancada, na hora
 * que escolhe, para medir a varredura fora do custo por pedaço.
 */
function createWatcherBench({ sessions, withWatcher }) {
  const { ptys, spawnPty } = createFakePtyFactory()
  const watchers = []
  const bench = { ptys, watchers, elapsedMs: 0, delivered: 0, detections: 0, manager: null, ids: [] }
  const watcherDependencies = withWatcher
    ? {
        createOutputWatcher: (options) => {
          const watcher = createAccountOutputWatcher({
            ...options,
            setTimer: () => ({}),
            clearTimer: () => {},
          })
          if (watcher) watchers.push(watcher)
          return watcher
        },
        onOutputFailure: () => {
          bench.detections += 1
        },
      }
    : {}
  bench.manager = new PtyProcessManager({
    spawnPty,
    platform: { name: 'linux', getDefaultShell: () => '/bin/bash' },
    // A bancada não lê o histórico real das CLIs da máquina.
    discoverAgentSession: () => null,
    ...watcherDependencies,
  })
  bench.ids = Array.from({ length: sessions }, (_, session) => `bench:${withWatcher ? 'vigia' : 'base'}:${session}`)
  for (const id of bench.ids) {
    bench.manager.spawn(id, { command: 'codex', onData: () => { bench.delivered += 1 } })
  }
  return bench
}

/**
 * `atual` contra `atual+vigia` no mesmo fluxo, intercalados pedaço a pedaço
 * (a ordem alterna a cada pedaço) para a carga da máquina não favorecer um
 * lado. Devolve o tempo de cada lado, o custo extra de cada bloco de 40
 * pedaços (entre duas varreduras) e o tempo de cada varredura forçada. O
 * custo extra é amostrado por bloco, e não pela rodada inteira, para que uma
 * preempção ou coleta de lixo pegue um bloco só e não a rodada: o p50 dos
 * blocos é o número que o teto compara.
 *
 * Cada ponto de varredura roda duas varreduras seguidas da mesma cauda (o
 * mesmo trabalho: pré-filtro, taxonomia inteira, dedupe) e o teto usa a
 * menor das duas, pela mesma razão: numa máquina carregada, uma preempção
 * pega uma só. A primeira, sozinha, também sai no relatório (`scanRawMs`).
 */
function timeScan(watcher) {
  const startedAt = performance.now()
  watcher.scan()
  return performance.now() - startedAt
}

function runWatcherPair({ sessions, chunks }, chunkOf) {
  const base = createWatcherBench({ sessions, withWatcher: false })
  const watched = createWatcherBench({ sessions, withWatcher: true })
  const prefill = (session) => {
    const size = chunkOf(session, 0).length
    const count = Math.ceil(MAX_REPLAY_BUFFER_CHARS / size) + 1
    return Array.from({ length: count }, (_, index) => chunkOf(session, -1 - index))
  }
  for (const bench of [base, watched]) {
    bench.ptys.forEach((pty, session) => {
      for (const chunk of prefill(session)) pty.emitData(chunk)
    })
    bench.delivered = 0
  }
  // A cauda cheia do prefill ainda não foi varrida; a primeira varredura
  // medida já é a do regime.
  for (const watcher of watched.watchers) watcher.scan()
  const statsBefore = watched.watchers.map((watcher) => watcher.stats)

  const scanMs = []
  const scanRawMs = []
  const overheadPct = []
  let blockBaseMs = 0
  let blockWatchedMs = 0
  for (let index = 0; index < chunks; index += 1) {
    const order = index % 2 === 0 ? [base, watched] : [watched, base]
    for (const bench of order) {
      const startedAt = performance.now()
      for (let session = 0; session < sessions; session += 1) {
        bench.ptys[session].emitData(chunkOf(session, index))
      }
      const elapsedMs = performance.now() - startedAt
      bench.elapsedMs += elapsedMs
      if (bench === base) blockBaseMs += elapsedMs
      else blockWatchedMs += elapsedMs
    }
    if ((index + 1) % WATCHER_SCAN_EVERY_CHUNKS === 0 || index === chunks - 1) {
      if (blockBaseMs > 0) overheadPct.push(((blockWatchedMs - blockBaseMs) / blockBaseMs) * 100)
      blockBaseMs = 0
      blockWatchedMs = 0
    }
    if ((index + 1) % WATCHER_SCAN_EVERY_CHUNKS === 0) {
      for (const watcher of watched.watchers) {
        const first = timeScan(watcher)
        scanRawMs.push(first)
        scanMs.push(Math.min(first, timeScan(watcher)))
      }
    }
  }

  const stats = watched.watchers.map((watcher, index) => ({
    scans: watcher.stats.scans - statsBefore[index].scans,
    prefilterHits: watcher.stats.prefilterHits - statsBefore[index].prefilterHits,
  }))
  for (const bench of [base, watched]) {
    for (const id of bench.ids) bench.manager.kill(id, { force: true })
  }

  return {
    baseMs: base.elapsedMs,
    watchedMs: watched.elapsedMs,
    overheadPct,
    scanMs,
    scanRawMs,
    watchers: watched.watchers.length,
    scans: stats.reduce((sum, item) => sum + item.scans, 0),
    prefilterHits: stats.reduce((sum, item) => sum + item.prefilterHits, 0),
    detections: watched.detections,
    deliveredAll: base.delivered === sessions * chunks && watched.delivered === sessions * chunks,
  }
}

function summarizeWatcherFlow(runs, totalChunks) {
  const overheadPct = runs.flatMap((run) => run.overheadPct)
  const scanMs = runs.flatMap((run) => run.scanMs)
  const scanRawMs = runs.flatMap((run) => run.scanRawMs)
  return {
    atual: summarize(runs.map((run) => run.baseMs), totalChunks),
    atualVigia: summarize(runs.map((run) => run.watchedMs), totalChunks),
    overheadPct: { p50: percentile(overheadPct, 0.5), p95: percentile(overheadPct, 0.95), blocks: overheadPct.length },
    scanMs: { p50: percentile(scanMs, 0.5), p95: percentile(scanMs, 0.95), count: scanMs.length },
    scanRawMs: { p50: percentile(scanRawMs, 0.5), p95: percentile(scanRawMs, 0.95) },
    watchers: runs[0]?.watchers ?? 0,
    scans: runs.reduce((sum, run) => sum + run.scans, 0),
    prefilterHits: runs.reduce((sum, run) => sum + run.prefilterHits, 0),
    detections: runs.reduce((sum, run) => sum + run.detections, 0),
    deliveredAll: runs.every((run) => run.deliveredAll),
  }
}

function summarize(samples, totalChunks) {
  const perChunkUs = samples.map((ms) => (ms * 1000) / totalChunks)
  return {
    totalMs: { p50: percentile(samples, 0.5), p95: percentile(samples, 0.95) },
    usPerChunk: { p50: percentile(perChunkUs, 0.5), p95: percentile(perChunkUs, 0.95) },
  }
}

function runBenchmark(options) {
  const totalChunks = options.sessions * options.chunks
  const previous = []
  const current = []
  const watcherSpinner = []
  const watcherWorstCase = []
  let sameReplay = true
  let deliveredAll = true

  // Intercala as duas estratégias a cada rodada para a carga da máquina não
  // favorecer um lado.
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    const before = runPrevious(options)
    const after = runCurrent(options)
    previous.push(before.elapsedMs)
    current.push(after.elapsedMs)
    sameReplay &&= before.replays.every((replay, index) => replay === after.replays[index])
    deliveredAll &&= before.delivered === totalChunks && after.delivered === totalChunks
    watcherSpinner.push(runWatcherPair(options, chunkFor))
    watcherWorstCase.push(runWatcherPair(options, worstCaseChunkFor))
  }

  const summary = {
    anterior: summarize(previous, totalChunks),
    atual: summarize(current, totalChunks),
  }
  const speedup =
    summary.atual.usPerChunk.p50 > 0
      ? Number((summary.anterior.usPerChunk.p50 / summary.atual.usPerChunk.p50).toFixed(1))
      : null

  const spinner = summarizeWatcherFlow(watcherSpinner, totalChunks)
  const piorCaso = summarizeWatcherFlow(watcherWorstCase, totalChunks)
  const cpuPct =
    piorCaso.scanMs.p95 === null
      ? null
      : Number(((WATCHER_CPU_SESSIONS * piorCaso.scanMs.p95) / OUTPUT_WATCHER_DEBOUNCE_MS * 100).toFixed(3))

  return {
    benchmark: 'pty-output-path',
    host: { node: process.versions.node, platform: process.platform, arch: process.arch },
    sessions: options.sessions,
    chunksPerSession: options.chunks,
    iterations: options.iterations,
    chunkChars: chunkFor(0, 0).length,
    replayLimitChars: MAX_REPLAY_BUFFER_CHARS,
    ...summary,
    speedup,
    sameReplay,
    deliveredAll,
    vigia: {
      scanEveryChunks: WATCHER_SCAN_EVERY_CHUNKS,
      spinner,
      piorCaso,
      cpuPct,
      cpuSessions: WATCHER_CPU_SESSIONS,
      tetos: {
        overheadPct: MAX_WATCHER_OVERHEAD_PCT,
        scanP95Ms: MAX_WATCHER_SCAN_P95_MS,
        cpuPct: MAX_WATCHER_CPU_PCT,
      },
    },
  }
}

/** Problemas que reprovam o `--check`; vazio quando a bancada passou. */
function validateReport(report, minSpeedup = MIN_SPEEDUP) {
  const problems = []
  if (!report.sameReplay) problems.push('as duas estratégias não reenviam a mesma cauda no attach')
  if (!report.deliveredAll) problems.push('algum pedaço não chegou ao callback do renderer')
  if (!(report.speedup >= minSpeedup)) {
    problems.push(`ganho de ${report.speedup}× abaixo do mínimo de ${minSpeedup}×`)
  }
  problems.push(...validateWatcher(report.vigia))
  return problems
}

/** Tetos da variante `atual+vigia`; um relatório sem ela reprova. */
function validateWatcher(vigia) {
  if (!vigia) return ['a variante atual+vigia não rodou']

  const problems = []
  const { spinner, piorCaso } = vigia
  if (!(spinner.watchers > 0 && piorCaso.watchers > 0)) problems.push('nenhuma sessão ganhou vigia')
  if (!spinner.deliveredAll || !piorCaso.deliveredAll) {
    problems.push('com a vigia, algum pedaço não chegou ao callback do renderer')
  }
  if (spinner.detections > 0 || piorCaso.detections > 0) {
    problems.push(`a vigia detectou falha onde não havia (${spinner.detections + piorCaso.detections})`)
  }
  if (!(piorCaso.scans > 0 && piorCaso.prefilterHits === piorCaso.scans)) {
    problems.push('o pior caso não passou no pré-filtro em toda varredura; a taxonomia não foi medida')
  }
  if (!(spinner.overheadPct.p50 !== null && spinner.overheadPct.p50 <= MAX_WATCHER_OVERHEAD_PCT)) {
    problems.push(`custo extra da vigia por pedaço p50 ${spinner.overheadPct.p50}% acima de ${MAX_WATCHER_OVERHEAD_PCT}%`)
  }
  if (!(piorCaso.scanMs.p95 !== null && piorCaso.scanMs.p95 <= MAX_WATCHER_SCAN_P95_MS)) {
    problems.push(`varredura do pior caso p95 ${piorCaso.scanMs.p95} ms acima de ${MAX_WATCHER_SCAN_P95_MS} ms`)
  }
  if (!(vigia.cpuPct !== null && vigia.cpuPct <= MAX_WATCHER_CPU_PCT)) {
    problems.push(`CPU da vigia no pior caso ${vigia.cpuPct}% de um núcleo acima de ${MAX_WATCHER_CPU_PCT}%`)
  }
  return problems
}

function formatReport(report, json = false) {
  if (json) return JSON.stringify(report, null, 2)

  return [
    `Caminho de saída do PTY (processo principal) — ${report.sessions} terminais × ${report.chunksPerSession} pedaços de ${report.chunkChars} caracteres, cauda de ${report.replayLimitChars.toLocaleString('pt-BR')} cheia, ${report.iterations} rodadas`,
    `  anterior (concat+slice): p50 ${report.anterior.usPerChunk.p50} µs/pedaço (p95 ${report.anterior.usPerChunk.p95}); rodada p50 ${report.anterior.totalMs.p50} ms`,
    `  atual (pty-replay-buffer): p50 ${report.atual.usPerChunk.p50} µs/pedaço (p95 ${report.atual.usPerChunk.p95}); rodada p50 ${report.atual.totalMs.p50} ms`,
    `  ganho: ${report.speedup}× · mesma cauda no attach: ${report.sameReplay ? 'sim' : 'NÃO'} · todos os pedaços entregues: ${report.deliveredAll ? 'sim' : 'NÃO'}`,
    ...formatWatcher(report.vigia),
  ].join('\n')
}

function formatWatcher(vigia) {
  if (!vigia) return []
  const flow = (label, data) =>
    `  atual+vigia (${label}): p50 ${data.atualVigia.usPerChunk.p50} µs/pedaço contra ${data.atual.usPerChunk.p50} sem vigia · custo extra p50 ${data.overheadPct.p50}% (p95 ${data.overheadPct.p95}%, ${data.overheadPct.blocks} blocos) · varredura p50 ${data.scanMs.p50} ms, p95 ${data.scanMs.p95} ms (menor de 2; só a primeira: p95 ${data.scanRawMs.p95} ms; ${data.scanMs.count} pontos, ${data.prefilterHits} varreduras passaram no pré-filtro) · detecções ${data.detections}`
  return [
    flow('spinner', vigia.spinner),
    flow('pior caso', vigia.piorCaso),
    `  CPU da vigia no pior caso: ${vigia.cpuSessions} sessões × p95 / ${OUTPUT_WATCHER_DEBOUNCE_MS} ms = ${vigia.cpuPct}% de um núcleo · tetos: extra ≤ ${vigia.tetos.overheadPct}%, varredura p95 ≤ ${vigia.tetos.scanP95Ms} ms, CPU ≤ ${vigia.tetos.cpuPct}%`,
  ]
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  const report = runBenchmark(options)
  console.log(formatReport(report, options.json))

  if (options.check) {
    const problems = validateReport(report)
    if (problems.length) {
      console.error(`[pty-output-path] reprovado: ${problems.join('; ')}`)
      process.exitCode = 1
    }
  }
  return report
}

if (require.main === module) {
  main()
}

module.exports = {
  MAX_WATCHER_CPU_PCT,
  MAX_WATCHER_OVERHEAD_PCT,
  MAX_WATCHER_SCAN_P95_MS,
  MIN_SPEEDUP,
  chunkFor,
  formatReport,
  main,
  parseArgs,
  percentile,
  runBenchmark,
  validateReport,
  validateWatcher,
  worstCaseChunkFor,
}
