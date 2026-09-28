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

/** A estratégia anterior, exatamente como estava em pty-process-manager.cjs:301. */
function runPrevious({ sessions, chunks }) {
  const buffers = Array.from({ length: sessions }, () => 'y'.repeat(MAX_REPLAY_BUFFER_CHARS))
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
  // Cauda cheia antes de medir, como na estratégia anterior.
  for (const pty of ptys) pty.emitData('y'.repeat(MAX_REPLAY_BUFFER_CHARS))
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
  }

  const summary = {
    anterior: summarize(previous, totalChunks),
    atual: summarize(current, totalChunks),
  }
  const speedup =
    summary.atual.usPerChunk.p50 > 0
      ? Number((summary.anterior.usPerChunk.p50 / summary.atual.usPerChunk.p50).toFixed(1))
      : null

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
  return problems
}

function formatReport(report, json = false) {
  if (json) return JSON.stringify(report, null, 2)

  return [
    `Caminho de saída do PTY (processo principal) — ${report.sessions} terminais × ${report.chunksPerSession} pedaços de ${report.chunkChars} caracteres, cauda de ${report.replayLimitChars.toLocaleString('pt-BR')} cheia, ${report.iterations} rodadas`,
    `  anterior (concat+slice): p50 ${report.anterior.usPerChunk.p50} µs/pedaço (p95 ${report.anterior.usPerChunk.p95}); rodada p50 ${report.anterior.totalMs.p50} ms`,
    `  atual (pty-replay-buffer): p50 ${report.atual.usPerChunk.p50} µs/pedaço (p95 ${report.atual.usPerChunk.p95}); rodada p50 ${report.atual.totalMs.p50} ms`,
    `  ganho: ${report.speedup}× · mesma cauda no attach: ${report.sameReplay ? 'sim' : 'NÃO'} · todos os pedaços entregues: ${report.deliveredAll ? 'sim' : 'NÃO'}`,
  ].join('\n')
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
  MIN_SPEEDUP,
  chunkFor,
  formatReport,
  main,
  parseArgs,
  percentile,
  runBenchmark,
  validateReport,
}
