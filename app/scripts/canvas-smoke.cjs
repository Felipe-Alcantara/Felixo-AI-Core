'use strict'

/**
 * Smoke de interacoes do Canvas. A sessao DevTools e isolada e o PTY fake e
 * ativado antes do Electron iniciar, por isso nenhum CLI real e executado.
 * O fluxo cobre mount/hidratacao, todos os tipos persistidos, hit testing,
 * foco/Tab/Escape, arrasto pequeno, conexao, gaveta, URL invalida e reload.
 */

const path = require('node:path')
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const { connect, readState } = require('../electron/cli/felixo-devtools.cjs')
const { diagnosticarMontagem } = require('./canvas-smoke-diagnostics.cjs')
const { esperarAte } = require('./canvas-smoke-wait.cjs')
const {
  DEFAULT_JITTER_THRESHOLD,
  measureStableGeometry,
} = require('./canvas-smoke-visual.cjs')

const APP_DIR = path.resolve(__dirname, '..')
const FELIXO_CLI = path.join(APP_DIR, 'electron', 'cli', 'felixo.cjs')
const MIN_VIEWPORT = { width: 375, height: 667 }
// Windows e Linux/Xvfb podem levar mais de 20 s para reidratar a fixture visual
// completa (9 nós, incluindo Excalidraw e terminais fake). O tempo de cada
// montagem continua registrado no log para separar lentidão de falha real.
const HYDRATION_TIMEOUT_MS =
  process.platform === 'win32' || process.platform === 'linux' ? 45_000 : 20_000
// Espera por uma reação da interface (abrir painel, fechar gaveta...). 5 s falhou
// 6 vezes no runner Windows (PRs #48, #55 e a main do #66 em 20/09); o screenshot
// da última mostrou o painel de busca ABERTO, só que depois do teto — lentidão do
// runner (o painel é um chunk carregado sob demanda), não painel quebrado.
const INTERACTION_TIMEOUT_MS = process.platform === 'win32' ? 20_000 : 5_000
const DEVTOOLS_LAUNCH_TIMEOUT_MS = 60_000
const THEME_STORAGE_KEY = 'felixo-ai-core.theme'
const VISUAL_THEMES = ['dark', 'high_contrast']
const VISUAL_VIEWPORT_CASES = [
  { width: 320, height: 720, deviceScaleFactor: 1 },
  { width: 320, height: 720, deviceScaleFactor: 2 },
  { width: 768, height: 900, deviceScaleFactor: 1 },
  { width: 1280, height: 800, deviceScaleFactor: 1 },
  { width: 1280, height: 800, deviceScaleFactor: 2 },
  { width: 3840, height: 2160, deviceScaleFactor: 1 },
  { width: 3840, height: 2160, deviceScaleFactor: 2 },
]
const CORE_LAYOUT_SELECTORS = [
  '[data-felixo-region="topbar"]',
  '[data-felixo-region="sidebar"]',
  '[data-felixo-region="canvas"]',
  '.felixo-canvas-statusbar',
]
const visualReport = {
  schemaVersion: 1,
  thresholdCssPx: DEFAULT_JITTER_THRESHOLD,
  sampling: {
    settleFrames: 4,
    interactionSampledFrames: 12,
    matrixSampledFrames: 16,
    settleToleranceCssPx: 0.25,
  },
  themes: VISUAL_THEMES,
  viewportCases: VISUAL_VIEWPORT_CASES,
  scenarios: [],
}

const FIXTURE_NODES = [
  {
    id: 'fixture-group',
    type: 'group',
    position: { x: 0, y: 0 },
    width: 480,
    height: 320,
    data: { label: 'Grupo fixture' },
  },
  {
    id: 'fixture-file',
    type: 'file',
    position: { x: 560, y: 0 },
    width: 320,
    height: 260,
    data: { fileName: 'fixture.md', label: 'Arquivo fixture', mode: 'scratchpad' },
  },
  {
    id: 'fixture-note',
    type: 'note',
    position: { x: 920, y: 0 },
    width: 220,
    height: 160,
    data: { label: 'Nota fixture', text: 'Interacao do canvas' },
  },
  {
    id: 'fixture-note-2',
    type: 'note',
    position: { x: 920, y: 190 },
    width: 220,
    height: 160,
    data: { label: 'Segunda nota fixture', text: 'Estabilidade depois do resize' },
  },
  {
    id: 'fixture-drawing',
    type: 'drawing',
    position: { x: 0, y: 400 },
    width: 360,
    height: 280,
    data: { label: 'Desenho fixture', strokes: '' },
  },
  {
    id: 'fixture-excalidraw',
    type: 'excalidrawDrawing',
    position: { x: 420, y: 400 },
    width: 760,
    height: 560,
    data: { label: 'Excalidraw fixture', scene: '' },
  },
  {
    id: 'fixture-webpage',
    type: 'webpage',
    position: { x: 1240, y: 0 },
    width: 560,
    height: 420,
    data: { label: 'Web fixture', url: 'http://127.0.0.1:9/' },
  },
  {
    id: 'fixture-notion',
    type: 'notionTasks',
    position: { x: 0, y: 1040 },
    width: 1040,
    height: 680,
    data: { label: 'Notion fixture' },
  },
  {
    id: 'fixture-terminal',
    type: 'terminal',
    position: { x: 1240, y: 520 },
    width: 520,
    height: 360,
    data: { label: 'Agente fixture', command: 'mock', args: [], cwd: '', launchMode: 'agent' },
  },
]

function visualOutputPath(name) {
  return path.join(APP_DIR, 'build', 'canvas-visual-regression', process.platform, name)
}

function visualSlug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function writeVisualReport(error = null) {
  if (error) visualReport.failure = { message: error.message || String(error) }
  const output = visualOutputPath('report.json')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, JSON.stringify(visualReport, null, 2) + '\n')
  return output
}

async function waitForViewport(page, viewport) {
  await page.waitForFunction(
    ({ width, height }) => window.innerWidth === width && window.innerHeight === height,
    viewport,
    { timeout: INTERACTION_TIMEOUT_MS },
  )
}

async function recordVisualEvidence(page, label, selectors, details = {}, options = {}) {
  const measurement = await measureStableGeometry(page, label, selectors, options)
  const screenshotName = visualSlug(label) + '.png'
  const screenshotPath = visualOutputPath(screenshotName)
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true })
  await page.screenshot({ path: screenshotPath, scale: 'css', animations: 'disabled' })
  const scenario = {
    ...measurement,
    ...details,
    screenshot: path.relative(APP_DIR, screenshotPath),
  }
  visualReport.scenarios.push(scenario)
  console.log(
    '[canvas-visual] ' + label + ': ' + measurement.sampleCount +
    ' frames, limiar <= ' + measurement.thresholdCssPx + ' CSS px',
  )
  return scenario
}

async function selectVisualTheme(page, theme) {
  const current = await page.evaluate(() => document.documentElement.dataset.theme)
  if (current !== theme) {
    await page.evaluate(
      ({ key, value }) => window.localStorage.setItem(key, value),
      { key: THEME_STORAGE_KEY, value: theme },
    )
    await page.reload()
    await checarMontagem(page)
  }
  await page.waitForFunction(
    (expected) => document.documentElement.dataset.theme === expected,
    theme,
    { timeout: HYDRATION_TIMEOUT_MS },
  )
}

function runCli(args) {
  return execFileSync(process.execPath, [FELIXO_CLI, 'devtools', ...args], {
    cwd: APP_DIR,
    encoding: 'utf8',
  })
}

async function withDevtoolsSession(action) {
  const previousMockPty = process.env.FELIXO_DEVTOOLS_MOCK_PTY
  process.env.FELIXO_DEVTOOLS_MOCK_PTY = '1'
  // The geometry sampler needs real animation frames. A hidden Electron window
  // throttles requestAnimationFrame to background cadence and makes the visual
  // test wait on frames that are no longer being produced at display rate.
  runCli(['launch', '--visible', '--timeout', String(DEVTOOLS_LAUNCH_TIMEOUT_MS)])
  const launchedState = readState()
  try {
    return await action()
  } finally {
    try {
      runCli(['quit'])
    } catch (error) {
      console.warn(`[canvas-smoke] falha ao encerrar a sessao DevTools: ${error.message}`)
    }
    // Electron and Vite are detached into separate POSIX process groups.
    // `devtools quit` asks them to exit first; reap the groups so a stuck
    // renderer cannot consume the next CI attempt's CPU budget.
    if (process.platform !== 'win32') {
      for (const pid of [launchedState?.pid, launchedState?.vitePid]) {
        if (!pid) continue
        try {
          process.kill(-pid, 'SIGKILL')
        } catch {
          // The process group already exited normally.
        }
      }
    }
    if (previousMockPty === undefined) delete process.env.FELIXO_DEVTOOLS_MOCK_PTY
    else process.env.FELIXO_DEVTOOLS_MOCK_PTY = previousMockPty
  }
}

async function checarMontagem(page) {
  const started = Date.now()
  try {
    await page.waitForFunction(
      () => document.querySelector('[data-felixo-hydrated="true"]') !== null,
      null,
      { timeout: HYDRATION_TIMEOUT_MS },
    )
  } catch (error) {
    const info = await page
      .evaluate(() => {
        const root = document.querySelector('[data-felixo-canvas-ready]')
        return {
          rootPresent: root !== null,
          hydrated: root?.getAttribute('data-felixo-hydrated') ?? null,
          status: (document.querySelector('footer, [data-felixo-region="statusbar"]')?.textContent ?? '').trim().slice(0, 80),
        }
      })
      .catch(() => ({ rootPresent: false, hydrated: null, status: '(página indisponível)' }))
    throw new Error(`${diagnosticarMontagem(info, HYDRATION_TIMEOUT_MS)} Causa original: ${error.message.split('\n')[0]}`)
  }
  console.log(`[canvas-smoke] canvas pronto em ${Date.now() - started} ms (teto ${HYDRATION_TIMEOUT_MS} ms)`)
}

const LAYOUT_REGIONS = ['topbar', 'sidebar', 'canvas']

async function checarLandmarksVisiveis(page) {
  const rectangles = await page.evaluate((regions) =>
    regions.map((region) => {
      const element = document.querySelector(`[data-felixo-region="${region}"]`)
      if (!element) return { region, missing: true }
      const rect = element.getBoundingClientRect()
      return { region, width: rect.width, height: rect.height }
    }), LAYOUT_REGIONS)

  const missing = rectangles.filter((item) => item.missing).map((item) => item.region)
  if (missing.length > 0) {
    throw new Error(`[canvas-smoke] landmark(s) ausente(s): ${missing.join(', ')}`)
  }

  const collapsed = rectangles.filter((item) => item.width <= 0 || item.height <= 0)
  if (collapsed.length > 0) {
    throw new Error(`[canvas-smoke] landmark(s) colapsado(s): ${JSON.stringify(collapsed)}`)
  }
}

async function checarNavegacaoPorTab(page) {
  const canvas = page.locator('[data-felixo-region="canvas"]')
  await canvas.focus()
  await page.keyboard.press('Tab')
  const focus = await page.evaluate(() => {
    const active = document.activeElement
    return {
      tag: active?.tagName,
      insideCanvas: Boolean(active?.closest('[data-felixo-region="canvas"]')),
      interactive: active instanceof HTMLElement &&
        ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'A'].includes(active.tagName),
    }
  })
  if (!focus.insideCanvas || !focus.interactive) {
    throw new Error(`[canvas-smoke] Tab nao alcancou um controle do canvas: ${JSON.stringify(focus)}`)
  }
}

async function checarFocoAoAbrirFerramenta(page) {
  await page.getByRole('button', { name: 'Buscar' }).click()
  const panel = page.locator('[data-felixo-canvas-panel="search"]')
  await panel.waitFor({ state: 'visible', timeout: INTERACTION_TIMEOUT_MS })
  const focused = await page.evaluate(() => {
    const panelElement = document.querySelector('[data-felixo-canvas-panel="search"]')
    const input = panelElement?.querySelector('input')
    return Boolean(input) && document.activeElement === input
  })
  if (!focused) {
    throw new Error('[canvas-smoke] abrir Buscar nao moveu o foco para o campo')
  }
  await page.getByRole('button', { name: 'Buscar' }).click()
}

async function prepararFixture(page) {
  const result = await page.evaluate(async (nodes) => {
    const bridge = window.felixo?.canvas
    if (!bridge) throw new Error('ponte canvas indisponivel')
    const cleared = await bridge.clear()
    if (!cleared?.ok) throw new Error(cleared?.message || 'limpeza do canvas falhou')
    for (const node of nodes) {
      const saved = await bridge.save(node)
      if (!saved?.ok) throw new Error(saved?.message || `persistencia falhou: ${node.id}`)
    }
    const savedEdge = await bridge.saveEdge({
      id: 'fixture-edge',
      source: 'fixture-note',
      target: 'fixture-file',
    })
    if (!savedEdge?.ok) throw new Error(savedEdge?.message || 'persistencia da conexao falhou')
    const listedNodes = await bridge.list()
    const listedEdges = await bridge.listEdges()
    return {
      nodeCount: listedNodes.nodes?.length ?? 0,
      edgeCount: listedEdges.edges?.length ?? 0,
    }
  }, FIXTURE_NODES)

  if (result.nodeCount !== FIXTURE_NODES.length || result.edgeCount !== 1) {
    throw new Error(`[canvas-smoke] fixture incompleto: ${JSON.stringify(result)}`)
  }

  await page.reload()
  await checarMontagem(page)
  await page.waitForFunction(
    (ids) => ids.every((id) => document.querySelector(`[data-id="${id}"]`)),
    FIXTURE_NODES.map((node) => node.id),
    { timeout: HYDRATION_TIMEOUT_MS },
  )
}

function rectangleOverlaps(first, second) {
  return first && second && first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top
}

async function checarOclusaoDoFixture(page) {
  const rectangles = await page.evaluate(() => {
    const read = (selector) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) return null
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
    }
    return {
      group: read('[data-id="fixture-group"]'),
      topbar: read('[data-felixo-region="topbar"]'),
      sidebar: read('[data-felixo-region="sidebar"]'),
      statusbar: read('.felixo-canvas-statusbar'),
      inspector: read('.felixo-elements-inspector:not([aria-hidden="true"])'),
      minimap: read('.felixo-canvas-minimap'),
    }
  })

  if (!rectangles.group) throw new Error('[canvas-smoke] grupo fixture nao foi renderizado')
  for (const [name, rectangle] of Object.entries(rectangles)) {
    if (name === 'group' || !rectangle) continue
    if (rectangleOverlaps(rectangles.group, rectangle)) {
      throw new Error(`[canvas-smoke] grupo fixture ocluido por ${name}: ${JSON.stringify(rectangles)}`)
    }
  }
}

async function checarAuditoriaDeAcessibilidade(page) {
  const audit = await page.evaluate(() => {
    const visible = (element) => {
      if (element.closest('[aria-hidden="true"], [inert]')) return false
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden') return false
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }
    const controls = [...document.querySelectorAll('button, input, textarea, [role="separator"]')]
      .filter(visible)
      .filter((element) => !element.closest('.excalidraw'))
    const unlabeled = controls
      .filter((element) => {
        if (element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby')) return false
        if (element.getAttribute('title')?.trim()) return false
        if (element.closest('label')) return false
        return !element.textContent?.trim()
      })
      .map((element) => ({ tag: element.tagName.toLowerCase(), type: element.getAttribute('type'), outer: element.outerHTML.slice(0, 180) }))
    const landmarks = ['topbar', 'sidebar', 'canvas'].map((region) => Boolean(document.querySelector(`[data-felixo-region="${region}"]`)))
    return { unlabeled, landmarks }
  })

  if (audit.unlabeled.length > 0) {
    throw new Error(`[canvas-smoke] controle sem nome acessivel: ${JSON.stringify(audit.unlabeled)}`)
  }
  if (audit.landmarks.some((present) => !present)) {
    throw new Error(`[canvas-smoke] landmarks incompletos: ${JSON.stringify(audit.landmarks)}`)
  }
}

async function checarInteracoes(page) {
  const group = page.locator('[data-id="fixture-group"]')
  // Use a real pointer hit test here. This catches a fixed surface or the
  // React Flow pane stealing the click from a node that looks visible.
  await group.click()
  const selected = await group.evaluate((element) => element.classList.contains('selected'))
  if (!selected) throw new Error('[canvas-smoke] selecionar o grupo nao marcou o node')

  const dragNode = page.locator('[data-id="fixture-note"]')
  const before = await page.evaluate(async () => (await window.felixo.canvas.list()).nodes.find((node) => node.id === 'fixture-note')?.position)
  const grip = dragNode.locator('.felixo-node-grip')
  const gripBox = await grip.boundingBox()
  if (!gripBox) throw new Error('[canvas-smoke] grip do grupo sem hit box')
  // The group title is an editable input (`nodrag`); start in the parent's
  // left padding so React Flow receives the drag handle event itself.
  const dragX = gripBox.x + Math.min(3, gripBox.width / 4)
  const dragY = gripBox.y + gripBox.height / 2
  await page.mouse.move(dragX, dragY)
  await page.mouse.down()
  await page.mouse.move(dragX + 14, dragY + 9, { steps: 5 })
  await page.mouse.up()
  // A posição é gravada depois do arrasto (com atraso); uma espera fixa de 800 ms
  // falhou no runner Windows (main do #66, 20/09). Espera a mudança aparecer até o
  // teto: se ela nunca vier, o erro abaixo continua sendo o de arrasto que não persistiu.
  if (before) {
    await esperarAte(
      async () => {
        const atual = await page.evaluate(async () => (await window.felixo.canvas.list()).nodes.find((node) => node.id === 'fixture-note')?.position)
        return Boolean(atual) && (atual.x !== before.x || atual.y !== before.y)
      },
      { timeoutMs: INTERACTION_TIMEOUT_MS },
    )
  }
  const after = await page.evaluate(async () => (await window.felixo.canvas.list()).nodes.find((node) => node.id === 'fixture-note')?.position)
  if (!before || !after || (before.x === after.x && before.y === after.y)) {
    throw new Error(`[canvas-smoke] arrasto pequeno da nota nao persistiu: antes=${JSON.stringify(before)} depois=${JSON.stringify(after)}`)
  }

  await recordVisualEvidence(
    page,
    'arrasto-persistido',
    [...CORE_LAYOUT_SELECTORS, '[data-id="fixture-note"]'],
    { event: 'drag', persistedPosition: after },
    { checkViewportBounds: false },
  )

  const source = page.locator('[data-id="fixture-drawing"] .react-flow__handle.source').first()
  const target = page.locator('[data-id="fixture-excalidraw"] .react-flow__handle.target').first()
  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  if (!sourceBox || !targetBox) throw new Error('[canvas-smoke] handles da conexao sem hit box')
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 })
  await page.mouse.up()
  // Mesma razão do arrasto acima: espera a conexão aparecer no armazenamento (até o teto).
  await esperarAte(
    async () => (await page.evaluate(async () => (await window.felixo.canvas.listEdges()).edges || [])).length >= 2,
    { timeoutMs: INTERACTION_TIMEOUT_MS },
  )
  const edgesAfterConnect = await page.evaluate(async () => (await window.felixo.canvas.listEdges()).edges || [])
  if (edgesAfterConnect.length < 2) {
    throw new Error(`[canvas-smoke] conexao por handle nao persistiu: ${JSON.stringify(edgesAfterConnect)}`)
  }

  const terminalTrigger = page.locator('[data-terminal-expand-trigger="fixture-terminal"]').first()
  // Native click in Electron can dispatch React's handler before focus lands
  // on a transformed node button; focus it first so the return contract is
  // deterministic while still exercising the real open/close handlers.
  await terminalTrigger.focus()
  await terminalTrigger.click()
  await page.locator('[data-canvas-terminal-drawer]').waitFor({ state: 'visible', timeout: INTERACTION_TIMEOUT_MS })
  await page.locator('[data-felixo-mock-terminal="fixture-terminal"]').waitFor({ state: 'visible', timeout: INTERACTION_TIMEOUT_MS })
  const terminalFocused = await page.evaluate(() => document.activeElement?.getAttribute('data-felixo-mock-terminal') === 'fixture-terminal')
  if (!terminalFocused) throw new Error('[canvas-smoke] abrir a gaveta nao focou o terminal fake')
  await recordVisualEvidence(
    page,
    'gaveta-terminal-aberta',
    [...CORE_LAYOUT_SELECTORS, '[data-canvas-terminal-drawer]', '[data-felixo-mock-terminal="fixture-terminal"]'],
    { event: 'drawer-open', fixture: 'mock-agent' },
  )
  await page.getByRole('button', { name: 'Fechar terminal' }).click()
  await page.waitForFunction(() => !document.querySelector('[data-canvas-terminal-drawer]'), null, { timeout: INTERACTION_TIMEOUT_MS })
  const focusAfterDrawer = await page.evaluate(() => ({
    returned: document.activeElement?.getAttribute('data-terminal-expand-trigger') === 'fixture-terminal',
    tag: document.activeElement?.tagName,
    html: document.activeElement?.outerHTML?.slice(0, 240),
  }))
  if (!focusAfterDrawer.returned) {
    throw new Error(`[canvas-smoke] fechar a gaveta nao devolveu o foco ao gatilho: ${JSON.stringify(focusAfterDrawer)}`)
  }

  await recordVisualEvidence(page, 'gaveta-terminal-fechada', CORE_LAYOUT_SELECTORS, { event: 'drawer-close' })
  const bell = page.locator('[data-notifications-trigger]')
  await bell.click()
  const notifications = page.locator('#canvas-notifications-panel')
  await notifications.waitFor({ state: 'visible', timeout: INTERACTION_TIMEOUT_MS })
  await page.waitForFunction(
    () => document.activeElement?.id === 'canvas-notifications-panel',
    null,
    { timeout: INTERACTION_TIMEOUT_MS },
  )
  await recordVisualEvidence(
    page,
    'notificacoes-abertas',
    [...CORE_LAYOUT_SELECTORS, '#canvas-notifications-panel'],
    { event: 'notifications-open' },
  )
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('#canvas-notifications-panel'), null, { timeout: INTERACTION_TIMEOUT_MS })
  await page.waitForFunction(
    () => document.activeElement?.hasAttribute('data-notifications-trigger'),
    null,
    { timeout: INTERACTION_TIMEOUT_MS },
  )

  await recordVisualEvidence(page, 'notificacoes-fechadas', CORE_LAYOUT_SELECTORS, { event: 'notifications-close' })
  const webpageButton = page.getByRole('button', { name: 'Página Web' })
  await webpageButton.click()
  const urlInput = page.locator('input[aria-label="Endereço do site"]')
  await urlInput.fill('javascript:alert(1)')
  await page.getByRole('button', { name: 'Criar' }).last().click()
  await page.waitForFunction(() => document.body.innerText.includes('Informe um endereço de site válido'), null, { timeout: INTERACTION_TIMEOUT_MS })
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('input[aria-label="Endereço do site"]'), null, { timeout: INTERACTION_TIMEOUT_MS })
}

async function checarReloadSemDuplicacao(page) {
  const before = await page.evaluate(async () => {
    const nodes = await window.felixo.canvas.list()
    const edges = await window.felixo.canvas.listEdges()
    return { nodeCount: nodes.nodes?.length ?? 0, edgeCount: edges.edges?.length ?? 0, fixtureEdges: (edges.edges || []).filter((edge) => edge.id === 'fixture-edge').length, terminalNodes: (nodes.nodes || []).filter((node) => node.type === 'terminal').length }
  })
  await page.reload()
  await checarMontagem(page)
  await page.waitForFunction(() => document.querySelector('[data-felixo-canvas-ready]'))
  const after = await page.evaluate(async () => {
    const nodes = await window.felixo.canvas.list()
    const edges = await window.felixo.canvas.listEdges()
    return { nodeCount: nodes.nodes?.length ?? 0, edgeCount: edges.edges?.length ?? 0, fixtureEdges: (edges.edges || []).filter((edge) => edge.id === 'fixture-edge').length, terminalNodes: (nodes.nodes || []).filter((node) => node.type === 'terminal').length, mountedMockTerminals: document.querySelectorAll('[data-felixo-mock-terminal]').length }
  })
  const comparableAfter = {
    nodeCount: after.nodeCount,
    edgeCount: after.edgeCount,
    fixtureEdges: after.fixtureEdges,
    terminalNodes: after.terminalNodes,
  }
  await recordVisualEvidence(
    page,
    'recuperacao-apos-reload',
    CORE_LAYOUT_SELECTORS,
    { event: 'reload', nodeCount: after.nodeCount, edgeCount: after.edgeCount },
  )
  if (JSON.stringify(before) !== JSON.stringify(comparableAfter)) {
    throw new Error(`[canvas-smoke] reload alterou persistencia: antes=${JSON.stringify(before)} depois=${JSON.stringify(after)}`)
  }
  if (after.fixtureEdges !== 1 || after.mountedMockTerminals !== 0 || after.terminalNodes !== 1) {
    throw new Error(`[canvas-smoke] reload duplicou edge/sessao ou deixou terminal montado: ${JSON.stringify(after)}`)
  }
}

// Janelas em que o painel precisa continuar dentro da tela e redimensionável.
// 1366x768 é o notebook do relato; 800x600 é o piso em que o painel ainda abre
// pelo botão da barra lateral (abaixo disso só o overflow é conferido).
const VIEWPORTS_DO_PAINEL = [
  { width: 1366, height: 768 },
  { width: 1024, height: 640 },
  { width: 800, height: 600 },
]

// Espelha `getPanelMaxHeight` (panel-sizing.ts): topo 64 + rodapé 48, piso 240.
function alturaMaximaEsperada(viewportHeight) {
  return Math.max(240, viewportHeight - 64 - 48)
}

// O painel entra com uma animacao que inclui `scale`: medido no meio dela,
// `getBoundingClientRect` devolve uma altura menor que a real (visto no CI do
// macOS: 108,9 contra 118,4, razao ~0,92). Por isso a altura comparada e a de
// LAYOUT (`offsetHeight`, que ignora transform) e a medicao espera as animacoes
// acabarem; o retangulo so serve para conferir que o painel esta dentro da janela.
async function aguardarPainelAssentado(page, panelId) {
  await page.waitForFunction(
    (id) => {
      const element = document.querySelector(`[data-felixo-canvas-panel="${id}"]`)
      return Boolean(element) && element.getAnimations().length === 0
    },
    panelId,
    { timeout: INTERACTION_TIMEOUT_MS },
  )
}

async function medirPainel(page, panelId) {
  await aguardarPainelAssentado(page, panelId)
  return page.evaluate((id) => {
    const element = document.querySelector(`[data-felixo-canvas-panel="${id}"]`)
    if (!element) return null
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
      height: element.offsetHeight,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
    }
  }, panelId)
}

async function checarPainelNosDoisEixos(page) {
  for (const viewport of VIEWPORTS_DO_PAINEL) {
    const rotulo = `${viewport.width}x${viewport.height}`
    await page.setViewportSize(viewport)
    await waitForViewport(page, viewport)
    await page.getByRole('button', { name: 'Buscar' }).click()
    await page.locator('[data-felixo-canvas-panel="search"]').waitFor({ state: 'visible', timeout: INTERACTION_TIMEOUT_MS })

    const antes = await medirPainel(page, 'search')
    if (!antes) throw new Error(`[canvas-smoke] painel Buscar nao encontrado em ${rotulo}`)
    // O painel nunca escapa da janela, em nenhum dos quatro lados.
    if (antes.left < 0 || antes.top < 0 || antes.right > antes.viewportWidth + 1 || antes.bottom > antes.viewportHeight + 1) {
      throw new Error(`[canvas-smoke] painel fora da janela em ${rotulo}: ${JSON.stringify(antes)}`)
    }

    // Altura pelo teclado: a alça de baixo cresce o painel e respeita o teto.
    const alca = page.locator('[data-felixo-panel-height-handle="search"]')
    await alca.focus()
    for (let i = 0; i < 12; i += 1) await page.keyboard.press('ArrowDown')
    const depois = await medirPainel(page, 'search')
    const teto = alturaMaximaEsperada(depois.viewportHeight)
    if (antes.height + 24 <= teto && !(depois.height > antes.height)) {
      throw new Error(`[canvas-smoke] a alca de altura nao cresceu o painel em ${rotulo}: ${antes.height} -> ${depois.height}`)
    }
    if (depois.height > teto + 1 || depois.bottom > depois.viewportHeight + 1) {
      throw new Error(`[canvas-smoke] painel passou do teto de altura em ${rotulo}: ${JSON.stringify({ depois, teto })}`)
    }

    // Home devolve a altura do conteudo.
    await alca.focus()
    await page.keyboard.press('Home')
    const restaurado = await medirPainel(page, 'search')
    if (Math.abs(restaurado.height - antes.height) > 2) {
      throw new Error(`[canvas-smoke] Home nao restaurou a altura em ${rotulo}: ${antes.height} vs ${restaurado.height}`)
    }

    await page.getByRole('button', { name: 'Buscar' }).click()
    await page.locator('[data-felixo-canvas-panel="search"]').waitFor({ state: 'detached', timeout: INTERACTION_TIMEOUT_MS })
  }
}

async function checarViewportMinimo(page) {
  await page.setViewportSize(MIN_VIEWPORT)
  await waitForViewport(page, MIN_VIEWPORT)
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  if (overflow.scrollWidth > overflow.clientWidth) {
    throw new Error(`[canvas-smoke] overflow horizontal no viewport minimo: ${JSON.stringify(overflow)}`)
  }
}

async function checarZoomVisual(page) {
  const viewport = { width: 1280, height: 800 }
  const nodeSelector = '[data-id="fixture-group"]'
  await page.setViewportSize(viewport)
  await waitForViewport(page, viewport)
  await page.locator('.felixo-zoom-pill button[aria-label="Enquadrar todos os blocos"]').click()
  const before = await measureStableGeometry(page, 'zoom inicial', [nodeSelector], {
    checkViewportBounds: false,
  })
  const beforeWidth = before.measurements.find(
    (item) => item.selector === nodeSelector && item.property === 'width',
  )?.minimum
  const beforePercent = await page.locator('.felixo-zoom-pill-value').textContent()
  await recordVisualEvidence(
    page,
    'zoom-antes',
    [...CORE_LAYOUT_SELECTORS, nodeSelector],
    { event: 'zoom-before', zoomPercent: beforePercent?.trim() },
    { checkViewportBounds: false },
  )

  await page.locator('.felixo-zoom-pill button[aria-label="Reduzir zoom"]').click()
  await page.waitForFunction(
    (previous) => document.querySelector('.felixo-zoom-pill-value')?.textContent?.trim() !== previous,
    beforePercent?.trim(),
    { timeout: INTERACTION_TIMEOUT_MS },
  )
  const afterPercent = await page.locator('.felixo-zoom-pill-value').textContent()
  const after = await recordVisualEvidence(
    page,
    'zoom-depois',
    [...CORE_LAYOUT_SELECTORS, nodeSelector],
    { event: 'zoom-after', zoomPercent: afterPercent?.trim() },
    { checkViewportBounds: false },
  )
  const afterWidth = after.measurements.find(
    (item) => item.selector === nodeSelector && item.property === 'width',
  )?.minimum

  if (!Number.isFinite(beforeWidth) || !Number.isFinite(afterWidth) || afterWidth >= beforeWidth - 1) {
    throw new Error(
      '[canvas-visual] o zoom mudou de ' + beforePercent?.trim() + ' para ' +
      afterPercent?.trim() + ', mas não reduziu o bounding box do grupo fixture: ' +
      beforeWidth + ' -> ' + afterWidth,
    )
  }
}

async function checarMatrizVisual(page) {
  for (const theme of VISUAL_THEMES) {
    await selectVisualTheme(page, theme)
    const cdp = await page.context().newCDPSession(page)
    try {
      for (const viewport of VISUAL_VIEWPORT_CASES) {
        const label = theme + '-' + viewport.width + 'x' + viewport.height +
          '-dpr' + viewport.deviceScaleFactor
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: viewport.deviceScaleFactor,
          mobile: false,
        })
        await waitForViewport(page, viewport)
        await page.waitForFunction(
          (expected) => Math.abs(window.devicePixelRatio - expected) < 0.01,
          viewport.deviceScaleFactor,
          { timeout: INTERACTION_TIMEOUT_MS },
        )

        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }))
        if (overflow.scrollWidth > overflow.clientWidth) {
          throw new Error(
            '[canvas-visual] ' + label + ' tem overflow horizontal: ' +
            JSON.stringify(overflow),
          )
        }

        const selectors = viewport.width >= 1280
          ? [...CORE_LAYOUT_SELECTORS, '.felixo-canvas-minimap']
          : CORE_LAYOUT_SELECTORS
        await recordVisualEvidence(
          page,
          label,
          selectors,
          {
            event: 'viewport-theme-dpr',
            theme,
            requestedViewport: viewport,
            horizontalOverflow: overflow,
          },
          { sampleFrames: 16 },
        )
      }
    } catch (error) {
      visualReport.failure = { scenario: theme, message: error.message || String(error) }
      throw error
    } finally {
      await cdp.send('Emulation.clearDeviceMetricsOverride').catch(() => {})
      await cdp.detach().catch(() => {})
    }
  }
}

async function main() {
  fs.rmSync(visualOutputPath(''), { recursive: true, force: true })
  await withDevtoolsSession(async () => {
    const state = readState()
    const { browser, page } = await connect(state)
    try {
      await checarMontagem(page)
      await checarLandmarksVisiveis(page)
      await checarNavegacaoPorTab(page)
      await checarFocoAoAbrirFerramenta(page)
      await prepararFixture(page)
      await checarOclusaoDoFixture(page)
      await checarAuditoriaDeAcessibilidade(page)
      await checarInteracoes(page)
      await checarReloadSemDuplicacao(page)
      await checarPainelNosDoisEixos(page)
      await checarViewportMinimo(page)
      await checarZoomVisual(page)
      await checarMatrizVisual(page)
    } catch (error) {
      const output = path.join(APP_DIR, 'build', `canvas-smoke-failure-${process.platform}.png`)
      try {
        require('node:fs').mkdirSync(path.dirname(output), { recursive: true })
        await page.screenshot({ path: output })
        console.error(`[canvas-smoke] captura de falha salva em ${output}`)
      } catch (screenshotError) {
        console.error(`[canvas-smoke] nao foi possivel capturar a falha: ${screenshotError.message}`)
      }
      throw error
    } finally {
      await browser.close()
    }
  })
  const report = writeVisualReport()
  console.log('[canvas-visual] relatório e capturas: ' + report)
  console.log('[canvas-smoke] fixture, interações, recuperação, resize e matriz visual de viewport/tema/DPR: ok')
}

main().catch((error) => {
  const report = writeVisualReport(error)
  console.error('[canvas-visual] relatório: ' + report)
  console.error(error.stack || error.message || String(error))
  process.exitCode = 1
})
