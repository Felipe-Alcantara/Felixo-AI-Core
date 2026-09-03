#!/usr/bin/env node
'use strict'

/**
 * Bancada de custo de terminais concorrentes.
 *
 * Há duas fases intencionalmente separadas:
 *   1. PTY nativo: cria processos node-pty e mede spawn/saída/memória do
 *      processo e dos filhos, sem xterm. Isso isola o custo do backend.
 *   2. renderer xterm: cria os mesmos N buffers visuais no Electron e mede
 *      parse/write, frames, long tasks, retenção, attach/detach, fechamento e
 *      replay de resume. Isso isola o custo do scrollback visual.
 *
 * Uso local em Linux: `xvfb-run -a npm run benchmark:terminal`.
 * O comando não aceita limites infinitos: as opções têm teto para que uma
 * execução experimental não transforme a bancada em um teste acidental de
 * exaustão do sistema.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { performance } = require('node:perf_hooks')

const DEFAULT_COUNTS = [1, 5, 10, 20]
const DEFAULT_SCROLLBACKS = [5_000, 20_000]
const DEFAULT_POLICIES = ['current', 'adaptive']
const CURRENT_SCROLLBACK = 20_000
const DEFAULT_ADAPTIVE_SCROLLBACK = 5_000
const DEFAULT_ADAPTIVE_THRESHOLD = 10
const DEFAULT_LINES_PER_TERMINAL = 8_000
const DEFAULT_NATIVE_LINES_PER_TERMINAL = 2_000
const DEFAULT_ACTIVE_INTERVAL_MS = 4
const DEFAULT_CHUNK_LINES = 32
const DEFAULT_LINE_WIDTH = 120
const DEFAULT_LONG_PROMPT_CHARS = 4_096
const DEFAULT_LONG_EVERY = 2_000
const DEFAULT_NATIVE_HOLD_MS = 5_000
const DEFAULT_NATIVE_DRAIN_MS = 2_000
const DEFAULT_SAMPLE_INTERVAL_MS = 250
const DEFAULT_TIMEOUT_MS = 120_000
const MAX_COUNT = 20
const MAX_SCROLLBACK = 50_000
const MAX_LINES_PER_TERMINAL = 30_000
const MAX_NATIVE_LINES_PER_TERMINAL = 30_000
const MAX_TIMEOUT_MS = 10 * 60_000

function percentile(values, percentage) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (!clean.length) return null
  const index = (clean.length - 1) * percentage
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const result = lower === upper
    ? clean[lower]
    : clean[lower] + (clean[upper] - clean[lower]) * (index - lower)
  return Number(result.toFixed(3))
}

function summarize(values) {
  const clean = values.filter((value) => Number.isFinite(value))
  return {
    count: clean.length,
    p50: percentile(clean, 0.5),
    p95: percentile(clean, 0.95),
    max: clean.length ? Math.max(...clean) : null,
  }
}

function heapStreamDeltaBytes(result) {
  const before = result?.heapBefore?.usedJsHeapBytes
  const afterStream = result?.heapAfterStream?.usedJsHeapBytes
  if (!Number.isFinite(before) || !Number.isFinite(afterStream)) return null
  return afterStream - before
}

function validateReport(report) {
  const failures = []
  const currentBaselines = new Map()
  for (const result of report.results ?? []) {
    if (result.phase === 'native-pty') {
      if (result.timedOut) {
        failures.push(`native count=${result.count}: timeout`)
      }
      if (result.linesBySession?.some((lineCount) => lineCount < result.linesPerTerminal)) {
        failures.push(`native count=${result.count}: saída incompleta`)
      }
      continue
    }

    if (result.phase === 'renderer-xterm') {
      const label = `renderer count=${result.count} scrollback=${result.scrollback}`
      if (result.linesWritten?.some((lineCount) => lineCount < result.linesPerTerminal)) {
        failures.push(`${label}: saída incompleta`)
      }
      if (result.resumedRows?.some((rowCount) => rowCount <= 0)) {
        failures.push(`${label}: resume vazio`)
      }
      if (result.lineIntegrity?.some((entry) => !entry.outputComplete || entry.unexpectedGap)) {
        failures.push(`${label}: identidade da saída perdida ou com lacuna inesperada`)
      }
      if (result.detachAttachPreserved === false) {
        failures.push(`${label}: attach/detach alterou o trecho visível`)
      }
      if (result.resumeIntegrity?.some((entry) => !entry.outputComplete || entry.unexpectedGap)) {
        failures.push(`${label}: resume perdeu o trecho final`)
      }

      if (result.policy === 'current' && result.scrollback === CURRENT_SCROLLBACK) {
        currentBaselines.set(result.count, result)
      }
    }
  }

  const scenario = report.scenario ?? {}
  const adaptiveThreshold = Number.isFinite(scenario.adaptiveThreshold)
    ? scenario.adaptiveThreshold
    : DEFAULT_ADAPTIVE_THRESHOLD
  const adaptiveScrollback = Number.isFinite(scenario.adaptiveScrollback)
    ? scenario.adaptiveScrollback
    : DEFAULT_ADAPTIVE_SCROLLBACK

  for (const result of report.results ?? []) {
    if (result.phase !== 'renderer-xterm' || result.policy !== 'adaptive') continue

    const expectedScrollback = result.count >= adaptiveThreshold
      ? adaptiveScrollback
      : CURRENT_SCROLLBACK
    if (result.scrollback !== expectedScrollback) {
      failures.push(
        `adaptive count=${result.count}: limite ${result.scrollback} não segue ${expectedScrollback}`,
      )
    }

    // A reduced run with fewer than one compact buffer of output can validate
    // integrity but cannot prove a memory gain. Full CI runs use 8k lines and
    // enter this comparison for the 10/20-session cases.
    const baseline = currentBaselines.get(result.count)
    const candidateHeapDelta = heapStreamDeltaBytes(result)
    const baselineHeapDelta = heapStreamDeltaBytes(baseline)
    const hasHeapDelta =
      Number.isFinite(candidateHeapDelta) && Number.isFinite(baselineHeapDelta)
    // O renderer é compartilhado entre os cenários deste relatório. Depois
    // de um cenário pesado, o working set do Chromium pode não devolver as
    // páginas ao SO mesmo com GC, então o RSS absoluto é uma comparação
    // contaminada. O delta de heap antes→stream é a métrica comparável do
    // trabalho do cenário; relatórios antigos sem esses campos continuam
    // usando o RSS como fallback.
    const candidateMemoryMetric = hasHeapDelta
      ? candidateHeapDelta
      : result.rendererWorkingSetMiB?.p95
    const baselineMemoryMetric = hasHeapDelta
      ? baselineHeapDelta
      : baseline?.rendererWorkingSetMiB?.p95
    if (
      baseline &&
      result.count >= adaptiveThreshold &&
      result.linesPerTerminal >= adaptiveScrollback &&
      Number.isFinite(candidateMemoryMetric) &&
      Number.isFinite(baselineMemoryMetric) &&
      candidateMemoryMetric >= baselineMemoryMetric * 0.95
    ) {
      failures.push(
        hasHeapDelta
          ? `adaptive count=${result.count}: não reduziu o delta de heap do stream em pelo menos 5%`
          : `adaptive count=${result.count}: não reduziu o RSS p95 do renderer em pelo menos 5%`,
      )
    }

    if (
      baseline &&
      Number.isFinite(baseline.resumeMs) &&
      baseline.resumeMs > 0 &&
      Number.isFinite(result.resumeMs) &&
      result.resumeMs > baseline.resumeMs * 1.25
    ) {
      failures.push(`adaptive count=${result.count}: resume regrediu mais de 25%`)
    }
  }

  return failures
}

function parsePolicies(value) {
  if (value === undefined || value === '') return [...DEFAULT_POLICIES]
  const parsed = String(value)
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

  if (!parsed.length || parsed.some((item) => !DEFAULT_POLICIES.includes(item))) {
    throw new Error(`policies deve conter apenas: ${DEFAULT_POLICIES.join(', ')}.`)
  }

  return [...new Set(parsed)]
}

function parsePositiveList(value, fallback, maximum, label) {
  if (value === undefined || value === '') return [...fallback]
  const parsed = String(value)
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && Number.isInteger(item) && item > 0)

  if (!parsed.length || parsed.some((item) => item > maximum)) {
    throw new Error(`${label} deve conter inteiros positivos até ${maximum}.`)
  }

  return [...new Set(parsed)]
}

function parseBoundedNumber(value, fallback, minimum, maximum, label) {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} deve estar entre ${minimum} e ${maximum}.`)
  }
  return parsed
}

function parseArgs(argv = []) {
  const options = {
    counts: DEFAULT_COUNTS,
    scrollbacks: DEFAULT_SCROLLBACKS,
    policies: DEFAULT_POLICIES,
    adaptiveScrollback: DEFAULT_ADAPTIVE_SCROLLBACK,
    adaptiveThreshold: DEFAULT_ADAPTIVE_THRESHOLD,
    linesPerTerminal: DEFAULT_LINES_PER_TERMINAL,
    nativeLinesPerTerminal: DEFAULT_NATIVE_LINES_PER_TERMINAL,
    activeIntervalMs: DEFAULT_ACTIVE_INTERVAL_MS,
    chunkLines: DEFAULT_CHUNK_LINES,
    lineWidth: DEFAULT_LINE_WIDTH,
    longPromptChars: DEFAULT_LONG_PROMPT_CHARS,
    longEvery: DEFAULT_LONG_EVERY,
    nativeHoldMs: DEFAULT_NATIVE_HOLD_MS,
    nativeDrainMs: DEFAULT_NATIVE_DRAIN_MS,
    sampleIntervalMs: DEFAULT_SAMPLE_INTERVAL_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    outputPath: null,
    check: false,
  }

  for (const argument of argv) {
    if (!argument.startsWith('--')) {
      throw new Error(`Argumento desconhecido: ${argument}`)
    }
    const separator = argument.indexOf('=')
    const name = separator >= 0 ? argument.slice(2, separator) : argument.slice(2)
    const value = separator >= 0 ? argument.slice(separator + 1) : undefined

    switch (name) {
      case 'counts':
        options.counts = parsePositiveList(value, DEFAULT_COUNTS, MAX_COUNT, 'counts')
        break
      case 'scrollbacks':
        options.scrollbacks = parsePositiveList(
          value,
          DEFAULT_SCROLLBACKS,
          MAX_SCROLLBACK,
          'scrollbacks',
        )
        break
      case 'policies':
        options.policies = parsePolicies(value)
        break
      case 'adaptive-scrollback':
        options.adaptiveScrollback = parseBoundedNumber(
          value,
          DEFAULT_ADAPTIVE_SCROLLBACK,
          1,
          MAX_SCROLLBACK,
          'adaptive-scrollback',
        )
        break
      case 'adaptive-threshold':
        options.adaptiveThreshold = parseBoundedNumber(
          value,
          DEFAULT_ADAPTIVE_THRESHOLD,
          1,
          MAX_COUNT,
          'adaptive-threshold',
        )
        break
      case 'lines':
        options.linesPerTerminal = parseBoundedNumber(
          value,
          DEFAULT_LINES_PER_TERMINAL,
          1,
          MAX_LINES_PER_TERMINAL,
          'lines',
        )
        break
      case 'native-lines':
        options.nativeLinesPerTerminal = parseBoundedNumber(
          value,
          DEFAULT_NATIVE_LINES_PER_TERMINAL,
          1,
          MAX_NATIVE_LINES_PER_TERMINAL,
          'native-lines',
        )
        break
      case 'active-interval-ms':
        options.activeIntervalMs = parseBoundedNumber(
          value,
          DEFAULT_ACTIVE_INTERVAL_MS,
          0,
          1_000,
          'active-interval-ms',
        )
        break
      case 'chunk-lines':
        options.chunkLines = parseBoundedNumber(value, DEFAULT_CHUNK_LINES, 1, 1_000, 'chunk-lines')
        break
      case 'line-width':
        options.lineWidth = parseBoundedNumber(value, DEFAULT_LINE_WIDTH, 1, 4_096, 'line-width')
        break
      case 'long-prompt-chars':
        options.longPromptChars = parseBoundedNumber(
          value,
          DEFAULT_LONG_PROMPT_CHARS,
          0,
          64_000,
          'long-prompt-chars',
        )
        break
      case 'long-every':
        options.longEvery = parseBoundedNumber(value, DEFAULT_LONG_EVERY, 1, 100_000, 'long-every')
        break
      case 'native-hold-ms':
        options.nativeHoldMs = parseBoundedNumber(
          value,
          DEFAULT_NATIVE_HOLD_MS,
          0,
          60_000,
          'native-hold-ms',
        )
        break
      case 'native-drain-ms':
        options.nativeDrainMs = parseBoundedNumber(
          value,
          DEFAULT_NATIVE_DRAIN_MS,
          0,
          10_000,
          'native-drain-ms',
        )
        break
      case 'sample-interval-ms':
        options.sampleIntervalMs = parseBoundedNumber(
          value,
          DEFAULT_SAMPLE_INTERVAL_MS,
          25,
          5_000,
          'sample-interval-ms',
        )
        break
      case 'timeout-ms':
        options.timeoutMs = parseBoundedNumber(value, DEFAULT_TIMEOUT_MS, 1_000, MAX_TIMEOUT_MS, 'timeout-ms')
        break
      case 'out':
        if (!value) throw new Error('--out precisa de um caminho de arquivo.')
        options.outputPath = path.resolve(value)
        break
      case 'check':
        options.check = true
        break
      case 'help':
        options.help = true
        break
      default:
        throw new Error(`Argumento desconhecido: --${name}`)
    }
  }

  return options
}

function buildEmitterCode({ lines, burst, intervalMs, holdMs, sessionIndex, lineWidth, longPromptChars, longEvery }) {
  return `
    const total = ${JSON.stringify(lines)}
    const burst = ${JSON.stringify(burst)}
    const intervalMs = ${JSON.stringify(intervalMs)}
    const holdMs = ${JSON.stringify(holdMs)}
    const sessionIndex = ${JSON.stringify(sessionIndex)}
    const lineWidth = ${JSON.stringify(lineWidth)}
    const longPromptChars = ${JSON.stringify(longPromptChars)}
    const longEvery = ${JSON.stringify(longEvery)}
    let line = 0
    function next() {
      let output = ''
      const end = Math.min(total, line + burst)
      while (line < end) {
        const prefix = 'session-' + sessionIndex + ' output-' + line + ' '
        const body = longPromptChars > 0 && line % longEvery === 0
          ? 'p'.repeat(longPromptChars)
          : 'x'.repeat(Math.max(0, lineWidth - prefix.length))
        output += prefix + body + '\\n'
        line += 1
      }
      if (output) process.stdout.write(output)
      if (line < total) {
        setTimeout(next, intervalMs)
      } else {
        setTimeout(() => process.exit(0), holdMs)
      }
    }
    next()
  `
}

function resolveNodeBinary() {
  const candidates = [
    process.env.FELIXO_BENCHMARK_NODE,
    process.env.npm_node_execpath,
    process.platform === 'win32' ? 'node.exe' : 'node',
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && fs.existsSync(candidate)) return candidate
    if (!path.isAbsolute(candidate)) return candidate
  }

  return process.platform === 'win32' ? 'node.exe' : 'node'
}

function readProcessRssKiB(pid) {
  if (!pid) return Promise.resolve(null)

  const command = process.platform === 'win32' ? 'powershell.exe' : 'ps'
  const args = process.platform === 'win32'
    ? [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue).WorkingSet64`,
      ]
    : ['-o', 'rss=', '-p', String(Number(pid))]

  return new Promise((resolve) => {
    execFile(command, args, { encoding: 'utf8', windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve(null)
        return
      }
      const value = Number(String(stdout).trim())
      resolve(Number.isFinite(value) ? value / (process.platform === 'win32' ? 1024 : 1) : null)
    })
  })
}

async function sumProcessRssKiB(pids) {
  const values = (await Promise.all(pids.map((pid) => readProcessRssKiB(pid))))
    .filter((value) => Number.isFinite(value) && value > 0)
  return values.length ? values.reduce((total, value) => total + value, 0) : null
}

function isProcessAlive(pid) {
  try {
    process.kill(Number(pid), 0)
    return true
  } catch {
    return false
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function benchmarkNativePtys({ spawnPty, count, ...options }) {
  const activeCount = Math.max(1, Math.ceil(count / 2))
  const ptys = []
  const firstOutputMs = Array(count).fill(null)
  const bytesBySession = Array(count).fill(0)
  const linesBySession = Array(count).fill(0)
  const exitedBySession = Array(count).fill(false)
  const outputStartedAt = performance.now()

  for (let index = 0; index < count; index += 1) {
    const active = index < activeCount
    const childCode = buildEmitterCode({
      lines: options.nativeLinesPerTerminal,
      burst: active ? options.chunkLines : options.nativeLinesPerTerminal,
      intervalMs: active ? options.activeIntervalMs : 0,
      holdMs: options.nativeHoldMs,
      sessionIndex: index,
      lineWidth: options.lineWidth,
      longPromptChars: options.longPromptChars,
      longEvery: options.longEvery,
    })
    const pty = spawnPty(
      resolveNodeBinary(),
      ['-e', childCode],
      {
        name: 'xterm-256color',
        cols: 120,
        rows: 32,
        cwd: process.cwd(),
        env: { ...process.env, TERM: 'xterm-256color' },
      },
    )
    ptys.push(pty)

    pty.onData((data) => {
      const text = String(data)
      bytesBySession[index] += Buffer.byteLength(text)
      linesBySession[index] += text.split('\n').length - 1
      if (firstOutputMs[index] === null) {
        firstOutputMs[index] = performance.now() - outputStartedAt
      }
    })
    pty.onExit(() => {
      exitedBySession[index] = true
    })
  }

  const memorySamples = []
  const ptyPids = ptys.map((pty) => pty.pid).filter(Boolean)
  let sampling = false
  const sample = async () => {
    if (sampling) return
    sampling = true
    const ptyRssKiB = await sumProcessRssKiB(ptyPids)
    memorySamples.push({
      benchmarkProcessRssKiB: process.memoryUsage().rss / 1024,
      ptyRssKiB,
    })
    sampling = false
  }
  await sample()
  const timer = setInterval(() => {
    void sample()
  }, options.sampleIntervalMs)
  // The benchmark must not depend on node-pty's exit callback: on some
  // Electron/node-pty combinations the child has exited and its bytes are
  // drained, but the callback is delivered only after a later event-loop turn.
  // Received line count is the observable condition that matters here.
  const expectedOutputMs = Math.ceil(
    (options.nativeLinesPerTerminal / options.chunkLines) * options.activeIntervalMs * 2,
  ) + 1_000
  // Com muitos PTYs o custo de transportar bytes até o processo principal
  // aparece antes mesmo do xterm: a rampa de cinco sessões precisou de mais de
  // dez segundos para drenar a mesma carga que uma sessão consumia em menos de
  // um. A margem cresce com o número de PTYs para observar a degradação sem
  // declarar perda cedo demais; `timeoutMs` continua sendo o teto de segurança.
  const settleMs = Math.min(
    options.timeoutMs,
    Math.max(
      5_000,
      expectedOutputMs * Math.max(16, count * 4),
      options.nativeHoldMs + options.nativeDrainMs + 5_000,
    ),
  )
  const settleDeadline = Date.now() + settleMs
  let outputComplete = false
  let childrenGoneSince = null
  while (Date.now() < settleDeadline) {
    outputComplete = linesBySession.every(
      (lineCount) => lineCount >= options.nativeLinesPerTerminal,
    )
    if (outputComplete) break

    const childrenGone = exitedBySession.every(Boolean) || (
      ptyPids.length > 0 && ptyPids.every((pid) => !isProcessAlive(pid))
    )
    if (childrenGone) {
      childrenGoneSince ??= Date.now()
      // node-pty may deliver the final onData callbacks after the child is
      // already gone. Keep a short drain window so a fast burst is not
      // reported as a partial PTY merely because the benchmark stopped
      // observing one event-loop turn too early.
      if (Date.now() - childrenGoneSince >= options.nativeDrainMs) break
    } else {
      childrenGoneSince = null
    }
    await sleep(25)
  }
  outputComplete = linesBySession.every(
    (lineCount) => lineCount >= options.nativeLinesPerTerminal,
  )
  console.log(
    `[benchmark] native count=${count} output-complete=${outputComplete} lines=${linesBySession.join(',')}`,
  )
  if (outputComplete && options.nativeHoldMs > 0) {
    await sleep(Math.min(options.nativeHoldMs, 1_000))
  }
  clearInterval(timer)
  await sample()

  console.log(`[benchmark] native count=${count} cleaning ${ptys.length} PTY handles`)
  for (const pty of ptys) {
    try {
      pty.kill()
    } catch {
      // Já encerrou; não há processo do benchmark para limpar.
    }
  }
  console.log(`[benchmark] native count=${count} cleanup requested`)

  return {
    phase: 'native-pty',
    count,
    activeCount,
    idleCount: count - activeCount,
    linesPerTerminal: options.nativeLinesPerTerminal,
    outputBytes: bytesBySession.reduce((total, value) => total + value, 0),
    outputBytesBySession: bytesBySession,
    linesBySession,
    firstOutputMs: summarize(firstOutputMs),
    ptyRssMiB: summarize(
      memorySamples
        .map((sampleValue) => sampleValue.ptyRssKiB)
        .filter((value) => Number.isFinite(value))
        .map((value) => value / 1024),
    ),
    benchmarkProcessRssMiB: summarize(
      memorySamples.map((sampleValue) => sampleValue.benchmarkProcessRssKiB / 1024),
    ),
    memorySamples: memorySamples.length,
    timedOut: !outputComplete,
  }
}

function rendererProcessMetrics(app, window) {
  const pid = window.webContents.getOSProcessId?.() ?? window.webContents.getProcessId?.()
  const metrics = app.getAppMetrics?.() ?? []
  const renderer = metrics.find((metric) => metric.pid === pid)
  const workingSetKiB = renderer?.memory?.workingSetSize
  const totalWorkingSetKiB = metrics.reduce(
    (total, metric) => total + (Number(metric.memory?.workingSetSize) || 0),
    0,
  )
  return {
    pid,
    rendererWorkingSetKiB: Number.isFinite(workingSetKiB) ? workingSetKiB : null,
    appWorkingSetKiB: totalWorkingSetKiB || null,
  }
}

async function executeRenderer(window, method, payload) {
  const serialized = JSON.stringify(payload)
  return window.webContents.executeJavaScript(
    `(async () => window.felixoTerminalScrollbackBenchmark.${method}(${serialized}))()`,
    true,
  )
}

async function waitForRendererHarness(window, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const available = await window.webContents.executeJavaScript(
      'Boolean(window.felixoTerminalScrollbackBenchmark?.runScenario)',
      true,
    )
    if (available) return
    await sleep(50)
  }
  throw new Error('Timeout esperando a bancada xterm no renderer.')
}

function attachRendererDiagnostics(window) {
  window.webContents.on('did-finish-load', () => {
    console.log('[benchmark] renderer did-finish-load')
  })
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(
      `[benchmark] renderer did-fail-load code=${errorCode} description=${errorDescription} url=${validatedURL}`,
    )
  })
  window.webContents.on('console-message', (details) => {
    const { level, message, lineNumber, sourceId } = details ?? {}
    console.log(`[benchmark] renderer console level=${level} ${sourceId}:${lineNumber} ${message}`)
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[benchmark] renderer process gone reason=${details.reason} exitCode=${details.exitCode}`)
  })
}

async function benchmarkRendererScenario({ app, window, count, scrollback, policy, ...options }) {
  await executeRenderer(window, 'collectGarbage', {})
  const memorySamples = []
  const sample = () => memorySamples.push(rendererProcessMetrics(app, window))
  sample()
  const timer = setInterval(sample, options.sampleIntervalMs)
  let result
  try {
    result = await executeRenderer(window, 'runScenario', {
      count,
      scrollback,
      linesPerTerminal: options.linesPerTerminal,
      activeCount: Math.max(1, Math.ceil(count / 2)),
      chunkLines: options.chunkLines,
      lineWidth: options.lineWidth,
      longPromptChars: options.longPromptChars,
      longEvery: options.longEvery,
      activeIntervalMs: options.activeIntervalMs,
      cols: 120,
      rows: 32,
    })
  } finally {
    clearInterval(timer)
    sample()
  }

  return {
    phase: 'renderer-xterm',
    policy,
    ...result,
    rendererWorkingSetMiB: summarize(
      memorySamples
        .map((sampleValue) => sampleValue.rendererWorkingSetKiB)
        .filter((value) => Number.isFinite(value))
        .map((value) => value / 1024),
    ),
    appWorkingSetMiB: summarize(
      memorySamples
        .map((sampleValue) => sampleValue.appWorkingSetKiB)
        .filter((value) => Number.isFinite(value))
        .map((value) => value / 1024),
    ),
    memorySamples: memorySamples.length,
  }
}

function printHelp() {
  console.log(`Bancada de scrollback do terminal

Opções:
  --counts=1,5,10,20       quantidades de sessões (máx. ${MAX_COUNT})
  --scrollbacks=5000,20000 limites visuais comparados (máx. ${MAX_SCROLLBACK})
  --policies=current,adaptive políticas medidas (default: ambas)
  --adaptive-scrollback=5000 limite da política adaptativa em 10+ sessões
  --adaptive-threshold=10  quantidade que ativa o limite compacto
  --lines=8000             linhas por sessão (máx. ${MAX_LINES_PER_TERMINAL})
  --native-lines=2000     linhas por PTY nativo (máx. ${MAX_NATIVE_LINES_PER_TERMINAL})
  --native-drain-ms=2000  janela para drenar dados após o processo sair
  --out=arquivo.json       salva o envelope JSON nesse caminho
  --check                  falha se houver perda, resume vazio ou regressão
  --help                   mostra esta ajuda

Em Linux, execute com xvfb: xvfb-run -a npm run benchmark:terminal
`)
}

async function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  console.log('[benchmark] starting')
  if (options.help) {
    printHelp()
    return null
  }

  // O require só acontece dentro da execução Electron: o mesmo arquivo pode
  // ser importado pelos testes Node para validar os limites e percentis.
  const { app, BrowserWindow } = require('electron')
  const { spawn: spawnPty } = require('node-pty')

  app.commandLine.appendSwitch('enable-precise-memory-info')
  app.commandLine.appendSwitch('disable-background-timer-throttling')
  console.log('[benchmark] waiting for Electron')
  await app.whenReady()
  console.log('[benchmark] Electron ready')

  const harnessPath = path.join(__dirname, '..', 'benchmarks', 'terminal-scrollback-harness.html')
  const window = new BrowserWindow({
    // Uma janela realmente oculta sofre throttling de requestAnimationFrame
    // mesmo com backgroundThrottling desligado em algumas versões do Chromium.
    // Ela fica mapeada fora da área visível para que frame time/long task sejam
    // medidos de verdade sem tomar a frente da sessão de trabalho da pessoa.
    show: true,
    x: -10000,
    y: -10000,
    focusable: false,
    width: 1600,
    height: 1000,
    backgroundColor: '#0b0f14',
    webPreferences: {
      backgroundThrottling: false,
      sandbox: false,
    },
  })
  window.webContents.setBackgroundThrottling(false)
  attachRendererDiagnostics(window)

  const results = []
  const startedAt = new Date().toISOString()
  const benchmarkStartedAt = performance.now()

  try {
    console.log(`[benchmark] loading ${harnessPath}`)
    await Promise.race([
      window.loadFile(harnessPath),
      sleep(15_000).then(() => {
        throw new Error(`Timeout carregando o harness: ${harnessPath}`)
      }),
    ])
    console.log('[benchmark] harness loaded')
    await waitForRendererHarness(window, options.timeoutMs)

    for (const count of options.counts) {
      console.log(`[benchmark] native PTY count=${count}`)
      results.push(
        await benchmarkNativePtys({
          spawnPty,
          count,
          ...options,
        }),
      )
    }

    if (options.policies.includes('current')) {
      for (const scrollback of options.scrollbacks) {
        for (const count of options.counts) {
          console.log(`[benchmark] renderer xterm policy=current count=${count} scrollback=${scrollback}`)
          results.push(
            await benchmarkRendererScenario({
              app,
              window,
              count,
              scrollback,
              policy: 'current',
              ...options,
            }),
          )
        }
      }
    }

    if (options.policies.includes('adaptive')) {
      for (const count of options.counts) {
        const scrollback = count >= options.adaptiveThreshold
          ? options.adaptiveScrollback
          : CURRENT_SCROLLBACK
        console.log(`[benchmark] renderer xterm policy=adaptive count=${count} scrollback=${scrollback}`)
        results.push(
          await benchmarkRendererScenario({
            app,
            window,
            count,
            scrollback,
            policy: 'adaptive',
            ...options,
          }),
        )
      }
    }
  } finally {
    if (!window.isDestroyed()) window.destroy()
    if (app.isReady()) app.quit()
  }

  const report = {
    schemaVersion: 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: performance.now() - benchmarkStartedAt,
    host: {
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      cpuCount: os.cpus().length,
      totalMemoryMiB: Math.round(os.totalmem() / 1024 / 1024),
      node: process.version,
      electron: process.versions.electron,
      xterm: '6.0.0',
    },
    scenario: {
      counts: options.counts,
      scrollbacks: options.scrollbacks,
      policies: options.policies,
      adaptiveScrollback: options.adaptiveScrollback,
      adaptiveThreshold: options.adaptiveThreshold,
      linesPerTerminal: options.linesPerTerminal,
      nativeLinesPerTerminal: options.nativeLinesPerTerminal,
      activeIntervalMs: options.activeIntervalMs,
      chunkLines: options.chunkLines,
      lineWidth: options.lineWidth,
      longPromptChars: options.longPromptChars,
      longEvery: options.longEvery,
      nativeHoldMs: options.nativeHoldMs,
      nativeDrainMs: options.nativeDrainMs,
      sampleIntervalMs: options.sampleIntervalMs,
      timeoutMs: options.timeoutMs,
    },
    results,
  }

  const encoded = JSON.stringify(report, null, 2)
  if (options.outputPath) {
    fs.mkdirSync(path.dirname(options.outputPath), { recursive: true })
    fs.writeFileSync(options.outputPath, `${encoded}\n`, 'utf8')
  }
  console.log('TERMINAL_SCROLLBACK_BENCHMARK_JSON_BEGIN')
  console.log(encoded)
  console.log('TERMINAL_SCROLLBACK_BENCHMARK_JSON_END')
  if (options.check) {
    const failures = validateReport(report)
    if (failures.length) {
      throw new Error(`Regressão na bancada:\n- ${failures.join('\n- ')}`)
    }
  }
  return report
}

function commandLineArguments() {
  const scriptIndex = process.argv.findIndex(
    (argument) => argument === __filename || path.resolve(argument) === __filename,
  )
  return process.argv.slice(scriptIndex >= 0 ? scriptIndex + 1 : 2)
}

function runAndReportErrors() {
  run(commandLineArguments()).catch((error) => {
    console.error(`[benchmark] ${error instanceof Error ? error.stack || error.message : String(error)}`)
    process.exitCode = 1
  })
}

// Electron loads an app entry through its browser process and does not always
// set `require.main` to that entry. The explicit process.type guard keeps the
// script runnable both as an Electron benchmark and as a Node-test module.
if (process.versions.electron && process.type === 'browser') {
  runAndReportErrors()
} else if (require.main === module) {
  runAndReportErrors()
}

module.exports = {
  DEFAULT_COUNTS,
  DEFAULT_POLICIES,
  DEFAULT_SCROLLBACKS,
  DEFAULT_ADAPTIVE_SCROLLBACK,
  DEFAULT_ADAPTIVE_THRESHOLD,
  CURRENT_SCROLLBACK,
  MAX_COUNT,
  MAX_LINES_PER_TERMINAL,
  MAX_NATIVE_LINES_PER_TERMINAL,
  MAX_SCROLLBACK,
  buildEmitterCode,
  parseArgs,
  parsePolicies,
  percentile,
  summarize,
  heapStreamDeltaBytes,
  validateReport,
}
