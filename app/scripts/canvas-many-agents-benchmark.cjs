#!/usr/bin/env node
'use strict'

/**
 * Harness combinado de muitos agentes: terminais vivos, blocos, conexões,
 * painéis abertos e refresh no MESMO renderer, no app de verdade.
 *
 * As outras bancadas medem partes isoladas (`benchmark:terminal` sem canvas,
 * `benchmark:canvas-connections` sem terminais, `benchmark:ui-render` sem
 * agentes). Esta sobe o `dist` de produção com o lançador do
 * `ui-render-performance.cjs` e troca o `node-pty` pela CLI roteirizada do
 * processo principal (`FELIXO_DEVTOOLS_FAKE_CLI_PTY=1`): nenhuma CLI real
 * roda. Cada agente recebe o gatilho de streaming a cada 3 s e imprime
 * ~20 linhas/s enquanto a medição gira o zoom do canvas e o painel de
 * ferramentas e a gaveta de um terminal ficam abertos.
 *
 * Mede abertura, carga, steady state (frame, long task, entrada → quadro),
 * RSS de todos os processos (`app.getAppMetrics`), heap, DOM, listeners e
 * timers do renderer em pontos de controle, refresh com os agentes vivos e
 * queda do renderer. O relatório usa os campos do `terminal-scrollback`
 * (`resumeMs`, `rendererWorkingSetMiB`, `heapBefore`/`heapAfterStream`), então
 * o `benchmark-regression-gate.cjs` compara dois relatórios à mão.
 *
 * Uso: `npx vite build && npm run benchmark:many-agents -- --agents=20 --nodes=300`.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { performance } = require('node:perf_hooks')
const ui = require('./ui-render-performance.cjs')
const { SMOKE_STREAM_TRIGGER } = require('../electron/services/devtools-fake-cli-pty.cjs')

const DEFAULT_AGENTS = 20
const MAX_AGENTS = 60
const DEFAULT_NODES = 300
const MAX_NODES = 1_000
const DEFAULT_DURATION_MS = 15_000
const DEFAULT_LAUNCH_TIMEOUT_MS = 90_000
// O gatilho imprime 60 linhas a cada 50 ms: um novo a cada 3 s mantém a saída contínua.
const STREAM_INTERVAL_MS = 3_000
const RSS_SAMPLE_INTERVAL_MS = 1_000
const WHEEL_INTERVAL_MS = 250
// Abaixo disso a janela está sendo estrangulada pelo Chromium e o frame não mede o app.
const MIN_IDLE_FPS = 30

/**
 * Orçamento de `docs/projeto/POLITICA-PERFORMANCE.md` ("Cenários e
 * orçamento"). Acima do Carregado não há meta: o Modo Performance é a
 * recomendação.
 */
const BUDGETS = Object.freeze({
  leve: { maxAgents: 9, maxNodes: 300, frameP95Ms: 120, longTaskP95Ms: 250, resumeMs: 5_000 },
  carregado: { maxAgents: 20, maxNodes: 1_000, frameP95Ms: 160, longTaskP95Ms: 420, resumeMs: 9_000 },
})

function parseBoundedInteger(value, min, max, name) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} deve ser um inteiro entre ${min} e ${max}.`)
  }
  return parsed
}

function parseArgs(argv) {
  const options = {
    agents: DEFAULT_AGENTS,
    nodes: DEFAULT_NODES,
    durationMs: DEFAULT_DURATION_MS,
    out: null,
    check: false,
    appDir: path.resolve(__dirname, '..'),
    launchTimeoutMs: DEFAULT_LAUNCH_TIMEOUT_MS,
  }
  for (const argument of argv) {
    const [key, ...rest] = argument.split('=')
    const value = rest.join('=')
    if (key === '--agents') options.agents = parseBoundedInteger(value, 1, MAX_AGENTS, '--agents')
    else if (key === '--nodes') options.nodes = parseBoundedInteger(value, 0, MAX_NODES, '--nodes')
    else if (key === '--duration-ms') options.durationMs = parseBoundedInteger(value, 3_000, 600_000, '--duration-ms')
    else if (key === '--launch-timeout-ms') options.launchTimeoutMs = parseBoundedInteger(value, 10_000, 600_000, '--launch-timeout-ms')
    else if (key === '--out') options.out = path.resolve(value)
    else if (key === '--app-dir') options.appDir = path.resolve(value)
    else if (key === '--check') options.check = true
    else throw new Error(`Opção desconhecida: ${argument}`)
  }
  return options
}

/** Cenário da política para a carga pedida, ou `null` acima do orçamento. */
function budgetScenario(agents, nodes) {
  for (const [name, budget] of Object.entries(BUDGETS)) {
    if (agents <= budget.maxAgents && nodes <= budget.maxNodes) return name
  }
  return null
}

/** Agentes numa faixa acima dos blocos comuns, cada um ligado a uma nota. */
function buildFixture(agentCount, nodeCount) {
  const fillers = ui.buildFixtureNodes(nodeCount)
  const agents = Array.from({ length: agentCount }, (_, index) => ({
    id: `bench-agente-${index}`,
    type: 'terminal',
    position: { x: index * 560, y: -480 },
    width: 520,
    height: 360,
    data: { label: `Agente ${index}`, command: 'mock', args: [], cwd: '', launchMode: 'agent' },
  }))
  const notes = fillers.filter((node) => node.type === 'note')
  const links = notes.length
    ? agents.map((agent, index) => ({ id: `bench-ligacao-${index}`, source: agent.id, target: notes[index % notes.length].id }))
    : []
  return { nodes: [...agents, ...fillers], edges: [...ui.buildFixtureEdges(fillers), ...links], agentIds: agents.map((agent) => agent.id) }
}

/** `{count, p50, p95, max}`, o formato do `terminal-scrollback`. */
function stats(values) {
  const clean = values.filter(Number.isFinite)
  return {
    count: clean.length,
    p50: ui.percentile(clean, 0.5),
    p95: ui.percentile(clean, 0.95),
    max: clean.length ? Number(Math.max(...clean).toFixed(3)) : null,
  }
}

/** Falhas do `--check`: queda, agente mudo e as metas da política. */
function checkReport(result) {
  const failures = []
  if (result.crashed) failures.push(`o renderer caiu (${result.crashed})`)
  if (result.agentsWithOutput < result.count) {
    failures.push(`só ${result.agentsWithOutput} de ${result.count} agentes produziram saída`)
  }
  const budget = BUDGETS[result.budgetScenario]
  if (!budget) return failures
  if (result.frameReliable && result.frameMs.p95 > budget.frameP95Ms) {
    failures.push(`frame p95 ${result.frameMs.p95} ms acima da meta ${budget.frameP95Ms} ms (${result.budgetScenario})`)
  }
  if (result.longTaskMs.p95 > budget.longTaskP95Ms) {
    failures.push(`long task p95 ${result.longTaskMs.p95} ms acima da meta ${budget.longTaskP95Ms} ms (${result.budgetScenario})`)
  }
  if (result.resumeMs > budget.resumeMs) {
    failures.push(`refresh ${result.resumeMs} ms acima da meta ${budget.resumeMs} ms (${result.budgetScenario})`)
  }
  return failures
}

/**
 * Roda antes de qualquer script da página: conta os timers vivos do thread
 * principal e as sessões de PTY que já mandaram saída.
 */
function instrumentPage() {
  const timeouts = new Set()
  const intervals = new Set()
  const native = {
    setTimeout: window.setTimeout,
    setInterval: window.setInterval,
    clearTimeout: window.clearTimeout,
    clearInterval: window.clearInterval,
  }
  window.setTimeout = function setTimeout(handler, delay, ...args) {
    if (typeof handler !== 'function') return native.setTimeout.call(window, handler, delay, ...args)
    const id = native.setTimeout.call(window, function felixoTimeout(...callArgs) {
      timeouts.delete(id)
      return handler.apply(this, callArgs)
    }, delay, ...args)
    timeouts.add(id)
    return id
  }
  window.setInterval = function setInterval(...args) {
    const id = native.setInterval.apply(window, args)
    intervals.add(id)
    return id
  }
  // No navegador os dois `clear*` cancelam qualquer um dos dois tipos.
  window.clearTimeout = function clearTimeout(id) {
    timeouts.delete(id)
    intervals.delete(id)
    return native.clearTimeout.call(window, id)
  }
  window.clearInterval = function clearInterval(id) {
    timeouts.delete(id)
    intervals.delete(id)
    return native.clearInterval.call(window, id)
  }
  const sessionsWithOutput = new Set()
  window.felixo?.pty?.onData?.((payload) => {
    if (payload?.sessionId) sessionsWithOutput.add(payload.sessionId)
  })
  Object.defineProperty(window, '__felixoManyAgents', {
    value: Object.freeze({
      timers: () => ({ timeouts: timeouts.size, intervals: intervals.size }),
      sessionsWithOutput: () => [...sessionsWithOutput],
    }),
  })
}

const MAIN_METRICS_EXPRESSION = `(() => {
  const rendererPid = mainWindow.webContents.getOSProcessId()
  const metrics = app.getAppMetrics()
  return JSON.stringify({
    rendererKiB: metrics.find((metric) => metric.pid === rendererPid)?.memory.workingSetSize ?? null,
    appKiB: metrics.reduce((total, metric) => total + metric.memory.workingSetSize, 0),
  })
})()`

// Janela invisível e sem foco, mas mostrada: escondida, o Chromium estrangula o rAF.
const SHOW_WITHOUT_DISTURBING_EXPRESSION =
  '(mainWindow.setSkipTaskbar(true), mainWindow.setIgnoreMouseEvents(true), mainWindow.setOpacity(0), mainWindow.showInactive(), true)'

async function mainEval(page, expression) {
  return page.evaluate((code) => window.felixo.devtools.mainEval(code), expression)
}

async function readMemory(page) {
  const { rendererKiB, appKiB } = JSON.parse(await mainEval(page, MAIN_METRICS_EXPRESSION))
  return { rendererMiB: rendererKiB / 1024, appMiB: appKiB / 1024 }
}

async function checkpoint(page, cdp, name) {
  await cdp.send('HeapProfiler.collectGarbage')
  const { metrics } = await cdp.send('Performance.getMetrics')
  const metric = (key) => metrics.find((entry) => entry.name === key)?.value ?? null
  const memory = await readMemory(page)
  const point = {
    name,
    domNodes: metric('Nodes'),
    listeners: metric('JSEventListeners'),
    documents: metric('Documents'),
    jsHeapUsedBytes: metric('JSHeapUsedSize'),
    timers: await page.evaluate(() => window.__felixoManyAgents.timers()),
    rendererWorkingSetMiB: Number(memory.rendererMiB.toFixed(3)),
    appWorkingSetMiB: Number(memory.appMiB.toFixed(3)),
  }
  console.log(`[many-agents] ${name}: DOM ${point.domNodes}, listeners ${point.listeners}, timers ${point.timers.timeouts}+${point.timers.intervals}, heap ${(point.jsHeapUsedBytes / 1048576).toFixed(1)} MiB, renderer ${point.rendererWorkingSetMiB.toFixed(0)} MiB`)
  return point
}

async function waitLoaded(page, nodeIds, timeoutMs) {
  const startedAt = performance.now()
  await ui.waitHydrated(page, nodeIds, timeoutMs)
  return Number((performance.now() - startedAt).toFixed(1))
}

async function measureIdleFps(page) {
  return page.evaluate(() => new Promise((resolve) => {
    let frames = 0
    const startedAt = performance.now()
    const tick = (now) => {
      frames += 1
      if (now - startedAt < 1_000) requestAnimationFrame(tick)
      else resolve(Number(((frames * 1_000) / (now - startedAt)).toFixed(1)))
    }
    requestAnimationFrame(tick)
  }))
}

async function startCollectors(page) {
  await page.evaluate(() => {
    const collected = { running: true, frames: [], longTasks: [], input: [] }
    window.__felixoManyAgentsRun = collected
    let last = performance.now()
    const tick = (now) => {
      collected.frames.push(now - last)
      last = now
      if (collected.running) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) collected.longTasks.push(entry.duration)
    }).observe({ type: 'longtask' })
    // Entrada → próximo quadro: do carimbo do evento ao rAF seguinte.
    window.addEventListener('wheel', (event) => {
      requestAnimationFrame((now) => collected.input.push(now - event.timeStamp))
    }, { capture: true, passive: true })
  })
}

async function stopCollectors(page) {
  return page.evaluate(() => {
    const collected = window.__felixoManyAgentsRun
    collected.running = false
    return { frames: collected.frames.slice(1), longTasks: collected.longTasks, input: collected.input }
  })
}

async function writeToAgents(page, agentIds) {
  await page.evaluate(({ ids, data }) => Promise.all(
    ids.map((id) => window.felixo.pty.write({ sessionId: `canvas:${id}`, data })),
  ), { ids: agentIds, data: `${SMOKE_STREAM_TRIGGER}\r` })
}

async function openPanels(page, agentId) {
  await page.getByRole('button', { name: 'Buscar' }).first().click()
  await page.locator('[data-felixo-canvas-panel="search"]').waitFor({ state: 'visible' })
  // Pelo DOM: o bloco pode estar fora da área visível do canvas.
  await page.locator(`[data-terminal-expand-trigger="${agentId}"]`).first().dispatchEvent('click')
  await page.locator('[data-canvas-terminal-drawer]').waitFor({ state: 'visible' })
}

async function steadyState(page, agentIds, durationMs) {
  const rss = []
  const box = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  await page.mouse.move(box.width * 0.6, box.height * 0.5)
  await startCollectors(page)
  const startedAt = performance.now()
  let nextStream = 0
  let nextRss = 0
  let direction = 1
  while (performance.now() - startedAt < durationMs) {
    const elapsed = performance.now() - startedAt
    if (elapsed >= nextStream) {
      await writeToAgents(page, agentIds)
      nextStream += STREAM_INTERVAL_MS
    }
    if (elapsed >= nextRss) {
      rss.push(await readMemory(page))
      nextRss += RSS_SAMPLE_INTERVAL_MS
    }
    await page.mouse.wheel(0, 120 * direction)
    direction = -direction
    await page.waitForTimeout(WHEEL_INTERVAL_MS)
  }
  return { ...(await stopCollectors(page)), rss }
}

async function run(options) {
  const { chromium } = require(require.resolve('playwright-core', { paths: [options.appDir, __dirname] }))
  const { nodes, edges, agentIds } = buildFixture(options.agents, options.nodes)
  const nodeIds = nodes.map((node) => node.id)
  const report = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    host: { platform: process.platform, arch: process.arch, cpus: os.cpus().length, totalMemGiB: Number((os.totalmem() / 1024 ** 3).toFixed(1)) },
    scenario: { agents: options.agents, nodes: nodes.length, edges: edges.length, durationMs: options.durationMs },
    results: [],
  }
  const startedAt = performance.now()
  const app = await ui.launchApp({
    appDir: options.appDir,
    gpu: 'padrao',
    angle: 'gl',
    launchTimeoutMs: options.launchTimeoutMs,
    env: { FELIXO_DEVTOOLS_HEADLESS: '1', FELIXO_DEVTOOLS_MOCK_PTY: '0', FELIXO_DEVTOOLS_FAKE_CLI_PTY: '1' },
  })
  let browser
  let crashed = null
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${app.port}`)
    const page = await ui.findAppPage(browser, options.launchTimeoutMs)
    page.on('crash', () => { crashed = crashed ?? 'crash' })
    page.on('close', () => { crashed = crashed ?? 'janela fechada' })
    await ui.waitHydrated(page, [], options.launchTimeoutMs)
    const startupMs = Number((performance.now() - startedAt).toFixed(1))
    await mainEval(page, SHOW_WITHOUT_DISTURBING_EXPRESSION)
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Performance.enable')
    await page.addInitScript(instrumentPage)
    await page.reload()
    await ui.waitHydrated(page, [], options.launchTimeoutMs)
    const idleFps = await measureIdleFps(page)
    const checkpoints = [await checkpoint(page, cdp, 'vazio')]

    await ui.populateCanvas(page, nodes, edges)
    await page.reload()
    const loadMs = await waitLoaded(page, nodeIds, options.launchTimeoutMs)
    await openPanels(page, agentIds[0])
    checkpoints.push(await checkpoint(page, cdp, 'carregado'))

    const steady = await steadyState(page, agentIds, options.durationMs)
    const agentsWithOutput = (await page.evaluate(() => window.__felixoManyAgents.sessionsWithOutput()))
      .filter((sessionId) => agentIds.includes(sessionId.replace(/^canvas:/, ''))).length
    checkpoints.push(await checkpoint(page, cdp, 'fim-da-carga'))

    await page.reload()
    const resumeMs = await waitLoaded(page, nodeIds, options.launchTimeoutMs)
    checkpoints.push(await checkpoint(page, cdp, 'apos-refresh'))

    const loaded = checkpoints.find((point) => point.name === 'carregado')
    const end = checkpoints.find((point) => point.name === 'fim-da-carga')
    const result = {
      phase: 'canvas-many-agents',
      count: options.agents,
      nodes: nodes.length,
      edges: edges.length,
      budgetScenario: budgetScenario(options.agents, nodes.length - options.agents),
      startupMs,
      loadMs,
      resumeMs,
      idleFps,
      frameReliable: idleFps >= MIN_IDLE_FPS,
      frameMs: stats(steady.frames),
      longTaskMs: stats(steady.longTasks),
      inputToFrameMs: stats(steady.input),
      rendererWorkingSetMiB: stats(steady.rss.map((sample) => sample.rendererMiB)),
      appWorkingSetMiB: stats(steady.rss.map((sample) => sample.appMiB)),
      heapBefore: { usedJsHeapBytes: loaded.jsHeapUsedBytes },
      heapAfterStream: { usedJsHeapBytes: end.jsHeapUsedBytes },
      agentsWithOutput,
      checkpoints,
      crashed,
    }
    report.results.push(result)
  } finally {
    await browser?.close().catch(() => {})
    ui.stopApp(app)
  }
  report.finishedAt = new Date().toISOString()
  report.durationMs = Math.round(performance.now() - startedAt)
  return report
}

async function main(argv) {
  const options = parseArgs(argv)
  const report = await run(options)
  const [result] = report.results
  const output = options.out ?? path.join(options.appDir, `canvas-many-agents-${process.platform}.json`)
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`[many-agents] ${result.count} agentes, ${result.nodes} blocos, ${result.edges} conexões: abertura ${result.startupMs} ms, carga ${result.loadMs} ms, refresh ${result.resumeMs} ms`)
  console.log(`[many-agents] frame p95 ${result.frameMs.p95} ms (ocioso ${result.idleFps} fps${result.frameReliable ? '' : ', janela estrangulada: frame não conta'}), long task p95 ${result.longTaskMs.p95} ms, entrada → quadro p95 ${result.inputToFrameMs.p95} ms`)
  console.log(`[many-agents] RSS p95: renderer ${result.rendererWorkingSetMiB.p95} MiB, app ${result.appWorkingSetMiB.p95} MiB; agentes com saída ${result.agentsWithOutput}/${result.count}`)
  console.log(`[many-agents] relatório: ${output}`)
  if (options.check) {
    const failures = checkReport(result)
    if (failures.length) {
      for (const failure of failures) console.error(`[many-agents] FALHA: ${failure}`)
      process.exitCode = 1
    } else {
      console.log(`[many-agents] --check ok (${result.budgetScenario ?? 'acima do orçamento: só queda e saída dos agentes'})`)
    }
  }
}

module.exports = { BUDGETS, budgetScenario, buildFixture, checkReport, instrumentPage, parseArgs, stats }

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`[many-agents] ${error.stack || error.message}`)
    process.exitCode = 1
  })
}
