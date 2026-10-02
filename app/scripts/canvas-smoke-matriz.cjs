'use strict'

/**
 * Matriz visual do canvas: quais superfícies da moldura são medidas, quais
 * sobreposições entre elas são intencionais (com o motivo) e quais casos de
 * viewport × DPR × tema × Modo Performance rodam no PR e na noturna.
 *
 * Tudo aqui é puro (sem Playwright) para ser testado em
 * `canvas-smoke-matriz.test.cjs`; o `canvas-smoke.cjs` mede os retângulos no
 * renderer e chama `findSurfaceOverlaps`/`findMissingSurfaces`.
 */

/** Sobreposição abaixo disso (px CSS, nos dois eixos) é borda encostada, não cobertura. */
const OVERLAP_THRESHOLD_CSS_PX = 1

/**
 * `optional`: a superfície pode não estar na tela por desenho.
 * - `minimap`: é a única que pode sumir (LAYOUT-SUPERFICIES.md) e o Modo
 *   Performance a desliga (`CanvasView.tsx`, `miniMap && !performanceMode`).
 * - `inspector` e `inspector-puck`: um ou outro, conforme a lista Elementos
 *   esteja aberta ou recolhida (`findMissingSurfaces` exige pelo menos um).
 */
const MATRIX_SURFACES = [
  { name: 'topbar', selector: '[data-felixo-region="topbar"]' },
  { name: 'sidebar', selector: '[data-felixo-region="sidebar"]' },
  { name: 'statusbar', selector: '.felixo-canvas-statusbar' },
  { name: 'zoom', selector: '.felixo-zoom-pill' },
  { name: 'minimap', selector: '.felixo-canvas-minimap', optional: true },
  { name: 'inspector', selector: '[data-felixo-tour-anchor="inspector-elementos"]', optional: true },
  { name: 'inspector-puck', selector: '[data-felixo-tour-anchor="inspector-puck"]', optional: true },
]

/**
 * Sobreposições aceitas. Cada uma diz por quê; `task` marca defeito conhecido
 * (fica permitido para o gate não esconder regressões novas atrás dele) e
 * `when` restringe o caso em que vale.
 */
const TASK_SOBREPOSICOES_MEDIDAS = '3ed91f95-497e-8114-a246-f72c73ae50c4'
const ALLOWED_OVERLAPS = [
  {
    a: 'inspector',
    b: 'sidebar',
    motivo: 'em 320 px a lista Elementos abre sobre a sidebar expandida (interseção medida de 187 × 54 px)',
    task: TASK_SOBREPOSICOES_MEDIDAS,
    when: (matrixCase) => matrixCase.viewport?.width <= 320,
  },
  {
    a: 'minimap',
    b: 'zoom',
    motivo: 'em 768 px o Mini Map cobre a pílula de zoom (interseção medida de 200 × 40 px)',
    task: TASK_SOBREPOSICOES_MEDIDAS,
    when: (matrixCase) => matrixCase.viewport?.width >= 700 && matrixCase.viewport?.width < 1024,
  },
]

/** Superfícies que podem passar da janela, com o mesmo formato (defeito conhecido com task). */
const ALLOWED_OUTSIDE = [
  {
    name: 'zoom',
    motivo: 'em 320 px a pílula de zoom passa 147 px da borda direita',
    task: TASK_SOBREPOSICOES_MEDIDAS,
    when: (matrixCase) => matrixCase.viewport?.width <= 320,
  },
]

function pairKey(a, b) {
  return [a, b].sort().join('×')
}

function intersection(first, second) {
  const width = Math.min(first.right, second.right) - Math.max(first.left, second.left)
  const height = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top)
  return { width: Math.max(0, width), height: Math.max(0, height) }
}

function isAllowed(a, b, matrixCase, allowed) {
  const key = pairKey(a, b)
  return allowed.some((entry) => pairKey(entry.a, entry.b) === key && (!entry.when || entry.when(matrixCase)))
}

/**
 * `surfaces`: [{ name, visible, rect: { left, top, right, bottom } }].
 * Devolve cada par visível que se cobre além do limite sem estar na lista de
 * permitidos, com os dois retângulos e o tamanho da interseção.
 */
function findSurfaceOverlaps(surfaces, matrixCase = {}, options = {}) {
  const threshold = options.thresholdCssPx ?? OVERLAP_THRESHOLD_CSS_PX
  const allowed = options.allowed ?? ALLOWED_OVERLAPS
  const visible = surfaces.filter((surface) => surface.visible && surface.rect)
  const violations = []
  for (const [index, first] of visible.entries()) {
    for (const second of visible.slice(index + 1)) {
      const overlap = intersection(first.rect, second.rect)
      if (overlap.width <= threshold || overlap.height <= threshold) continue
      if (isAllowed(first.name, second.name, matrixCase, allowed)) continue
      violations.push({ pair: pairKey(first.name, second.name), overlap, rects: { [first.name]: first.rect, [second.name]: second.rect } })
    }
  }
  return violations
}

/**
 * Superfícies obrigatórias ausentes ou fora da janela (além de `tolerance`).
 * O par inspector/puck conta como uma: basta um dos dois estar na tela.
 */
function findMissingSurfaces(surfaces, matrixCase, options = {}) {
  const tolerance = options.tolerance ?? 1
  const allowedOutside = options.allowedOutside ?? ALLOWED_OUTSIDE
  const { viewport } = matrixCase
  const byName = new Map(surfaces.map((surface) => [surface.name, surface]))
  const problems = []
  const outside = (rect) =>
    rect.left < -tolerance || rect.top < -tolerance || rect.right > viewport.width + tolerance || rect.bottom > viewport.height + tolerance

  for (const spec of MATRIX_SURFACES) {
    const surface = byName.get(spec.name)
    const shown = Boolean(surface?.visible && surface.rect)
    if (!shown) {
      if (!spec.optional) problems.push({ name: spec.name, reason: 'ausente' })
      continue
    }
    const allowed = allowedOutside.some((entry) => entry.name === spec.name && (!entry.when || entry.when(matrixCase)))
    if (outside(surface.rect) && !allowed) problems.push({ name: spec.name, reason: 'fora-da-janela', rect: surface.rect, viewport })
  }
  const inspectorShown = ['inspector', 'inspector-puck'].some((name) => byName.get(name)?.visible && byName.get(name)?.rect)
  if (!inspectorShown) problems.push({ name: 'inspector|inspector-puck', reason: 'ausente' })
  return problems
}

const THEMES = ['dark', 'high_contrast']
const VIEWPORTS = [
  { width: 320, height: 720, deviceScaleFactor: 1 },
  { width: 320, height: 720, deviceScaleFactor: 2 },
  { width: 768, height: 900, deviceScaleFactor: 1 },
  { width: 1280, height: 800, deviceScaleFactor: 1 },
  { width: 1280, height: 800, deviceScaleFactor: 2 },
  { width: 3840, height: 2160, deviceScaleFactor: 1 },
  { width: 3840, height: 2160, deviceScaleFactor: 2 },
]
const NIGHTLY_EXTRA_VIEWPORTS = [
  { width: 1024, height: 640, deviceScaleFactor: 1.25 },
  { width: 1366, height: 768, deviceScaleFactor: 1.5 },
  { width: 1920, height: 1080, deviceScaleFactor: 1 },
  { width: 2560, height: 1440, deviceScaleFactor: 1.25 },
]
/** No PR, o Modo Performance roda só nas duas pontas, no tema padrão. */
const PR_PERFORMANCE_VIEWPORTS = [
  { width: 320, height: 720, deviceScaleFactor: 1 },
  { width: 1280, height: 800, deviceScaleFactor: 1 },
]

/**
 * `pr`: tema × os 7 viewports com Modo Performance desligado, mais as duas
 * pontas com ele ligado. `completa` (noturna, `FELIXO_SMOKE_MATRIZ=completa`):
 * tema × 11 viewports × Modo Performance ligado e desligado. A ordem é fixa
 * (sem sorteio), então duas execuções do mesmo commit medem os mesmos casos.
 */
function buildMatrixCases(mode = 'pr') {
  if (mode !== 'pr' && mode !== 'completa') throw new Error(`matriz desconhecida: ${mode}`)
  const cases = []
  if (mode === 'completa') {
    for (const performance of [false, true]) {
      for (const theme of THEMES) {
        for (const viewport of [...VIEWPORTS, ...NIGHTLY_EXTRA_VIEWPORTS]) cases.push({ theme, viewport, performance })
      }
    }
    return cases
  }
  for (const theme of THEMES) for (const viewport of VIEWPORTS) cases.push({ theme, viewport, performance: false })
  for (const viewport of PR_PERFORMANCE_VIEWPORTS) cases.push({ theme: 'dark', viewport, performance: true })
  return cases
}

function describeCase({ theme, viewport, performance }) {
  return `${theme}-${viewport.width}x${viewport.height}-dpr${viewport.deviceScaleFactor}${performance ? '-performance' : ''}`
}

module.exports = {
  ALLOWED_OUTSIDE,
  ALLOWED_OVERLAPS,
  THEMES,
  VIEWPORTS,
  MATRIX_SURFACES,
  OVERLAP_THRESHOLD_CSS_PX,
  buildMatrixCases,
  describeCase,
  findMissingSurfaces,
  findSurfaceOverlaps,
}
