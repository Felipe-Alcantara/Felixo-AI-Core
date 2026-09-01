#!/usr/bin/env node
'use strict'

/**
 * Mede o painel legado de logs da CLI no renderer Electron real.
 *
 * A bancada compara a retenção original (sem limite) com a política atual,
 * usando exatamente os mesmos fixtures e a mesma cadência de atualização. O
 * fluxo de produção também agrupa eventos por frame em `useTerminalOutput`;
 * manter uma atualização por evento aqui isola o ganho de retenção/render e
 * evita atribuir ao batching uma diferença de carga.
 *
 * Uso em Linux: `xvfb-run -a npm run benchmark:terminal-output -- --check`.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

const DEFAULT_SCENARIOS = [
  'curta',
  'longa',
  'alta-frequencia',
  'multiplas-sessoes',
]
const DEFAULT_MODES = ['baseline', 'atual']
const DEFAULT_ITERATIONS = 3
const DEFAULT_TIMEOUT_MS = 120_000
const MAX_ITERATIONS = 10
const MAX_TIMEOUT_MS = 600_000
const MAX_ORCHESTRATOR_CHUNKS = 720

function parseList(value, allowed, label) {
  const values = String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  if (values.length === 0 || values.some((item) => !allowed.includes(item))) {
    throw new Error(`${label} contém um valor desconhecido.`)
  }

  return [...new Set(values)]
}

function parseBoundedInteger(value, minimum, maximum, label) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} deve estar entre ${minimum} e ${maximum}.`)
  }
  return parsed
}

function parseArgs(argv = []) {
  const options = {
    scenarios: [...DEFAULT_SCENARIOS],
    modes: [...DEFAULT_MODES],
    iterations: DEFAULT_ITERATIONS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    outputPath: null,
    check: false,
    help: false,
  }

  for (const argument of argv) {
    if (argument === '--check') {
      options.check = true
      continue
    }
    if (argument === '--help') {
      options.help = true
      continue
    }
    if (argument.startsWith('--scenarios=')) {
      options.scenarios = parseList(
        argument.slice('--scenarios='.length),
        DEFAULT_SCENARIOS,
        'scenarios',
      )
      continue
    }
    if (argument.startsWith('--modes=')) {
      options.modes = parseList(
        argument.slice('--modes='.length),
        DEFAULT_MODES,
        'modes',
      )
      continue
    }
    if (argument.startsWith('--iterations=')) {
      options.iterations = parseBoundedInteger(
        argument.slice('--iterations='.length),
        2,
        MAX_ITERATIONS,
        'iterations',
      )
      continue
    }
    if (argument.startsWith('--timeout-ms=')) {
      options.timeoutMs = parseBoundedInteger(
        argument.slice('--timeout-ms='.length),
        1_000,
        MAX_TIMEOUT_MS,
        'timeout-ms',
      )
      continue
    }
    if (argument.startsWith('--out=')) {
      const outputPath = argument.slice('--out='.length).trim()
      if (!outputPath) throw new Error('--out precisa apontar para um arquivo.')
      options.outputPath = path.resolve(outputPath)
      continue
    }
    throw new Error(`Argumento desconhecido: ${argument}`)
  }

  return options
}

function percentile(values, percentage) {
  const clean = values.filter(Number.isFinite).sort((left, right) => left - right)
  if (clean.length === 0) return null

  const index = (clean.length - 1) * percentage
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const value =
    lower === upper
      ? clean[lower]
      : clean[lower] + (clean[upper] - clean[lower]) * (index - lower)
  return Number(value.toFixed(3))
}

function summarize(values) {
  const clean = values.filter(Number.isFinite)
  return {
    count: clean.length,
    p50: percentile(clean, 0.5),
    p95: percentile(clean, 0.95),
    max: clean.length > 0 ? Number(Math.max(...clean).toFixed(3)) : null,
  }
}

function formatMilliseconds(value) {
  return value === null || value === undefined
    ? '—'
    : `${Number(value).toFixed(2)} ms`
}

function formatMiB(value) {
  return value === null || value === undefined
    ? '—'
    : `${(Number(value) / 1024 / 1024).toFixed(2)} MiB`
}

function createComparisons(results) {
  const scenarios = [...new Set(results.map((result) => result.scenario))]

  return scenarios.map((scenario) => {
    const baseline = results.find(
      (result) => result.scenario === scenario && result.mode === 'baseline',
    )
    const current = results.find(
      (result) => result.scenario === scenario && result.mode === 'atual',
    )
    const baselineP95 = baseline?.profiler.p95 ?? null
    const currentP95 = current?.profiler.p95 ?? null

    return {
      scenario,
      baselineProfilerP95Ms: baselineP95,
      currentProfilerP95Ms: currentP95,
      profilerP95ImprovementPercent:
        baselineP95 !== null && baselineP95 > 0 && currentP95 !== null
          ? Number((((baselineP95 - currentP95) / baselineP95) * 100).toFixed(2))
          : null,
      baselineUpdateLatencyP95Ms: baseline?.updateLatency.p95 ?? null,
      currentUpdateLatencyP95Ms: current?.updateLatency.p95 ?? null,
      baselineHeapDeltaP95Bytes: baseline?.heap.deltaBytes.p95 ?? null,
      currentHeapDeltaP95Bytes: current?.heap.deltaBytes.p95 ?? null,
      baselineMaxDomNodes: baseline?.maxDomNodes.max ?? null,
      currentMaxDomNodes: current?.maxDomNodes.max ?? null,
    }
  })
}

function formatReport(report) {
  const lines = [
    'Logs da CLI — React Profiler, DOM e heap',
    `Renderer: ${report.renderer?.userAgent ?? 'desconhecido'}`,
    `Viewport: ${report.renderer?.viewport?.width ?? '?'}×${report.renderer?.viewport?.height ?? '?'}`,
    `Repetições: ${report.method?.iterations ?? '?'}`,
    '',
    'cenário | baseline p50/p95 | atual p50/p95 | DOM máx baseline→atual | heap Δ p95 baseline→atual | RSS baseline→atual',
  ]

  for (const comparison of report.comparisons ?? []) {
    const baseline = report.results.find(
      (result) =>
        result.scenario === comparison.scenario && result.mode === 'baseline',
    )
    const current = report.results.find(
      (result) =>
        result.scenario === comparison.scenario && result.mode === 'atual',
    )
    lines.push(
      [
        comparison.scenario,
        `${formatMilliseconds(comparison.baselineProfilerP95Ms === null ? null : baseline?.profiler.p50)}/${formatMilliseconds(comparison.baselineProfilerP95Ms)}`,
        `${formatMilliseconds(current?.profiler.p50)}/${formatMilliseconds(comparison.currentProfilerP95Ms)}`,
        `${comparison.baselineMaxDomNodes ?? '—'}→${comparison.currentMaxDomNodes ?? '—'}`,
        `${formatMiB(comparison.baselineHeapDeltaP95Bytes)}→${formatMiB(comparison.currentHeapDeltaP95Bytes)}`,
        `${formatMiB(baseline?.rendererWorkingSetKiB == null ? null : baseline.rendererWorkingSetKiB * 1024)}→${formatMiB(current?.rendererWorkingSetKiB == null ? null : current.rendererWorkingSetKiB * 1024)}`,
      ].join(' | '),
    )
  }

  return lines.join('\n')
}

function validateReport(report, options) {
  const failures = []
  const expectedResults = options.scenarios.length * options.modes.length

  if (report.schemaVersion !== 1) failures.push('schemaVersion inesperado')
  if ((report.results ?? []).length !== expectedResults) {
    failures.push(`resultados incompletos: esperado=${expectedResults}`)
  }

  for (const result of report.results ?? []) {
    const label = `${result.mode}/${result.scenario}`
    if (result.iterations !== options.iterations) {
      failures.push(`${label}: repetições incompletas`)
    }
    if (result.profiler?.count <= 0 || result.updateLatency?.count <= 0) {
      failures.push(`${label}: commits do Profiler ausentes`)
    }
    if (!result.heap?.supported) failures.push(`${label}: heap indisponível`)
    if (!result.heap?.gcAvailable) failures.push(`${label}: GC indisponível`)
    if (!Number.isFinite(result.rendererWorkingSetKiB)) {
      failures.push(`${label}: RSS do renderer indisponível`)
    }
    if (result.samples?.some((sample) => sample.inputEvents <= 0)) {
      failures.push(`${label}: fixture sem eventos`)
    }
    if (result.mode === 'baseline' && result.droppedChunks?.max !== 0) {
      failures.push(`${label}: baseline descartou chunks`)
    }
    if (
      result.mode === 'atual' &&
      result.maxDomNodes?.max > MAX_ORCHESTRATOR_CHUNKS
    ) {
      failures.push(`${label}: DOM acima da janela global`)
    }
  }

  return failures
}

function rendererProcessMetrics(app, browserWindow) {
  const pid =
    browserWindow.webContents.getOSProcessId?.() ??
    browserWindow.webContents.getProcessId?.()
  const metrics = app.getAppMetrics?.() ?? []
  const renderer = metrics.find((metric) => metric.pid === pid)

  return {
    pid,
    workingSetKiB: Number.isFinite(renderer?.memory?.workingSetSize)
      ? renderer.memory.workingSetSize
      : null,
  }
}

async function executeRenderer(browserWindow, method, payload) {
  const serialized = JSON.stringify(payload)
  return browserWindow.webContents.executeJavaScript(
    `(async () => window.felixoTerminalOutputBenchmark.${method}(${serialized}))()`,
    true,
  )
}

async function waitForHarness(browserWindow, timeoutMs) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const available = await browserWindow.webContents.executeJavaScript(
      'Boolean(window.felixoTerminalOutputBenchmark?.run)',
      true,
    )
    if (available) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  throw new Error('timeout esperando a bancada de logs da CLI no renderer')
}

function attachDiagnostics(browserWindow) {
  browserWindow.webContents.on('did-finish-load', () => {
    console.log('[terminal-output-benchmark] renderer did-finish-load')
  })
  browserWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, description, validatedURL) => {
      console.error(
        `[terminal-output-benchmark] did-fail-load code=${errorCode} description=${description} url=${validatedURL}`,
      )
    },
  )
  browserWindow.webContents.on('console-message', (details) => {
    const { level, message, lineNumber, sourceId } = details ?? {}
    console.log(
      `[terminal-output-benchmark] console level=${level} ${sourceId}:${lineNumber} ${message}`,
    )
  })
  browserWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(
      `[terminal-output-benchmark] render-process-gone reason=${details.reason} exitCode=${details.exitCode}`,
    )
  })
}

function printHelp() {
  console.log(`Bancada dos logs da CLI no renderer React real

Opções:
  --scenarios=curta,longa,alta-frequencia,multiplas-sessoes
  --modes=baseline,atual
  --iterations=3                   repetições por combinação (2–${MAX_ITERATIONS})
  --timeout-ms=120000              timeout de cada commit (máx. ${MAX_TIMEOUT_MS})
  --out=arquivo.json               salva o relatório JSON
  --check                          falha se Profiler, heap, GC, DOM ou RSS estiverem incompletos
  --help                           mostra esta ajuda

Em Linux, use xvfb:
  xvfb-run -a npm run benchmark:terminal-output -- --check
`)
}

function createBenchmarkWindow(BrowserWindow) {
  const browserWindow = new BrowserWindow({
    show: true,
    x: -10000,
    y: -10000,
    focusable: false,
    width: 1600,
    height: 1000,
    backgroundColor: '#09090b',
    webPreferences: {
      backgroundThrottling: false,
      sandbox: false,
    },
  })
  browserWindow.webContents.setBackgroundThrottling(false)
  return browserWindow
}

async function loadBenchmarkWindow(browserWindow, indexPath, devServerURL) {
  attachDiagnostics(browserWindow)

  if (devServerURL) {
    const benchmarkURL = new URL(devServerURL)
    benchmarkURL.searchParams.set('benchmark', 'terminal-output')
    console.log(`[terminal-output-benchmark] carregando ${benchmarkURL}`)
    await browserWindow.loadURL(benchmarkURL.toString())
  } else {
    console.log(`[terminal-output-benchmark] carregando ${indexPath}`)
    await browserWindow.loadFile(indexPath, {
      query: { benchmark: 'terminal-output' },
    })
  }
}

async function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (options.help) {
    printHelp()
    return null
  }

  const { app, BrowserWindow } = require('electron')
  app.commandLine.appendSwitch('enable-precise-memory-info')
  app.commandLine.appendSwitch('js-flags', '--expose-gc')
  app.commandLine.appendSwitch('disable-background-timer-throttling')

  console.log('[terminal-output-benchmark] aguardando Electron')
  await app.whenReady()
  const keepAppAlive = (event) => event.preventDefault()
  app.on('window-all-closed', keepAppAlive)
  const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
  const devServerURL = process.env.VITE_DEV_SERVER_URL
  const benchmarkWindows = new Set()

  try {
    if (!devServerURL && !fs.existsSync(indexPath)) {
      throw new Error(`build ausente: ${indexPath}. Rode npm run build primeiro.`)
    }

    const startedAt = new Date().toISOString()
    const started = Date.now()
    const results = []
    let renderer = null
    let firstReport = null

    for (const mode of options.modes) {
      const browserWindow = createBenchmarkWindow(BrowserWindow)
      benchmarkWindows.add(browserWindow)
      await loadBenchmarkWindow(browserWindow, indexPath, devServerURL)
      await waitForHarness(browserWindow, options.timeoutMs)
      console.log(`[terminal-output-benchmark] harness pronto · modo=${mode}`)
      const modeReport = await executeRenderer(browserWindow, 'run', {
        ...options,
        modes: [mode],
      })
      firstReport ??= modeReport
      await new Promise((resolve) => setTimeout(resolve, 50))
      renderer = rendererProcessMetrics(app, browserWindow)
      results.push(
        ...modeReport.results.map((result) => ({
          ...result,
          rendererWorkingSetKiB: renderer.workingSetKiB,
        })),
      )
      browserWindow.destroy()
      benchmarkWindows.delete(browserWindow)
    }

    const report = {
      ...firstReport,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      method: {
        ...firstReport.method,
        modes: options.modes,
        scenarios: options.scenarios,
        modeIsolation: 'nova janela Electron por modo',
      },
      results,
      comparisons: createComparisons(results),
      host: {
        platform: process.platform,
        arch: process.arch,
        osRelease: os.release(),
        cpuCount: os.cpus().length,
        totalMemoryMiB: Math.round(os.totalmem() / 1024 / 1024),
        node: process.version,
        electron: process.versions.electron,
        rendererProcess: renderer,
      },
      runner: {
        startedAt,
        finishedAt: new Date().toISOString(),
      },
    }

    console.log(formatReport(report))
    const encoded = JSON.stringify(report, null, 2)
    if (options.outputPath) {
      fs.mkdirSync(path.dirname(options.outputPath), { recursive: true })
      fs.writeFileSync(options.outputPath, `${encoded}\n`, 'utf8')
      console.log(`[terminal-output-benchmark] relatório salvo em ${options.outputPath}`)
    }
    console.log('TERMINAL_OUTPUT_PERFORMANCE_JSON_BEGIN')
    console.log(encoded)
    console.log('TERMINAL_OUTPUT_PERFORMANCE_JSON_END')

    if (options.check) {
      const failures = validateReport(report, options)
      if (failures.length > 0) {
        throw new Error(`Falha na bancada:\n- ${failures.join('\n- ')}`)
      }
    }
    return report
  } finally {
    for (const browserWindow of benchmarkWindows) {
      if (!browserWindow.isDestroyed()) browserWindow.destroy()
    }
    app.removeListener('window-all-closed', keepAppAlive)
    if (app.isReady()) app.quit()
  }
}

function commandLineArguments() {
  const scriptIndex = process.argv.findIndex(
    (argument) => argument === __filename || path.resolve(argument) === __filename,
  )
  return process.argv.slice(scriptIndex >= 0 ? scriptIndex + 1 : 2)
}

function runAndReportErrors() {
  run(commandLineArguments()).catch((error) => {
    console.error(
      `[terminal-output-benchmark] ${error instanceof Error ? error.stack || error.message : String(error)}`,
    )
    const { app } = require('electron')
    if (app.isReady()) {
      app.exit(1)
      return
    }
    process.exitCode = 1
  })
}

function waitForChild(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => {
      resolve({ code: typeof code === 'number' ? code : 1, signal })
    })
  })
}

async function runWithDevelopmentServer(argv = commandLineArguments()) {
  const options = parseArgs(argv)
  if (options.help) {
    printHelp()
    return 0
  }

  const {
    probeFelixoVite,
    spawnVite,
    stopFelixoVite,
    waitForFelixoVite,
  } = require('./dev-runner.cjs')
  const electronPath = require('electron')
  const initialVite = await probeFelixoVite()
  if (initialVite.status === 'foreign') {
    throw new Error(
      '[terminal-output-benchmark] A porta 5173 está ocupada por outro processo; o benchmark não vai encerrá-lo automaticamente.',
    )
  }
  if (initialVite.status === 'felixo') {
    const cleanup = await stopFelixoVite({ probe: probeFelixoVite })
    if (!cleanup.stopped) {
      throw new Error('[terminal-output-benchmark] não foi possível liberar o Vite anterior do Felixo.')
    }
  }

  const viteChild = spawnVite({ env: process.env })
  let electronChild = null

  try {
    await waitForFelixoVite()
    electronChild = spawn(electronPath, [__filename, ...argv], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173',
      },
      stdio: 'inherit',
      windowsHide: false,
    })
    const result = await waitForChild(electronChild)
    return result.code
  } finally {
    if (electronChild && electronChild.exitCode === null && !electronChild.signalCode) {
      electronChild.kill('SIGTERM')
    }
    await stopFelixoVite()
    if (viteChild.exitCode === null && !viteChild.signalCode) {
      try {
        viteChild.kill('SIGTERM')
      } catch {
        // O Vite pode ter encerrado junto com uma falha do runner.
      }
    }
  }
}

if (process.versions.electron && process.type === 'browser') {
  runAndReportErrors()
} else if (require.main === module) {
  runWithDevelopmentServer()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      console.error(
        `[terminal-output-benchmark] ${error instanceof Error ? error.stack || error.message : String(error)}`,
      )
      process.exitCode = 1
    })
}

module.exports = {
  DEFAULT_MODES,
  DEFAULT_SCENARIOS,
  formatReport,
  parseArgs,
  percentile,
  summarize,
  validateReport,
}
