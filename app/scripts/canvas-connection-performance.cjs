'use strict'

/**
 * Executa a bancada do índice no renderer real do Electron.
 *
 * O HTML carregado é o build do app com `?benchmark=canvas-connections`. O
 * modo de benchmark troca somente a entrada do renderer por uma superfície
 * ReactFlow com fixture controlado; nenhum canvas persistido ou terminal real
 * é alterado.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { performance } = require('node:perf_hooks')

const DEFAULT_SIZES = [100, 500, 1000]
const DEFAULT_SCENARIOS = [
  'render-inicial',
  'drag',
  'resize',
  'criacao-remocao-aresta',
  'mudanca-de-dados',
]
const DEFAULT_MODES = ['baseline', 'indexado']
const DEFAULT_ITERATIONS = 5
const DEFAULT_TIMEOUT_MS = 120000
const MAX_ITERATIONS = 20
const MAX_TIMEOUT_MS = 600000

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

function parseSizes(value) {
  const values = String(value)
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item))
  if (values.length === 0 || values.some((item) => !DEFAULT_SIZES.includes(item))) {
    throw new Error('sizes precisa usar somente 100,500,1000.')
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
    sizes: [...DEFAULT_SIZES],
    scenarios: [...DEFAULT_SCENARIOS],
    modes: [...DEFAULT_MODES],
    iterations: DEFAULT_ITERATIONS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    outputPath: null,
    check: false,
    help: false,
  }

  for (const argument of argv) {
    if (argument === '--help') {
      options.help = true
      continue
    }
    if (argument === '--check') {
      options.check = true
      continue
    }
    if (argument.startsWith('--sizes=')) {
      options.sizes = parseSizes(argument.slice('--sizes='.length))
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
        1000,
        MAX_TIMEOUT_MS,
        'timeout-ms',
      )
      continue
    }
    if (argument.startsWith('--out=')) {
      const outputPath = argument.slice('--out='.length).trim()
      if (!outputPath) throw new Error('out precisa apontar para um arquivo.')
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

function formatMilliseconds(value) {
  return value === null || value === undefined ? '—' : `${Number(value).toFixed(2)} ms`
}

function formatMiB(value) {
  return value === null || value === undefined
    ? '—'
    : `${(Number(value) / 1024 / 1024).toFixed(2)} MiB`
}

function formatReport(report) {
  const lines = [
    'Canvas — React Profiler e heap do índice',
    `Renderer: ${report.renderer?.userAgent ?? 'desconhecido'}`,
    `Viewport: ${report.renderer?.viewport?.width ?? '?'}×${report.renderer?.viewport?.height ?? '?'}`,
    `Repetições: ${report.method?.iterations ?? '?'}`,
    '',
    'nós | cenário | baseline p50/p95 | índice p50/p95 | ganho p95 | heap Δ baseline→índice p95',
  ]

  for (const comparison of report.comparisons ?? []) {
    lines.push(
      [
        comparison.size,
        comparison.scenario,
        `${formatMilliseconds(comparison.baselineProfilerP95Ms === null ? null : findP50(report, comparison, 'baseline'))}/${formatMilliseconds(comparison.baselineProfilerP95Ms)}`,
        `${formatMilliseconds(findP50(report, comparison, 'indexado'))}/${formatMilliseconds(comparison.indexedProfilerP95Ms)}`,
        comparison.profilerP95ImprovementPercent === null
          ? '—'
          : `${comparison.profilerP95ImprovementPercent.toFixed(2)}%`,
        `${formatMiB(comparison.baselineHeapDeltaP95Bytes)} → ${formatMiB(comparison.indexedHeapDeltaP95Bytes)}`,
      ].join(' | '),
    )
  }

  return lines.join('\n')
}

function findP50(report, comparison, mode) {
  return (
    report.results?.find(
      (result) =>
        result.size === comparison.size &&
        result.scenario === comparison.scenario &&
        result.mode === mode,
    )?.profiler?.p50 ?? null
  )
}

function validateReport(report, options) {
  const failures = []
  const expectedResults = options.sizes.length * options.scenarios.length * options.modes.length
  if (report.schemaVersion !== 1) failures.push('schemaVersion inesperado')
  if ((report.results ?? []).length !== expectedResults) {
    failures.push(`resultados incompletos: esperado=${expectedResults}`)
  }

  for (const result of report.results ?? []) {
    if (result.repetitions !== options.iterations) {
      failures.push(
        `${result.mode}/${result.size}/${result.scenario}: repetições incompletas`,
      )
    }
    if (result.profiler?.count !== options.iterations) {
      failures.push(`${result.mode}/${result.size}/${result.scenario}: Profiler incompleto`)
    }
    if (!result.heap?.supported) {
      failures.push(`${result.mode}/${result.size}/${result.scenario}: heap indisponível`)
    }
    if (!result.heap?.gcAvailable) {
      failures.push(`${result.mode}/${result.size}/${result.scenario}: GC indisponível`)
    }
    if (result.samples?.some((sample) => sample.domNodeCount <= 0)) {
      failures.push(`${result.mode}/${result.size}/${result.scenario}: Canvas sem nós no DOM`)
    }
  }

  return failures
}

function rendererProcessMetrics(app, browserWindow) {
  const pid = browserWindow.webContents.getOSProcessId?.() ?? browserWindow.webContents.getProcessId?.()
  const metrics = app.getAppMetrics?.() ?? []
  const renderer = metrics.find((metric) => metric.pid === pid)
  return {
    pid,
    rendererWorkingSetKiB: Number.isFinite(renderer?.memory?.workingSetSize)
      ? renderer.memory.workingSetSize
      : null,
  }
}

async function executeRenderer(browserWindow, method, payload) {
  const serialized = JSON.stringify(payload)
  return browserWindow.webContents.executeJavaScript(
    `(async () => window.felixoCanvasConnectionBenchmark.${method}(${serialized}))()`,
    true,
  )
}

async function waitForHarness(browserWindow, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const available = await browserWindow.webContents.executeJavaScript(
      'Boolean(window.felixoCanvasConnectionBenchmark?.run)',
      true,
    )
    if (available) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('timeout esperando a bancada de conexões no renderer')
}

function attachDiagnostics(browserWindow) {
  browserWindow.webContents.on('did-finish-load', () => {
    console.log('[canvas-benchmark] renderer did-finish-load')
  })
  browserWindow.webContents.on('did-fail-load', (_event, errorCode, description, validatedURL) => {
    console.error(
      `[canvas-benchmark] did-fail-load code=${errorCode} description=${description} url=${validatedURL}`,
    )
  })
  browserWindow.webContents.on('console-message', (details) => {
    const { level, message, lineNumber, sourceId } = details ?? {}
    console.log(`[canvas-benchmark] console level=${level} ${sourceId}:${lineNumber} ${message}`)
  })
  browserWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(
      `[canvas-benchmark] render-process-gone reason=${details.reason} exitCode=${details.exitCode}`,
    )
  })
}

function printHelp() {
  console.log(`Bancada do índice de conexões no renderer React real

Opções:
  --sizes=100,500,1000             tamanhos do fixture
  --scenarios=render-inicial,drag  cenários a medir
  --modes=baseline,indexado        modos comparados
  --iterations=5                   repetições por combinação (2–${MAX_ITERATIONS})
  --timeout-ms=120000              timeout de cada commit (máx. ${MAX_TIMEOUT_MS})
  --out=arquivo.json               salva o relatório JSON
  --check                          falha se Profiler, heap, GC ou DOM estiverem incompletos
  --help                           mostra esta ajuda

O comando sobe um Vite de desenvolvimento para manter o Profiler habilitado. No Linux, use xvfb:
  xvfb-run -a npm run benchmark:canvas-connections -- --check
`)
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

  console.log('[canvas-benchmark] aguardando Electron')
  await app.whenReady()
  const startedAt = new Date().toISOString()
  const benchmarkStartedAt = performance.now()
  const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
  const devServerURL = process.env.VITE_DEV_SERVER_URL
  if (!devServerURL && !fs.existsSync(indexPath)) {
    throw new Error(`build ausente: ${indexPath}. Rode npm run build primeiro.`)
  }

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
  attachDiagnostics(browserWindow)

  try {
    if (devServerURL) {
      const benchmarkURL = new URL(devServerURL)
      benchmarkURL.searchParams.set('benchmark', 'canvas-connections')
      console.log(`[canvas-benchmark] carregando ${benchmarkURL}`)
      await browserWindow.loadURL(benchmarkURL.toString())
    } else {
      console.log(`[canvas-benchmark] carregando ${indexPath}`)
      await browserWindow.loadFile(indexPath, {
        query: { benchmark: 'canvas-connections' },
      })
    }
    await waitForHarness(browserWindow, options.timeoutMs)
    console.log('[canvas-benchmark] harness pronto')
    const report = await executeRenderer(browserWindow, 'run', options)
    const host = {
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      cpuCount: os.cpus().length,
      totalMemoryMiB: Math.round(os.totalmem() / 1024 / 1024),
      node: process.version,
      electron: process.versions.electron,
      rendererProcess: rendererProcessMetrics(app, browserWindow),
    }
    const completeReport = {
      ...report,
      host,
      runner: {
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Number((performance.now() - benchmarkStartedAt).toFixed(3)),
      },
    }

    console.log(formatReport(completeReport))
    const encoded = JSON.stringify(completeReport, null, 2)
    if (options.outputPath) {
      fs.mkdirSync(path.dirname(options.outputPath), { recursive: true })
      fs.writeFileSync(options.outputPath, `${encoded}\n`, 'utf8')
      console.log(`[canvas-benchmark] relatório salvo em ${options.outputPath}`)
    }
    console.log('CANVAS_CONNECTION_PERFORMANCE_JSON_BEGIN')
    console.log(encoded)
    console.log('CANVAS_CONNECTION_PERFORMANCE_JSON_END')

    if (options.check) {
      const failures = validateReport(completeReport, options)
      if (failures.length > 0) {
        throw new Error(`Falha na bancada:\n- ${failures.join('\n- ')}`)
      }
    }
    return completeReport
  } finally {
    if (!browserWindow.isDestroyed()) browserWindow.destroy()
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
      `[canvas-benchmark] ${error instanceof Error ? error.stack || error.message : String(error)}`,
    )
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
      '[canvas-benchmark] A porta 5173 estÃ¡ ocupada por outro processo; o benchmark nÃ£o vai encerrÃ¡-lo automaticamente.',
    )
  }
  if (initialVite.status === 'felixo') {
    const cleanup = await stopFelixoVite({ probe: probeFelixoVite })
    if (!cleanup.stopped) {
      throw new Error('[canvas-benchmark] NÃ£o foi possÃ­vel liberar o Vite anterior do Felixo.')
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
  runWithDevelopmentServer().then((code) => {
    process.exitCode = code
  }).catch((error) => {
    console.error(
      `[canvas-benchmark] ${error instanceof Error ? error.stack || error.message : String(error)}`,
    )
    process.exitCode = 1
  })
}

module.exports = {
  DEFAULT_ITERATIONS,
  DEFAULT_MODES,
  DEFAULT_SCENARIOS,
  DEFAULT_SIZES,
  MAX_ITERATIONS,
  MAX_TIMEOUT_MS,
  formatReport,
  parseArgs,
  percentile,
  validateReport,
}
