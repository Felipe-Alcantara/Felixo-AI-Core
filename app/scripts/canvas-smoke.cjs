'use strict'

/**
 * Smoke de interacoes do Canvas. A sessao DevTools e isolada e o PTY fake e
 * ativado antes do Electron iniciar, por isso nenhum CLI real e executado.
 * O fluxo cobre mount/hidratacao, todos os tipos persistidos, hit testing,
 * foco/Tab/Escape, arrasto pequeno, conexao, gaveta, URL invalida e reload.
 */

const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { connect, readState } = require('../electron/cli/felixo-devtools.cjs')

const APP_DIR = path.resolve(__dirname, '..')
const FELIXO_CLI = path.join(APP_DIR, 'electron', 'cli', 'felixo.cjs')
const MIN_VIEWPORT = { width: 375, height: 667 }
const HYDRATION_TIMEOUT_MS = 20_000
const DEVTOOLS_LAUNCH_TIMEOUT_MS = 60_000

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
    data: { label: 'Terminal fixture', command: 'mock', args: [], cwd: '' },
  },
]

function runCli(args) {
  return execFileSync(process.execPath, [FELIXO_CLI, 'devtools', ...args], {
    cwd: APP_DIR,
    encoding: 'utf8',
  })
}

async function withDevtoolsSession(action) {
  const previousMockPty = process.env.FELIXO_DEVTOOLS_MOCK_PTY
  process.env.FELIXO_DEVTOOLS_MOCK_PTY = '1'
  runCli(['launch', '--timeout', String(DEVTOOLS_LAUNCH_TIMEOUT_MS)])
  try {
    return await action()
  } finally {
    try {
      runCli(['quit'])
    } catch (error) {
      console.warn(`[canvas-smoke] falha ao encerrar a sessao DevTools: ${error.message}`)
    }
    if (previousMockPty === undefined) delete process.env.FELIXO_DEVTOOLS_MOCK_PTY
    else process.env.FELIXO_DEVTOOLS_MOCK_PTY = previousMockPty
  }
}

async function checarMontagem(page) {
  await page.waitForFunction(
    () => document.body.innerText.includes('Canvas pronto'),
    null,
    { timeout: HYDRATION_TIMEOUT_MS },
  )
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
  await panel.waitFor({ state: 'visible', timeout: 5_000 })
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
  await page.waitForTimeout(800)
  const after = await page.evaluate(async () => (await window.felixo.canvas.list()).nodes.find((node) => node.id === 'fixture-note')?.position)
  if (!before || !after || (before.x === after.x && before.y === after.y)) {
    throw new Error(`[canvas-smoke] arrasto pequeno da nota nao persistiu: antes=${JSON.stringify(before)} depois=${JSON.stringify(after)}`)
  }

  const source = page.locator('[data-id="fixture-drawing"] .react-flow__handle.source').first()
  const target = page.locator('[data-id="fixture-excalidraw"] .react-flow__handle.target').first()
  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  if (!sourceBox || !targetBox) throw new Error('[canvas-smoke] handles da conexao sem hit box')
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(500)
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
  await page.locator('[data-canvas-terminal-drawer]').waitFor({ state: 'visible', timeout: 5_000 })
  await page.locator('[data-felixo-mock-terminal="fixture-terminal"]').waitFor({ state: 'visible', timeout: 5_000 })
  const terminalFocused = await page.evaluate(() => document.activeElement?.getAttribute('data-felixo-mock-terminal') === 'fixture-terminal')
  if (!terminalFocused) throw new Error('[canvas-smoke] abrir a gaveta nao focou o terminal fake')
  await page.getByRole('button', { name: 'Fechar terminal' }).click()
  await page.waitForFunction(() => !document.querySelector('[data-canvas-terminal-drawer]'), null, { timeout: 5_000 })
  const focusAfterDrawer = await page.evaluate(() => ({
    returned: document.activeElement?.getAttribute('data-terminal-expand-trigger') === 'fixture-terminal',
    tag: document.activeElement?.tagName,
    html: document.activeElement?.outerHTML?.slice(0, 240),
  }))
  if (!focusAfterDrawer.returned) {
    throw new Error(`[canvas-smoke] fechar a gaveta nao devolveu o foco ao gatilho: ${JSON.stringify(focusAfterDrawer)}`)
  }

  const bell = page.locator('[data-notifications-trigger]')
  await bell.click()
  const notifications = page.locator('#canvas-notifications-panel')
  await notifications.waitFor({ state: 'visible', timeout: 5_000 })
  await page.waitForFunction(
    () => document.activeElement?.id === 'canvas-notifications-panel',
    null,
    { timeout: 5_000 },
  )
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('#canvas-notifications-panel'), null, { timeout: 5_000 })
  await page.waitForFunction(
    () => document.activeElement?.hasAttribute('data-notifications-trigger'),
    null,
    { timeout: 5_000 },
  )

  const webpageButton = page.getByRole('button', { name: 'Página Web' })
  await webpageButton.click()
  const urlInput = page.locator('input[aria-label="Endereço do site"]')
  await urlInput.fill('javascript:alert(1)')
  await page.getByRole('button', { name: 'Criar' }).last().click()
  await page.waitForFunction(() => document.body.innerText.includes('Informe um endereço de site válido'), null, { timeout: 5_000 })
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('input[aria-label="Endereço do site"]'), null, { timeout: 5_000 })
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
    { timeout: 5_000 },
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
    await page.waitForTimeout(250)
    await page.getByRole('button', { name: 'Buscar' }).click()
    await page.locator('[data-felixo-canvas-panel="search"]').waitFor({ state: 'visible', timeout: 5_000 })

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
    await page.locator('[data-felixo-canvas-panel="search"]').waitFor({ state: 'detached', timeout: 5_000 })
  }
}

async function checarViewportMinimo(page) {
  await page.setViewportSize(MIN_VIEWPORT)
  await page.waitForTimeout(250)
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  if (overflow.scrollWidth > overflow.clientWidth) {
    throw new Error(`[canvas-smoke] overflow horizontal no viewport minimo: ${JSON.stringify(overflow)}`)
  }
}

async function main() {
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
  console.log('[canvas-smoke] mount + fixture + oclusao + interacoes + reload + painel nos dois eixos + viewport minimo: ok')
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error))
  process.exitCode = 1
})
