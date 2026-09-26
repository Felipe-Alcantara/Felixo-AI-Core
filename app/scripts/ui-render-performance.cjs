#!/usr/bin/env node
'use strict'

/**
 * Mede o custo de renderização da UI real do app com o Modo Performance
 * desligado e ligado, na GPU escolhida.
 *
 * Nenhuma das outras bancadas liga o Modo Performance: `canvas-connection-performance`
 * e `terminal-output-performance` comparam estruturas de dados, não o efeito
 * visual do toggle. Esta sobe o app de verdade (`electron .`, com o `dist` de
 * produção, sem Vite), popula o canvas pela ponte `window.felixo.canvas`,
 * alterna o modo pelo mesmo `localStorage` que a tela de Configurações grava
 * e repete a MESMA interação (zoom e pan no canvas, abrir e fechar grupos da
 * sidebar, hover nos blocos) em rodadas intercaladas. Por rodada ela coleta:
 * - intervalos entre frames (`requestAnimationFrame`): p50/p95/p99 e quadros
 *   acima de 25 ms;
 * - o tempo que o Chromium gastou em estilo, layout e paint (tracing
 *   `devtools.timeline`), que é onde uma troca de CSS aparece;
 * - long tasks (> 50 ms) do renderer.
 * O relatório registra qual GPU renderizou (CDP `SystemInfo.getInfo`), para a
 * comparação integrada × dedicada não depender de suposição.
 *
 * `--render=software` mede o modo compatível (rasterização por software), o
 * mesmo que o app usa no Windows com pouca memória; o padrão é a GPU.
 *
 * Uso (Linux; a janela precisa estar visível, senão o rAF é estrangulado):
 *   npx vite build
 *   node scripts/ui-render-performance.cjs --gpu=integrada --rounds=3 --out=ui-intel.json
 *   node scripts/ui-render-performance.cjs --gpu=dedicada --angle=vulkan --rounds=3 --out=ui-nvidia.json
 * `--app-dir` aponta outro checkout (ex.: um worktree com outra versão do CSS),
 * que precisa ter o próprio `dist` e `node_modules`.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { spawn } = require('node:child_process')

const DEFAULT_ROUNDS = 3
const MAX_ROUNDS = 10
const DEFAULT_DURATION_MS = 6_000
const DEFAULT_NODES = 48
// A task de hardware pede o canvas com 1.000 blocos, um uso pesado real.
const MAX_NODES = 1_000
const DEFAULT_LAUNCH_TIMEOUT_MS = 60_000
const JANK_FRAME_MS = 25
const PERFORMANCE_MODE_STORAGE_KEY = 'felixo-ai-core.performance-mode'
const MODES = ['off', 'on']

// Eventos do tracing que somam o custo de uma troca de CSS no renderer.
const TRACE_BUCKETS = {
  estiloMs: ['UpdateLayoutTree', 'RecalculateStyles'],
  layoutMs: ['Layout'],
  paintMs: ['Paint', 'PrePaint', 'PaintImage'],
  composicaoMs: ['Layerize', 'UpdateLayer', 'CompositeLayers', 'Commit'],
  scriptMs: ['FunctionCall', 'EvaluateScript', 'TimerFire', 'FireAnimationFrame', 'EventDispatch'],
}

function parseBoundedInteger(value, fallback, min, max, name) {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`--${name} deve ser um inteiro entre ${min} e ${max}.`)
  }
  return parsed
}

function parseArgs(argv) {
  const options = {
    gpu: 'padrao',
    render: 'gpu',
    angle: 'gl',
    rounds: DEFAULT_ROUNDS,
    durationMs: DEFAULT_DURATION_MS,
    nodes: DEFAULT_NODES,
    appDir: path.resolve(__dirname, '..'),
    out: null,
    launchTimeoutMs: DEFAULT_LAUNCH_TIMEOUT_MS,
  }
  for (const argument of argv) {
    const [rawKey, ...rest] = argument.split('=')
    const value = rest.join('=')
    switch (rawKey) {
      case '--gpu':
        if (!['padrao', 'integrada', 'dedicada'].includes(value)) {
          throw new Error('--gpu deve ser padrao, integrada ou dedicada.')
        }
        options.gpu = value
        break
      case '--render':
        if (!['gpu', 'software'].includes(value)) {
          throw new Error('--render deve ser gpu ou software.')
        }
        options.render = value
        break
      case '--angle':
        if (!['gl', 'vulkan'].includes(value)) {
          throw new Error('--angle deve ser gl ou vulkan.')
        }
        options.angle = value
        break
      case '--rounds':
        options.rounds = parseBoundedInteger(value, DEFAULT_ROUNDS, 1, MAX_ROUNDS, 'rounds')
        break
      case '--duration-ms':
        options.durationMs = parseBoundedInteger(value, DEFAULT_DURATION_MS, 1_000, 60_000, 'duration-ms')
        break
      case '--nodes':
        options.nodes = parseBoundedInteger(value, DEFAULT_NODES, 4, MAX_NODES, 'nodes')
        break
      case '--app-dir':
        if (!value) throw new Error('--app-dir precisa de um caminho.')
        options.appDir = path.resolve(value)
        break
      case '--out':
        if (!value) throw new Error('--out precisa de um caminho.')
        options.out = path.resolve(value)
        break
      case '--launch-timeout-ms':
        options.launchTimeoutMs = parseBoundedInteger(value, DEFAULT_LAUNCH_TIMEOUT_MS, 5_000, 300_000, 'launch-timeout-ms')
        break
      default:
        throw new Error(`Argumento desconhecido: ${argument}`)
    }
  }
  return options
}

/**
 * Variáveis que escolhem a GPU no Linux com PRIME on-demand. `integrada`
 * remove as de offload (caso o shell as tenha exportado); `dedicada` pede o
 * offload para a NVIDIA tanto no GLX quanto no EGL, porque o Chromium pode
 * usar qualquer um dos dois. Fora do Linux só `padrao` é aceito.
 */
function gpuEnvironment(gpu, platform = process.platform, baseEnv = process.env) {
  const env = { ...baseEnv }
  if (gpu === 'padrao') return env
  if (platform !== 'linux') {
    throw new Error(`--gpu=${gpu} só é suportado no Linux (PRIME); use --gpu=padrao.`)
  }
  delete env.__NV_PRIME_RENDER_OFFLOAD
  delete env.__GLX_VENDOR_LIBRARY_NAME
  delete env.__EGL_VENDOR_LIBRARY_FILENAMES
  delete env.__VK_LAYER_NV_optimus
  if (gpu === 'dedicada') {
    // Só o caminho Vulkan: medido em 25/09/2026 (Electron 41, X11, PRIME
    // on-demand, driver NVIDIA 580), o offload pelo GLX
    // (__GLX_VENDOR_LIBRARY_NAME=nvidia) faz o ANGLE falhar com "Invalid
    // visual ID requested" — o visual X vem da GLX padrão (Mesa) — e o
    // Electron fica preso tentando subir o GL. Ver `chromiumArgs`.
    env.__NV_PRIME_RENDER_OFFLOAD = '1'
    env.__VK_LAYER_NV_optimus = 'NVIDIA_only'
  }
  return env
}

/**
 * Switches do Chromium para o backend do ANGLE. A GPU dedicada exige Vulkan
 * (ver `gpuEnvironment`); para comparar as duas GPUs sem misturar backend,
 * meça a integrada também com `--angle=vulkan`.
 */
function chromiumArgs({ gpu, angle }) {
  if (gpu === 'dedicada' && angle !== 'vulkan') {
    throw new Error('--gpu=dedicada exige --angle=vulkan: no X11 com PRIME, o offload pelo GLX derruba o GL do Chromium ("Invalid visual ID requested").')
  }
  if (gpu === 'integrada' && angle === 'vulkan') {
    // Medido: com Vulkan o Chromium escolhe a GPU dedicada por conta própria,
    // e nem __VK_LAYER_NV_optimus=non_NVIDIA_only nem MESA_VK_DEVICE_SELECT
    // mudaram isso. A integrada é medida pelo caminho padrão do app (GL).
    throw new Error('--gpu=integrada usa --angle=gl: com Vulkan o Chromium escolhe a GPU dedicada.')
  }
  if (angle !== 'vulkan') return []
  return ['--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan']
}

function percentile(values, proportion) {
  const ordered = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!ordered.length) return null
  const position = (ordered.length - 1) * proportion
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  const value = ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)
  return Number(value.toFixed(3))
}

function median(values) {
  return percentile(values, 0.5)
}

/** Estatística dos intervalos entre frames coletados no renderer. */
function frameStats(intervals, durationMs) {
  const clean = intervals.filter((value) => Number.isFinite(value) && value > 0)
  return {
    frames: clean.length,
    fps: durationMs > 0 ? Number(((clean.length * 1000) / durationMs).toFixed(2)) : null,
    p50Ms: percentile(clean, 0.5),
    p95Ms: percentile(clean, 0.95),
    p99Ms: percentile(clean, 0.99),
    acimaDe25Ms: clean.filter((value) => value > JANK_FRAME_MS).length,
  }
}

/**
 * Soma a duração dos eventos completos (ph 'X') do tracing por categoria de
 * custo. Só conta o processo do renderer da página medida (`rendererPid`),
 * para o browser process e a GPU não entrarem na conta do CSS.
 */
function summarizeTrace(events, rendererPid = null) {
  const totals = Object.fromEntries(Object.keys(TRACE_BUCKETS).map((bucket) => [bucket, 0]))
  const counts = Object.fromEntries(Object.keys(TRACE_BUCKETS).map((bucket) => [bucket, 0]))
  const byName = new Map()
  for (const [bucket, names] of Object.entries(TRACE_BUCKETS)) {
    for (const name of names) byName.set(name, bucket)
  }
  for (const event of events) {
    if (!event || event.ph !== 'X' || typeof event.dur !== 'number') continue
    if (rendererPid !== null && event.pid !== rendererPid) continue
    const bucket = byName.get(event.name)
    if (!bucket) continue
    totals[bucket] += event.dur / 1000
    counts[bucket] += 1
  }
  const summary = {}
  for (const bucket of Object.keys(TRACE_BUCKETS)) {
    summary[bucket] = Number(totals[bucket].toFixed(3))
    summary[`${bucket.replace(/Ms$/, '')}Eventos`] = counts[bucket]
  }
  return summary
}

const NVIDIA_VENDOR_ID = 0x10de

/**
 * Confere que a GPU pedida é a que renderizou, pelo vendorId do dispositivo
 * ativo que o próprio Chromium relata. Sem isto, uma seleção que o driver
 * ignorasse viraria número da GPU errada sem aviso.
 */
function assertRequestedGpu(gpu, info) {
  if (gpu === 'padrao') return
  const vendorId = info?.ativa?.vendorId ?? 0
  if (!vendorId) {
    throw new Error(`[ui-render] a GPU não subiu (renderer: ${info?.renderer ?? 'desconhecido'}); a medição seria de rasterização por software.`)
  }
  const isNvidia = vendorId === NVIDIA_VENDOR_ID
  if ((gpu === 'dedicada') !== isNvidia) {
    throw new Error(`[ui-render] pedida a GPU ${gpu}, mas renderizou ${info.renderer} (vendorId 0x${vendorId.toString(16)}).`)
  }
}

/** Custo médio por quadro desenhado, em ms. */
function perFrame(trace, frames) {
  const result = {}
  for (const bucket of ['estiloMs', 'layoutMs', 'paintMs', 'composicaoMs']) {
    result[bucket] = frames > 0 ? Number((trace[bucket] / frames).toFixed(3)) : null
  }
  return result
}

/** O pid do renderer é o do evento `TracingStartedInBrowser`/`SetLayerTreeId` da página. */
function rendererPidFromTrace(events) {
  const started = events.find((event) => event?.name === 'TracingStartedInBrowser')
  const frames = started?.args?.data?.frames
  if (Array.isArray(frames)) {
    const main = frames.find((frame) => !frame.parent && Number.isFinite(frame.processId))
    if (main) return main.processId
  }
  const layer = events.find((event) => event?.name === 'SetLayerTreeId' && Number.isFinite(event.pid))
  return layer ? layer.pid : null
}

function buildFixtureNodes(count) {
  const nodes = []
  const columns = Math.ceil(Math.sqrt(count))
  for (let index = 0; index < count; index += 1) {
    const column = index % columns
    const row = Math.floor(index / columns)
    const position = { x: column * 300, y: row * 220 }
    if (index % 6 === 0) {
      nodes.push({ id: `bench-grupo-${index}`, type: 'group', position, width: 260, height: 180, data: { label: `Grupo ${index}` } })
    } else if (index % 3 === 0) {
      nodes.push({ id: `bench-arquivo-${index}`, type: 'file', position, width: 260, height: 180, data: { fileName: `bench-${index}.md`, label: `Arquivo ${index}`, mode: 'scratchpad' } })
    } else {
      nodes.push({ id: `bench-nota-${index}`, type: 'note', position, width: 220, height: 160, data: { label: `Nota ${index}`, text: `Bloco de medição ${index}` } })
    }
  }
  return nodes
}

function buildFixtureEdges(nodes) {
  const notes = nodes.filter((node) => node.type === 'note')
  const edges = []
  for (let index = 1; index < notes.length; index += 1) {
    edges.push({ id: `bench-conexao-${index}`, source: notes[index - 1].id, target: notes[index].id })
  }
  return edges
}

/** Ordem das rodadas: alterna quem vai primeiro, para a deriva não favorecer um modo. */
function roundOrder(rounds) {
  const order = []
  for (let round = 0; round < rounds; round += 1) {
    const modes = round % 2 === 0 ? MODES : [...MODES].reverse()
    for (const mode of modes) order.push({ round: round + 1, mode })
  }
  return order
}

function summarizeRuns(runs) {
  const summary = {}
  for (const mode of MODES) {
    const own = runs.filter((run) => run.mode === mode)
    if (!own.length) continue
    const pick = (read) => median(own.map(read))
    summary[mode] = {
      rodadas: own.length,
      fps: pick((run) => run.frames.fps),
      frameP95Ms: pick((run) => run.frames.p95Ms),
      frameP99Ms: pick((run) => run.frames.p99Ms),
      framesAcimaDe25Ms: pick((run) => run.frames.acimaDe25Ms),
      estiloMs: pick((run) => run.trace.estiloMs),
      layoutMs: pick((run) => run.trace.layoutMs),
      paintMs: pick((run) => run.trace.paintMs),
      composicaoMs: pick((run) => run.trace.composicaoMs),
      scriptMs: pick((run) => run.trace.scriptMs),
      estiloPorQuadroMs: pick((run) => run.porQuadro.estiloMs),
      layoutPorQuadroMs: pick((run) => run.porQuadro.layoutMs),
      paintPorQuadroMs: pick((run) => run.porQuadro.paintMs),
      longTasks: pick((run) => run.longTasks.count),
      longTasksMs: pick((run) => run.longTasks.totalMs),
    }
  }
  return summary
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

async function waitForCdp(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`O CDP não abriu em ${timeoutMs} ms${lastError ? ` (${lastError.message})` : ''}.`)
}

function electronBinary(appDir) {
  // O pacote `electron` exporta o caminho do binário quando importado pelo Node.
  return require(require.resolve('electron', { paths: [appDir] }))
}

async function launchApp(options) {
  const indexPath = path.join(options.appDir, 'dist', 'index.html')
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Build do renderer ausente: ${indexPath}. Rode \`npx vite build\` em ${options.appDir}.`)
  }
  const port = await freePort()
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-ui-render-'))
  const env = gpuEnvironment(options.gpu)
  delete env.VITE_DEV_SERVER_URL
  delete env.ELECTRON_RUN_AS_NODE
  Object.assign(env, {
    FELIXO_DEVTOOLS_PORT: String(port),
    FELIXO_USER_DATA_DIR: userData,
    // Janela visível: escondida, o Chromium estrangula o requestAnimationFrame.
    FELIXO_DEVTOOLS_HEADLESS: '0',
    FELIXO_DEVTOOLS_MOCK_PTY: '1',
    // Sem pedido explícito, a instância com porta CDP rasteriza por software
    // (ver `shouldUseSoftwareRendering` em electron/core/graphics-mode.cjs).
    FELIXO_GRAPHICS_MODE: options.render === 'software' ? 'software' : 'hardware',
  })
  const args = ['.', ...(process.platform === 'linux' ? ['--no-sandbox'] : []), ...chromiumArgs(options)]
  const child = spawn(electronBinary(options.appDir), args, {
    cwd: options.appDir,
    env,
    detached: process.platform !== 'win32',
    stdio: 'ignore',
  })
  let exited = null
  child.once('exit', (code, signal) => { exited = { code, signal } })
  try {
    await waitForCdp(port, options.launchTimeoutMs)
  } catch (error) {
    stopApp({ child, userData })
    if (exited) error.message += ` O Electron encerrou antes (código ${exited.code}, sinal ${exited.signal}).`
    throw error
  }
  return { child, port, userData }
}

function stopApp({ child, userData }) {
  if (child?.pid) {
    try {
      if (process.platform === 'win32') child.kill()
      else process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Já encerrou.
    }
  }
  if (userData) {
    try {
      fs.rmSync(userData, { recursive: true, force: true })
    } catch (error) {
      // Mesmo caso da bancada de bundle: o perfil pode seguir preso até o
      // processo terminar de sair. Pasta temporária não é falha de medição.
      console.warn(`[ui-render] pasta temporária não removida (${error.code ?? error.message}): ${userData}`)
    }
  }
}

async function findAppPage(browser, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const context of browser.contexts()) {
      const page = context.pages().find((candidate) => /index\.html/.test(candidate.url()))
      if (page) return page
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('A janela principal do app não apareceu.')
}

async function waitHydrated(page, nodeIds, timeoutMs) {
  await page.waitForFunction(
    (ids) => document.querySelector('[data-felixo-hydrated="true"]') !== null
      && ids.every((id) => document.querySelector(`[data-id="${id}"]`)),
    nodeIds,
    { timeout: timeoutMs },
  )
}

async function readGpuInfo(browser) {
  const session = await browser.newBrowserCDPSession()
  try {
    const info = await session.send('SystemInfo.getInfo')
    const devices = info.gpu?.devices ?? []
    const active = devices.find((device) => device.active) ?? devices[0] ?? null
    return {
      renderer: info.gpu?.auxAttributes?.glRenderer ?? null,
      vendor: info.gpu?.auxAttributes?.glVendor ?? null,
      glImplementation: info.gpu?.auxAttributes?.glImplementationParts ?? info.gpu?.auxAttributes?.glImplementation ?? null,
      ativa: active ? { vendorId: active.vendorId, deviceId: active.deviceId, vendorString: active.vendorString, deviceString: active.deviceString } : null,
      featureStatus: info.gpu?.featureStatus ?? null,
    }
  } finally {
    await session.detach().catch(() => {})
  }
}

async function populateCanvas(page, nodes, edges) {
  const result = await page.evaluate(async ({ nodes: fixtureNodes, edges: fixtureEdges }) => {
    const bridge = window.felixo?.canvas
    if (!bridge) return { ok: false, message: 'ponte window.felixo.canvas indisponível' }
    const cleared = await bridge.clear()
    if (!cleared?.ok) return { ok: false, message: cleared?.message || 'limpeza do canvas falhou' }
    for (const node of fixtureNodes) {
      const saved = await bridge.save(node)
      if (!saved?.ok) return { ok: false, message: saved?.message || `persistência falhou: ${node.id}` }
    }
    for (const edge of fixtureEdges) {
      const saved = await bridge.saveEdge(edge)
      if (!saved?.ok) return { ok: false, message: saved?.message || `conexão falhou: ${edge.id}` }
    }
    return { ok: true }
  }, { nodes, edges })
  if (!result.ok) throw new Error(`[ui-render] fixture: ${result.message}`)
}

async function collectTrace(cdp, action) {
  const events = []
  const onData = (payload) => { events.push(...payload.value) }
  cdp.on('Tracing.dataCollected', onData)
  const completed = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve))
  await cdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing'] },
  })
  let actionResult
  try {
    actionResult = await action()
  } finally {
    await cdp.send('Tracing.end')
    await completed
    cdp.off('Tracing.dataCollected', onData)
  }
  return { events, actionResult }
}

/** A interação medida: a MESMA sequência em todas as rodadas. */
async function interact(page, durationMs) {
  await page.evaluate(() => {
    window.__felixoUiRender = { intervals: [], longTasks: [], running: true }
    const state = window.__felixoUiRender
    let last = performance.now()
    const tick = (now) => {
      state.intervals.push(now - last)
      last = now
      if (state.running) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    try {
      state.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) state.longTasks.push(entry.duration)
      })
      state.observer.observe({ type: 'longtask', buffered: false })
    } catch {
      state.observer = null
    }
  })

  const pane = await page.locator('.react-flow__pane').boundingBox()
  const centerX = pane ? pane.x + pane.width / 2 : 600
  const centerY = pane ? pane.y + pane.height / 2 : 400
  const headings = page.locator('[data-felixo-region="sidebar"] button[aria-expanded]')
  const startedAt = Date.now()
  let step = 0
  while (Date.now() - startedAt < durationMs) {
    const phase = step % 8
    if (phase < 2) {
      await page.mouse.move(centerX, centerY)
      await page.mouse.wheel(0, phase === 0 ? -240 : 240)
    } else if (phase < 4) {
      // Pan com o botão do meio, o gesto de mover a tela no modo seleção.
      await page.mouse.move(centerX, centerY)
      await page.mouse.down({ button: 'middle' })
      await page.mouse.move(centerX + (phase === 2 ? 180 : -180), centerY + 60, { steps: 8 })
      await page.mouse.up({ button: 'middle' })
    } else if (phase < 6) {
      const count = await headings.count()
      if (count > 0) await headings.nth(step % count).click({ timeout: 2_000 }).catch(() => {})
    } else {
      const node = page.locator('.react-flow__node').nth(step % 6)
      const box = await node.boundingBox().catch(() => null)
      if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 })
    }
    step += 1
    await page.waitForTimeout(60)
  }

  return page.evaluate(() => {
    const state = window.__felixoUiRender
    state.running = false
    state.observer?.disconnect()
    return {
      intervals: state.intervals.slice(1),
      longTasks: state.longTasks,
    }
  })
}

async function measureRun(page, cdp, { mode, round, durationMs }) {
  const { events, actionResult } = await collectTrace(cdp, () => interact(page, durationMs))
  const rendererPid = rendererPidFromTrace(events)
  const frames = frameStats(actionResult.intervals, durationMs)
  const trace = summarizeTrace(events, rendererPid)
  return {
    round,
    mode,
    frames,
    trace,
    // O modo que desenha mais quadros soma mais paint no total só por isso;
    // o custo por quadro é o que compara duas folhas de estilo.
    porQuadro: perFrame(trace, frames.frames),
    longTasks: {
      count: actionResult.longTasks.length,
      totalMs: Number(actionResult.longTasks.reduce((total, value) => total + value, 0).toFixed(3)),
    },
  }
}

async function run(options) {
  let chromium
  try {
    ({ chromium } = require(require.resolve('playwright-core', { paths: [options.appDir, __dirname] })))
  } catch {
    throw new Error('playwright-core não está instalado. Rode `npm install` em app/.')
  }
  const nodes = buildFixtureNodes(options.nodes)
  const edges = buildFixtureEdges(nodes)
  const nodeIds = nodes.map((node) => node.id)
  const app = await launchApp(options)
  let browser
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${app.port}`)
    const page = await findAppPage(browser, options.launchTimeoutMs)
    await page.waitForFunction(() => document.querySelector('[data-felixo-hydrated="true"]') !== null, null, { timeout: options.launchTimeoutMs })
    await populateCanvas(page, nodes, edges)
    const gpu = await readGpuInfo(browser)
    console.log(`[ui-render] GPU: ${gpu.renderer ?? 'desconhecida'} (${gpu.vendor ?? 's/ fornecedor'})`)
    if (options.render === 'gpu') assertRequestedGpu(options.gpu, gpu)
    // O domínio Tracing é do alvo browser, não da página: o trace sai de todos
    // os processos e `rendererPidFromTrace` isola o renderer da janela medida.
    const cdp = await browser.newBrowserCDPSession()
    const runs = []
    for (const { round, mode } of roundOrder(options.rounds)) {
      await page.evaluate(({ key, value }) => window.localStorage.setItem(key, value), { key: PERFORMANCE_MODE_STORAGE_KEY, value: mode })
      await page.reload()
      await waitHydrated(page, nodeIds, options.launchTimeoutMs)
      const applied = await page.evaluate(() => document.documentElement.getAttribute('data-performance-mode'))
      if ((applied === 'on') !== (mode === 'on')) {
        throw new Error(`[ui-render] o app não aplicou o modo ${mode} (data-performance-mode=${applied}).`)
      }
      await page.waitForTimeout(1_500)
      const measured = await measureRun(page, cdp, { mode, round, durationMs: options.durationMs })
      runs.push(measured)
      console.log(
        `[ui-render] rodada ${round} modo=${mode}: fps=${measured.frames.fps} p95=${measured.frames.p95Ms}ms >25ms=${measured.frames.acimaDe25Ms} ` +
        `estilo=${measured.trace.estiloMs}ms layout=${measured.trace.layoutMs}ms paint=${measured.trace.paintMs}ms longTasks=${measured.longTasks.count}`,
      )
    }
    const report = {
      generatedAt: new Date().toISOString(),
      platform: `${process.platform}-${process.arch}`,
      cpus: os.cpus().length,
      appDir: options.appDir,
      gpuSolicitada: options.gpu,
      render: options.render,
      angle: options.angle,
      gpu,
      config: { rounds: options.rounds, durationMs: options.durationMs, nodes: nodes.length, edges: edges.length },
      runs,
      summary: summarizeRuns(runs),
    }
    if (options.out) {
      fs.mkdirSync(path.dirname(options.out), { recursive: true })
      fs.writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`)
    }
    for (const [mode, data] of Object.entries(report.summary)) {
      console.log(`[ui-render] mediana modo=${mode}: ${JSON.stringify(data)}`)
    }
    return report
  } finally {
    await browser?.close().catch(() => {})
    stopApp(app)
  }
}

if (require.main === module) {
  run(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(`[ui-render] ${error instanceof Error ? error.stack || error.message : String(error)}`)
    process.exitCode = 1
  })
}

module.exports = {
  PERFORMANCE_MODE_STORAGE_KEY,
  assertRequestedGpu,
  buildFixtureEdges,
  buildFixtureNodes,
  chromiumArgs,
  frameStats,
  gpuEnvironment,
  parseArgs,
  percentile,
  perFrame,
  rendererPidFromTrace,
  roundOrder,
  summarizeRuns,
  summarizeTrace,
}
