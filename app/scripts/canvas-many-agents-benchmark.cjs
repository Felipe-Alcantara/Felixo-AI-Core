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
 * ~20 linhas/s, com o painel de busca aberto, em três fases de `--duration-ms`
 * cada: gaveta fechada (girando o zoom), gaveta de um agente aberta (girando o
 * zoom e digitando no xterm dela) e arrasto de um bloco com a gaveta fechada.
 *
 * Mede abertura, carga, refresh com os agentes vivos, queda do renderer, RSS
 * de todos os processos (`app.getAppMetrics`), heap, DOM, listeners e timers
 * em pontos de controle e o tempo até a virtualização voltar depois de fechar
 * a gaveta. Por fase: frame, long task, entrada → quadro, tecla → eco (só com
 * a gaveta aberta), nós montados e quantos estão fora da área do canvas, e
 * mutações de DOM dentro deles por segundo. O primeiro resultado usa os campos
 * do `terminal-scrollback` (`resumeMs`, `rendererWorkingSetMiB`,
 * `heapBefore`/`heapAfterStream`) e cada fase vira um resultado próprio
 * (`canvas-many-agents:<fase>`), então o `benchmark-regression-gate.cjs`
 * compara dois relatórios à mão, inclusive frame, long task e eco.
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
// Letras que nem o roteiro ("linha N de 60 da saída em streaming") nem o eco do gatilho imprimem.
const ECHO_KEYS = Object.freeze(['q', 'z', 'w'])
const DRAG_DISTANCE_PX = 120
const DRAG_STEPS = 12
const DRAWER_CLOSE_TIMEOUT_MS = 15_000
const TYPING_TERMINAL_ID = 'bench-digitacao'
// Passos de roda (-240) a partir do enquadramento inicial: com tudo enquadrado nada fica fora da área,
// e a virtualização que a gaveta aberta desliga não apareceria na medição.
const ZOOM_IN_STEPS = 6

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

function terminalNode(id, label, x) {
  return {
    id,
    type: 'terminal',
    position: { x, y: -480 },
    width: 520,
    height: 360,
    data: { label, command: 'mock', args: [], cwd: '', launchMode: 'agent' },
  }
}

/**
 * Agentes numa faixa acima dos blocos comuns, cada um ligado a uma nota, e um
 * terminal parado para a digitação: no PTY falso o eco entra na fila atrás do
 * roteiro, então digitar num agente que transmite mediria a fila, não o app.
 */
function buildFixture(agentCount, nodeCount) {
  const fillers = ui.buildFixtureNodes(nodeCount)
  const agents = Array.from({ length: agentCount }, (_, index) => terminalNode(`bench-agente-${index}`, `Agente ${index}`, index * 560))
  const typing = terminalNode(TYPING_TERMINAL_ID, 'Digitação', -560)
  const notes = fillers.filter((node) => node.type === 'note')
  const links = notes.length
    ? agents.map((agent, index) => ({ id: `bench-ligacao-${index}`, source: agent.id, target: notes[index % notes.length].id }))
    : []
  return {
    nodes: [...agents, typing, ...fillers],
    edges: [...ui.buildFixtureEdges(fillers), ...links],
    agentIds: agents.map((agent) => agent.id),
    typingId: typing.id,
  }
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

/** Resultado de uma fase, no formato que o `benchmark-regression-gate.cjs` compara (`phase`+`count`+`nodes`). */
function summarizePhase(phase, scenario, frameReliable) {
  const seconds = phase.elapsedMs / 1_000
  return {
    phase: `canvas-many-agents:${phase.phase}`,
    ...scenario,
    frameReliable,
    frameMs: stats(phase.frames),
    longTaskMs: stats(phase.longTasks),
    inputToFrameMs: stats(phase.input),
    keyEchoMs: stats(phase.keyEcho),
    mountedNodes: stats(phase.mounted),
    mountedOutsideViewport: stats(phase.mountedOutside),
    outsideMutationsPerSecond: seconds > 0 ? Number((phase.outsideMutations / seconds).toFixed(1)) : null,
    // Controle: mutações nos blocos à vista. Sem elas, um zero fora da área não provaria nada.
    insideMutationsPerSecond: seconds > 0 ? Number((phase.insideMutations / seconds).toFixed(1)) : null,
    rendererWorkingSetMiB: stats(phase.rss.map((sample) => sample.rendererMiB)),
  }
}

/** Falhas do `--check` de um resultado: queda, agente mudo e as metas da política. */
function checkReport(result) {
  const failures = []
  const label = result.phase && result.phase !== 'canvas-many-agents' ? ` [${result.phase.replace('canvas-many-agents:', '')}]` : ''
  if (result.crashed) failures.push(`o renderer caiu (${result.crashed})`)
  if (Number.isFinite(result.agentsWithOutput) && result.agentsWithOutput < result.count) {
    failures.push(`só ${result.agentsWithOutput} de ${result.count} agentes produziram saída`)
  }
  const budget = BUDGETS[result.budgetScenario]
  if (!budget) return failures
  if (result.frameReliable && result.frameMs?.p95 > budget.frameP95Ms) {
    failures.push(`frame p95 ${result.frameMs.p95} ms acima da meta ${budget.frameP95Ms} ms (${result.budgetScenario})${label}`)
  }
  if (result.longTaskMs?.p95 > budget.longTaskP95Ms) {
    failures.push(`long task p95 ${result.longTaskMs.p95} ms acima da meta ${budget.longTaskP95Ms} ms (${result.budgetScenario})${label}`)
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

/**
 * Coletores de uma fase, desligados no fim dela (o observador de long task da
 * versão anterior ficava vivo e somaria as fases seguintes):
 * - intervalos entre quadros, long tasks e entrada → quadro (roda e ponteiro);
 * - tecla → eco: do `keydown` de uma das `echoKeys` ao quadro seguinte à
 *   chegada do eco dela pelo `pty:data` da sessão em foco;
 * - nós do React Flow montados, e quantos estão fora da área do canvas (a
 *   gaveta aberta desliga a virtualização), amostrados a cada segundo;
 * - mutações de DOM dentro desses nós fora da área: os renders que chegam à tela.
 */
async function startCollectors(page, echoSessionId = null) {
  await page.evaluate(({ echoSessionId: watchedSession, echoKeys }) => {
    const collected = {
      running: true,
      startedAt: performance.now(),
      frames: [],
      longTasks: [],
      input: [],
      keyEcho: [],
      mounted: [],
      mountedOutside: [],
      outsideMutations: 0,
      insideMutations: 0,
    }
    window.__felixoManyAgentsRun = collected
    let last = performance.now()
    const tick = (now) => {
      collected.frames.push(now - last)
      last = now
      if (collected.running) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    const longTasks = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) collected.longTasks.push(entry.duration)
    })
    longTasks.observe({ type: 'longtask' })
    // Entrada → próximo quadro: do carimbo do evento ao rAF seguinte.
    const onInput = (event) => {
      requestAnimationFrame((now) => collected.input.push(now - event.timeStamp))
    }
    window.addEventListener('wheel', onInput, { capture: true, passive: true })
    window.addEventListener('pointermove', onInput, { capture: true, passive: true })

    const pendingKeys = new Map()
    const onKey = (event) => {
      if (echoKeys.includes(event.key)) pendingKeys.set(event.key, event.timeStamp)
    }
    window.addEventListener('keydown', onKey, true)
    const stopEcho = watchedSession
      ? window.felixo.pty.onData((payload) => {
          if (pendingKeys.size === 0 || payload?.sessionId !== watchedSession) return
          const data = String(payload.data ?? '')
          for (const [key, pressedAt] of pendingKeys) {
            if (!data.includes(key)) continue
            pendingKeys.delete(key)
            requestAnimationFrame((now) => collected.keyEcho.push(now - pressedAt))
          }
        })
      : null

    const flow = document.querySelector('.react-flow')
    let outside = new Set()
    const sampleMounted = () => {
      const area = flow.getBoundingClientRect()
      const nodes = flow.querySelectorAll('.react-flow__node')
      outside = new Set()
      for (const node of nodes) {
        const rect = node.getBoundingClientRect()
        if (rect.right < area.left || rect.left > area.right || rect.bottom < area.top || rect.top > area.bottom) {
          outside.add(node)
        }
      }
      collected.mounted.push(nodes.length)
      collected.mountedOutside.push(outside.size)
    }
    sampleMounted()
    const sampler = setInterval(sampleMounted, 1_000)
    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        const element = record.target.nodeType === 1 ? record.target : record.target.parentElement
        const owner = element?.closest('.react-flow__node')
        if (!owner) continue
        if (outside.has(owner)) collected.outsideMutations += 1
        else collected.insideMutations += 1
      }
    })
    mutations.observe(flow, { subtree: true, childList: true, attributes: true, characterData: true })

    collected.dispose = () => {
      longTasks.disconnect()
      mutations.disconnect()
      clearInterval(sampler)
      window.removeEventListener('wheel', onInput, true)
      window.removeEventListener('pointermove', onInput, true)
      window.removeEventListener('keydown', onKey, true)
      stopEcho?.()
    }
  }, { echoSessionId, echoKeys: ECHO_KEYS })
}

async function stopCollectors(page) {
  return page.evaluate(() => {
    const collected = window.__felixoManyAgentsRun
    collected.running = false
    collected.dispose()
    return {
      elapsedMs: performance.now() - collected.startedAt,
      frames: collected.frames.slice(1),
      longTasks: collected.longTasks,
      input: collected.input,
      keyEcho: collected.keyEcho,
      mounted: collected.mounted,
      mountedOutside: collected.mountedOutside,
      outsideMutations: collected.outsideMutations,
      insideMutations: collected.insideMutations,
    }
  })
}

async function writeToAgents(page, agentIds) {
  await page.evaluate(({ ids, data }) => Promise.all(
    ids.map((id) => window.felixo.pty.write({ sessionId: `canvas:${id}`, data })),
  ), { ids: agentIds, data: `${SMOKE_STREAM_TRIGGER}\r` })
}

async function openSearchPanel(page) {
  await page.getByRole('button', { name: 'Buscar' }).first().click()
  await page.locator('[data-felixo-canvas-panel="search"]').waitFor({ state: 'visible' })
}

/** Abre a gaveta do agente e põe o foco no xterm dela, onde as teclas da medição de eco vão cair. */
async function openDrawer(page, agentId) {
  // Pelo DOM: o bloco pode estar fora da área visível do canvas.
  await page.locator(`[data-terminal-expand-trigger="${agentId}"]`).first().dispatchEvent('click')
  const drawer = page.locator('[data-canvas-terminal-drawer]')
  await drawer.waitFor({ state: 'visible' })
  await drawer.locator('.xterm-helper-textarea').first().focus()
}

/**
 * Fecha a gaveta e devolve quanto a virtualização levou para voltar: até sair
 * algum bloco montado (com o zoom de `zoomIn`, quase todos ficam fora da área).
 * Não "até o número da fase fechada": fechar a gaveta pode mover a vista e
 * mostrar um bloco a mais, e a espera nunca terminaria.
 */
async function closeDrawer(page, totalNodes, timeoutMs) {
  const startedAt = performance.now()
  await page.locator('[data-canvas-terminal-drawer] [aria-label="Fechar terminal"]').first().click()
  await page.locator('[data-canvas-terminal-drawer]').waitFor({ state: 'hidden', timeout: timeoutMs })
  try {
    await page.waitForFunction(
      (total) => document.querySelectorAll('.react-flow__node').length < total,
      totalNodes,
      { timeout: timeoutMs },
    )
  } catch {
    const mounted = await page.evaluate(() => document.querySelectorAll('.react-flow__node').length)
    throw new Error(`a virtualização não voltou em ${timeoutMs} ms depois de fechar a gaveta: ${mounted} de ${totalNodes} blocos montados.`)
  }
  return Number((performance.now() - startedAt).toFixed(1))
}

/**
 * Um ponto onde a roda cai no próprio canvas (fundo ou bloco), e não num
 * painel ou na gaveta por cima dele: do centro para fora, pelo teste de toque.
 */
async function canvasPoint(page) {
  const point = await page.evaluate(() => {
    const flow = document.querySelector('.react-flow')
    const area = flow.getBoundingClientRect()
    const onCanvas = (x, y) => {
      const hit = document.elementFromPoint(x, y)
      return Boolean(hit && flow.contains(hit) && !hit.closest('.nowheel, [data-felixo-canvas-panel], [data-canvas-terminal-drawer]'))
    }
    for (let ring = 0; ring <= 4; ring += 1) {
      for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
        const x = area.left + area.width * (0.5 + (dx * ring) / 10)
        const y = area.top + area.height * (0.5 + (dy * ring) / 10)
        if (onCanvas(x, y)) return { x, y }
      }
    }
    return null
  })
  if (!point) throw new Error('nenhum ponto livre do canvas para a roda.')
  return point
}

/** Zoom atual do React Flow, lido do `transform` da viewport. */
async function readZoom(page) {
  return page.evaluate(() => {
    const transform = getComputedStyle(document.querySelector('.react-flow__viewport')).transform
    return transform && transform !== 'none' ? Number(new DOMMatrix(transform).a.toFixed(3)) : 1
  })
}

/**
 * Aproxima o zoom, sempre os mesmos passos, até a maior parte dos blocos sair
 * da área. A roda gira logo abaixo do bloco `anchorId`, no fundo do canvas: o
 * ponto sob o cursor fica parado, então o bloco segue à vista (e montado).
 */
async function zoomIn(page, anchorId) {
  const before = await readZoom(page)
  const anchor = await page.evaluate((id) => {
    const flow = document.querySelector('.react-flow')
    const rect = document.querySelector(`.react-flow__node[data-id="${id}"]`)?.getBoundingClientRect()
    if (!rect) return null
    const x = rect.left + rect.width / 2
    const y = rect.bottom + 4
    const hit = document.elementFromPoint(x, y)
    return hit && flow.contains(hit) && !hit.closest('.nowheel, [data-felixo-canvas-panel]') ? { x, y } : null
  }, anchorId)
  const point = anchor ?? (await canvasPoint(page))
  await page.mouse.move(point.x, point.y)
  for (let step = 0; step < ZOOM_IN_STEPS; step += 1) {
    await page.mouse.wheel(0, -240)
    await page.waitForTimeout(100)
  }
  await page.waitForTimeout(500)
  return { before, after: await readZoom(page) }
}

/** Um bloco comum à vista, pela alça de arrasto (a mesma escolha do `ui-render`). */
async function findDragTarget(page) {
  // Com todos os blocos enquadrados a alça fica pequena demais: aproxima no centro até uma servir.
  const point = await canvasPoint(page)
  await page.mouse.move(point.x, point.y)
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const target = await pickDragTarget(page)
    if (target) return target
    await page.mouse.wheel(0, -240)
    await page.waitForTimeout(150)
  }
  throw new Error('nenhum bloco à vista recebeu o ponteiro para o arrasto.')
}

async function pickDragTarget(page) {
  return page.evaluate((distance) => {
    const canvas = document.querySelector('.react-flow')
    for (const node of document.querySelectorAll('.react-flow__node')) {
      if (node.matches('.react-flow__node-terminal')) continue
      const handle = node.querySelector('.canvas-node-drag')
      if (!handle) continue
      const rect = handle.getBoundingClientRect()
      const x = rect.left + Math.min(3, rect.width / 5)
      const y = rect.top + rect.height / 2
      if (rect.width < 8 || rect.height < 5 || x + distance >= innerWidth) continue
      const hit = document.elementFromPoint(x, y)
      const endHit = document.elementFromPoint(x + distance, y)
      if (hit?.closest('.react-flow__node') === node && !hit.closest('.nodrag') && endHit && canvas.contains(endHit)) {
        return { id: node.getAttribute('data-id'), x, y }
      }
    }
    return null
  }, DRAG_DISTANCE_PX)
}

/**
 * Uma fase da carga: os agentes recebem o gatilho de streaming a cada 3 s e,
 * conforme a fase, a medição gira o zoom (gaveta fechada ou aberta, esta com
 * uma tecla a cada volta no xterm da gaveta, apagada em seguida para o
 * gatilho seguinte não ficar na mesma linha) ou arrasta um bloco de um lado
 * para o outro.
 */
async function runPhase(page, phase, { agentIds, durationMs, echoSessionId = null, dragTarget = null }) {
  const rss = []
  const point = await canvasPoint(page)
  if (!dragTarget) await page.mouse.move(point.x, point.y)
  await startCollectors(page, echoSessionId)
  const startedAt = performance.now()
  let nextStream = 0
  let nextRss = 0
  let direction = 1
  let keyIndex = 0
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
    if (dragTarget) {
      const offset = direction > 0 ? DRAG_DISTANCE_PX : 0
      await page.mouse.move(dragTarget.x + DRAG_DISTANCE_PX - offset, dragTarget.y)
      await page.mouse.down()
      await page.mouse.move(dragTarget.x + offset, dragTarget.y, { steps: DRAG_STEPS })
      await page.mouse.up()
      await page.waitForTimeout(WHEEL_INTERVAL_MS / 2)
    } else {
      await page.mouse.wheel(0, 120 * direction)
      if (echoSessionId) await page.keyboard.press(ECHO_KEYS[keyIndex++ % ECHO_KEYS.length])
      await page.waitForTimeout(WHEEL_INTERVAL_MS)
      if (echoSessionId) await page.keyboard.press('Backspace')
    }
    direction = -direction
  }
  return { phase, ...(await stopCollectors(page)), rss }
}

async function run(options) {
  const { chromium } = require(require.resolve('playwright-core', { paths: [options.appDir, __dirname] }))
  const { nodes, edges, agentIds, typingId } = buildFixture(options.agents, options.nodes)
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
    await openSearchPanel(page)
    const zoom = await zoomIn(page, typingId)
    checkpoints.push(await checkpoint(page, cdp, 'carregado'))

    // Gaveta fechada, gaveta aberta (com tecla → eco no xterm dela) e arrasto com a gaveta fechada de novo.
    const phases = [await runPhase(page, 'gaveta-fechada', { agentIds, durationMs: options.durationMs })]
    await openDrawer(page, typingId)
    phases.push(await runPhase(page, 'gaveta-aberta', {
      agentIds,
      durationMs: options.durationMs,
      echoSessionId: `canvas:${typingId}`,
    }))
    const virtualizationRestoreMs = await closeDrawer(page, nodes.length, DRAWER_CLOSE_TIMEOUT_MS)
    phases.push(await runPhase(page, 'arrasto', {
      agentIds,
      durationMs: options.durationMs,
      dragTarget: await findDragTarget(page),
    }))
    const agentsWithOutput = (await page.evaluate(() => window.__felixoManyAgents.sessionsWithOutput()))
      .filter((sessionId) => agentIds.includes(sessionId.replace(/^canvas:/, ''))).length
    checkpoints.push(await checkpoint(page, cdp, 'fim-da-carga'))

    await page.reload()
    const resumeMs = await waitLoaded(page, nodeIds, options.launchTimeoutMs)
    checkpoints.push(await checkpoint(page, cdp, 'apos-refresh'))

    const loaded = checkpoints.find((point) => point.name === 'carregado')
    const end = checkpoints.find((point) => point.name === 'fim-da-carga')
    const scenario = {
      count: options.agents,
      nodes: nodes.length,
      edges: edges.length,
      budgetScenario: budgetScenario(options.agents, options.nodes),
    }
    const frameReliable = idleFps >= MIN_IDLE_FPS
    report.results.push({
      phase: 'canvas-many-agents',
      ...scenario,
      startupMs,
      loadMs,
      resumeMs,
      idleFps,
      frameReliable,
      virtualizationRestoreMs,
      zoom,
      rendererWorkingSetMiB: stats(phases.flatMap((item) => item.rss.map((sample) => sample.rendererMiB))),
      appWorkingSetMiB: stats(phases.flatMap((item) => item.rss.map((sample) => sample.appMiB))),
      heapBefore: { usedJsHeapBytes: loaded.jsHeapUsedBytes },
      heapAfterStream: { usedJsHeapBytes: end.jsHeapUsedBytes },
      agentsWithOutput,
      checkpoints,
      crashed,
    })
    for (const item of phases) report.results.push(summarizePhase(item, scenario, frameReliable))
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
  const [result, ...phases] = report.results
  const output = options.out ?? path.join(options.appDir, `canvas-many-agents-${process.platform}.json`)
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`[many-agents] ${result.count} agentes, ${result.nodes} blocos, ${result.edges} conexões: abertura ${result.startupMs} ms, carga ${result.loadMs} ms, refresh ${result.resumeMs} ms`)
  console.log(`[many-agents] ocioso ${result.idleFps} fps${result.frameReliable ? '' : ' (janela estrangulada: frame não conta)'}; zoom ${result.zoom.before} → ${result.zoom.after}; virtualização de volta ${result.virtualizationRestoreMs} ms depois de fechar a gaveta`)
  for (const phase of phases) {
    const echo = phase.keyEchoMs.count ? `, tecla → eco p95 ${phase.keyEchoMs.p95} ms (${phase.keyEchoMs.count})` : ''
    console.log(`[many-agents] ${phase.phase.replace('canvas-many-agents:', '')}: frame p95 ${phase.frameMs.p95} ms, long task p95 ${phase.longTaskMs.p95} ms, entrada → quadro p95 ${phase.inputToFrameMs.p95} ms${echo}; montados ${phase.mountedNodes.max} (fora da área ${phase.mountedOutsideViewport.max}), mutações fora da área ${phase.outsideMutationsPerSecond}/s (à vista ${phase.insideMutationsPerSecond}/s)`)
  }
  console.log(`[many-agents] RSS p95: renderer ${result.rendererWorkingSetMiB.p95} MiB, app ${result.appWorkingSetMiB.p95} MiB; agentes com saída ${result.agentsWithOutput}/${result.count}`)
  console.log(`[many-agents] relatório: ${output}`)
  if (options.check) {
    const failures = report.results.flatMap(checkReport)
    if (failures.length) {
      for (const failure of failures) console.error(`[many-agents] FALHA: ${failure}`)
      process.exitCode = 1
    } else {
      console.log(`[many-agents] --check ok (${result.budgetScenario ?? 'acima do orçamento: só queda e saída dos agentes'})`)
    }
  }
}

module.exports = { BUDGETS, ECHO_KEYS, budgetScenario, buildFixture, checkReport, instrumentPage, parseArgs, stats, summarizePhase }

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`[many-agents] ${error.stack || error.message}`)
    process.exitCode = 1
  })
}
