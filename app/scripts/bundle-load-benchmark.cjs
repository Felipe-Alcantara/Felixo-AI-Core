#!/usr/bin/env node
'use strict'

/**
 * Mede o carregamento do renderer empacotado e a primeira ferramenta do canvas.
 *
 * A bancada abre cada amostra em uma janela Electron nova para não confundir
 * o resultado com o cache de módulos de uma execução anterior. O fluxo medido
 * é o caminho real do app: canvas pronto, abrir Ferramentas e abrir Fetch All.
 * O mesmo comando também inventaria cada asset JavaScript/CSS com tamanho cru
 * e gzip, deixando a comparação antes/depois reproduzível em CI.
 *
 * Uso local em Linux: `xvfb-run -a npm run benchmark:bundle:check`.
 */

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { performance } = require('node:perf_hooks')
const { gzipSync } = require('node:zlib')

const DEFAULT_ITERATIONS = 5
const MAX_ITERATIONS = 10
const DEFAULT_TIMEOUT_MS = 20_000
const MAX_TIMEOUT_MS = 120_000

function percentile(values, percentage) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (!clean.length) return null

  const index = (clean.length - 1) * percentage
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const value = lower === upper
    ? clean[lower]
    : clean[lower] + (clean[upper] - clean[lower]) * (index - lower)

  return Number(value.toFixed(3))
}

function summarize(values) {
  const clean = values.filter((value) => Number.isFinite(value))
  return {
    count: clean.length,
    p50: percentile(clean, 0.5),
    p95: percentile(clean, 0.95),
    max: clean.length ? Number(Math.max(...clean).toFixed(3)) : null,
  }
}

function parseBoundedInteger(value, fallback, minimum, maximum, label) {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} deve ser um inteiro entre ${minimum} e ${maximum}.`)
  }
  return parsed
}

function parseArgs(argv = []) {
  const options = {
    iterations: DEFAULT_ITERATIONS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    distPath: null,
    reportPath: null,
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
      case 'iterations':
        options.iterations = parseBoundedInteger(
          value,
          DEFAULT_ITERATIONS,
          1,
          MAX_ITERATIONS,
          'iterations',
        )
        break
      case 'timeout-ms':
        options.timeoutMs = parseBoundedInteger(
          value,
          DEFAULT_TIMEOUT_MS,
          1_000,
          MAX_TIMEOUT_MS,
          'timeout-ms',
        )
        break
      case 'dist':
        if (!value) throw new Error('--dist precisa de um caminho.')
        options.distPath = value
        break
      case 'out':
      case 'report':
        if (!value) throw new Error(`${name} precisa de um caminho.`)
        options.reportPath = value
        break
      case 'check':
        if (value !== undefined) throw new Error('--check não aceita valor.')
        options.check = true
        break
      default:
        throw new Error(`Argumento desconhecido: --${name}`)
    }
  }

  return options
}

function commandLineArguments() {
  const scriptIndex = process.argv.findIndex(
    (argument) => argument === __filename || path.resolve(argument) === __filename,
  )
  return process.argv.slice(scriptIndex >= 0 ? scriptIndex + 1 : 2)
}

function gzipBytes(buffer) {
  return gzipSync(buffer).length
}

function collectMissingAssetReferences(distDirectory, assetNames) {
  const assetsDirectory = path.join(distDirectory, 'assets')
  const sourcePaths = [
    path.join(distDirectory, 'index.html'),
    ...assetNames.map((name) => path.join(assetsDirectory, name)),
  ].filter((filePath) => fs.existsSync(filePath))
  const references = []
  const referencePattern = /["'`](\.\/(?:assets\/)?[^"'`?#]+\.(?:js|css))(?:[?#][^"'`]*)?["'`]/g

  for (const sourcePath of sourcePaths) {
    const source = fs.readFileSync(sourcePath, 'utf8')
    for (const match of source.matchAll(referencePattern)) {
      const reference = match[1]
      const resolvedPath = path.resolve(path.dirname(sourcePath), reference.slice(2))
      references.push({
        source: path.relative(distDirectory, sourcePath),
        reference,
        exists: fs.existsSync(resolvedPath),
      })
    }
  }

  return {
    count: references.length,
    missing: references.filter((reference) => !reference.exists),
  }
}

function collectBundleAssets(distDirectory) {
  const assetsDirectory = path.join(distDirectory, 'assets')
  if (!fs.existsSync(assetsDirectory)) {
    throw new Error(`Pasta de assets não encontrada: ${assetsDirectory}`)
  }

  const assets = fs
    .readdirSync(assetsDirectory)
    .filter((name) => name.endsWith('.js') || name.endsWith('.css'))
    .sort()
    .map((name) => {
      const filePath = path.join(assetsDirectory, name)
      const buffer = fs.readFileSync(filePath)
      return {
        name,
        type: name.endsWith('.js') ? 'javascript' : 'css',
        bytes: buffer.length,
        gzipBytes: gzipBytes(buffer),
      }
    })

  const initialJavaScript = assets.find(
    (asset) => asset.type === 'javascript' && /^index-[^/]+\.js$/.test(asset.name),
  )

  return {
    initialJavaScript: initialJavaScript ?? null,
    javascript: assets.filter((asset) => asset.type === 'javascript'),
    css: assets.filter((asset) => asset.type === 'css'),
    all: assets,
    assetReferences: collectMissingAssetReferences(
      distDirectory,
      assets.map((asset) => asset.name),
    ),
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function withTimeout(promise, timeoutMs, label) {
  let timeoutId
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} excedeu ${timeoutMs} ms.`)), timeoutMs)
  })

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

async function waitForExpression(browserWindow, expression, timeoutMs, label) {
  const startedAt = performance.now()
  let lastError

  while (performance.now() - startedAt < timeoutMs) {
    if (browserWindow.isDestroyed()) {
      throw new Error(`${label}: a janela foi encerrada.`)
    }

    try {
      const matched = await browserWindow.webContents.executeJavaScript(expression, true)
      if (matched) return
    } catch (error) {
      lastError = error
    }

    await sleep(50)
  }

  const detail = lastError instanceof Error ? ` (${lastError.message})` : ''
  throw new Error(`${label} não apareceu em ${timeoutMs} ms${detail}`)
}

function readFetchAllChunkMarks(browserWindow) {
  return browserWindow.webContents.executeJavaScript(
    "document.documentElement.dataset.felixoLoadedCanvasTools?.split(',').includes('fetchAll') === true ? 1 : 0",
    true,
  )
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'n/a'
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(2)} KiB`
}

async function measureIteration(BrowserWindow, indexPath, timeoutMs, expectsLazyFetchAll) {
  const startedAt = performance.now()
  const browserWindow = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      backgroundThrottling: false,
      sandbox: false,
    },
  })

  try {
    await withTimeout(browserWindow.loadFile(indexPath), timeoutMs, 'Carregamento do renderer')
    await waitForExpression(
      browserWindow,
      `Boolean(document.querySelector('[data-felixo-canvas-ready]')) || Boolean(document.querySelector('button[title="Ferramentas"]'))`,
      timeoutMs,
      'Canvas inicial',
    )

    const startupMs = performance.now() - startedAt
    const initialFetchAllChunkMarks = await readFetchAllChunkMarks(browserWindow)
    const interactionStartedAt = performance.now()

    await browserWindow.webContents.executeJavaScript(`(() => {
      const button = Array.from(document.querySelectorAll('button'))
        .find((candidate) => candidate.title === 'Ferramentas')
      if (!button) throw new Error('Botão Ferramentas não encontrado')
      button.click()
      return true
    })()`, true)

    await waitForExpression(
      browserWindow,
      `Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.trim() === 'Fetch All')`,
      timeoutMs,
      'Opção Fetch All',
    )

    const firstInteractionMs = performance.now() - interactionStartedAt
    const panelInteractionStartedAt = performance.now()

    await browserWindow.webContents.executeJavaScript(`(() => {
      const button = Array.from(document.querySelectorAll('button'))
        .find((candidate) => candidate.textContent?.trim() === 'Fetch All')
      if (!button) throw new Error('Opção Fetch All não encontrada')
      button.focus()
      button.click()
      return true
    })()`, true)

    const fetchAllPanelExpression = expectsLazyFetchAll
      ? `Boolean(document.querySelector('[data-felixo-canvas-panel="fetch-all"]'))`
      : `Array.from(document.querySelectorAll('button[aria-label="Fechar"]')).some((button) => {
          let parent = button.parentElement
          for (let level = 0; level < 4 && parent; level += 1, parent = parent.parentElement) {
            const text = parent.textContent ?? ''
            if (text.includes('Fetch All') && !text.includes('Carregando Fetch All') && !text.includes('Não foi possível carregar')) return true
          }
          return false
        })`
    await waitForExpression(browserWindow, fetchAllPanelExpression, timeoutMs, 'Painel Fetch All')

    const interactionFetchAllChunkMarks = await readFetchAllChunkMarks(browserWindow)

    return {
      startupMs: Number((startupMs).toFixed(3)),
      firstInteractionMs: Number(firstInteractionMs.toFixed(3)),
      onDemandFetchAllMs: Number((performance.now() - panelInteractionStartedAt).toFixed(3)),
      initialFetchAllChunkMarks,
      interactionFetchAllChunkMarks,
    }
  } finally {
    if (!browserWindow.isDestroyed()) browserWindow.destroy()
  }
}

function validateReport(report, expectedIterations) {
  const failures = []
  if (!report.assets.initialJavaScript) {
    failures.push('o entry JavaScript do renderer não foi encontrado')
  }

  if (report.assets.javascript.length < 2) {
    failures.push('nenhum chunk JavaScript sob demanda foi gerado')
  }

  if (report.assets.assetReferences?.missing?.length > 0) {
    failures.push(
      `${report.assets.assetReferences.missing.length} referência(s) de asset não encontrada(s)`,
    )
  }

  if (report.results.length !== expectedIterations) {
    failures.push(
      `apenas ${report.results.length}/${expectedIterations} amostras do renderer terminaram`,
    )
  }

  if (report.results.some((result) => (
    result.startupMs <= 0
      || result.firstInteractionMs <= 0
      || result.onDemandFetchAllMs <= 0
  ))) {
    failures.push('uma amostra retornou tempo inválido')
  }

  for (const [index, result] of report.results.entries()) {
    if (result.initialFetchAllChunkMarks !== 0) {
      failures.push(`amostra ${index + 1}: ferramenta ou runtime pesado entrou no startup`)
    }
    if (result.interactionFetchAllChunkMarks < 1) {
      failures.push(`amostra ${index + 1}: o chunk Fetch All não foi carregado sob demanda`)
    }
  }

  return failures
}

async function run() {
  const options = parseArgs(commandLineArguments())
  const distDirectory = path.resolve(options.distPath ?? path.join(__dirname, '..', 'dist'))
  const indexPath = path.join(distDirectory, 'index.html')
  const assets = collectBundleAssets(distDirectory)

  if (!fs.existsSync(indexPath)) {
    throw new Error(`index.html não encontrado: ${indexPath}`)
  }

  console.log('[bundle] carregando API Electron')
  const { app, BrowserWindow } = require('electron')
  console.log('[bundle] API Electron carregada')
  const benchmarkUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-bundle-benchmark-'))
  app.setPath('userData', benchmarkUserData)
  app.disableHardwareAcceleration()
  console.log('[bundle] aguardando Electron ficar pronto')
  await app.whenReady()
  // Cada amostra usa uma BrowserWindow nova. Impedir o comportamento padrão
  // de encerrar o processo quando a primeira janela é destruída mantém o app
  // Electron vivo até que todas as amostras terminem.
  app.on('window-all-closed', () => {})
  console.log(`[bundle] medindo ${options.iterations} amostra(s) de ${indexPath}`)

  const results = []
  const failures = []
  const expectsLazyFetchAll = assets.javascript.some((asset) => /^FetchAllPanel-[^/]+\.js$/.test(asset.name))

  try {
    for (let iteration = 1; iteration <= options.iterations; iteration += 1) {
      try {
        console.log(`[bundle] iniciando amostra ${iteration}/${options.iterations}`)
        const result = await measureIteration(
          BrowserWindow,
          indexPath,
          options.timeoutMs,
          expectsLazyFetchAll,
        )
        results.push(result)
        console.log(
          `[bundle] amostra ${iteration}/${options.iterations}: startup=${result.startupMs} ms, menu=${result.firstInteractionMs} ms, Fetch All=${result.onDemandFetchAllMs} ms`,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        failures.push(`amostra ${iteration}: ${message}`)
        console.error(`[bundle] amostra ${iteration} falhou: ${message}`)
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      iterations: options.iterations,
      timeoutMs: options.timeoutMs,
      assets,
      startupMs: summarize(results.map((result) => result.startupMs)),
      firstInteractionMs: summarize(results.map((result) => result.firstInteractionMs)),
      onDemandFetchAllMs: summarize(results.map((result) => result.onDemandFetchAllMs)),
      results,
      failures,
    }

    if (options.reportPath) {
      const reportPath = path.resolve(options.reportPath)
      fs.mkdirSync(path.dirname(reportPath), { recursive: true })
      fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
    }

    const initial = assets.initialJavaScript
    console.log(
      `[bundle] entry inicial: ${initial ? `${initial.name} ${formatBytes(initial.bytes)} / ${formatBytes(initial.gzipBytes)} gzip` : 'ausente'}`,
    )
    console.log(`[bundle] JavaScript total: ${assets.javascript.length} assets`)
    console.log(`[bundle] referências de assets: ${assets.assetReferences.count} encontradas, ${assets.assetReferences.missing.length} ausentes`)
    for (const asset of assets.javascript) {
      console.log(`  ${asset.name}: ${formatBytes(asset.bytes)} / ${formatBytes(asset.gzipBytes)} gzip`)
    }
    console.log(
      `[bundle] startup p50/p95: ${report.startupMs.p50 ?? 'n/a'} / ${report.startupMs.p95 ?? 'n/a'} ms`,
    )
    console.log(
      `[bundle] primeira interação p50/p95: ${report.firstInteractionMs.p50 ?? 'n/a'} / ${report.firstInteractionMs.p95 ?? 'n/a'} ms`,
    )
    console.log(
      `[bundle] Fetch All sob demanda p50/p95: ${report.onDemandFetchAllMs.p50 ?? 'n/a'} / ${report.onDemandFetchAllMs.p95 ?? 'n/a'} ms`,
    )

    const validationFailures = options.check
      ? validateReport(report, options.iterations)
      : []
    const allFailures = [...failures, ...validationFailures]
    if (allFailures.length > 0) {
      throw new Error(allFailures.join('; '))
    }
  } finally {
    await app.quit()
    fs.rmSync(benchmarkUserData, { recursive: true, force: true })
  }
}

// Electron loads an app entry through its browser process and does not always
// set `require.main` to that entry. The explicit process.type guard keeps the
// script runnable both as an Electron benchmark and as a Node-test module.
if (process.versions.electron && process.type === 'browser') {
  run().catch((error) => {
    console.error(`[bundle] falhou: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
} else if (require.main === module) {
  run().catch((error) => {
    console.error(`[bundle] falhou: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}

module.exports = {
  collectBundleAssets,
  parseArgs,
  percentile,
  summarize,
  validateReport,
}
