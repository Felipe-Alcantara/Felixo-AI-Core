import { ONBOARDING_ANCHORS, type AnchorId, type CardSide, type StepTarget } from './onboarding-catalog'

/**
 * Geometria e foco do tutorial do canvas, sem DOM de verdade.
 *
 * Tudo aqui é puro: o DOM e as medidas chegam por parâmetro (`TargetEnv`,
 * retângulos, estilos computados), então as regras são testáveis em node e a
 * camada do tour (chunk preguiçoso) só faz a cola com o navegador.
 *
 * - `resolveStepTarget`: escolhe o primeiro alvo visível da cadeia do passo.
 * - `computeCardPlacement`: lado do card (ou "folha" em viewport compacto),
 *   desviando do alvo e dos obstáculos (`[data-felixo-tour-avoid]`).
 * - `computeRingRect` e `computeSidebarReveal`: o anel e a rolagem instantânea
 *   da sidebar (nunca `scrollIntoView`, que arrasta o shell inteiro).
 * - `canStealFocus`, `decideFocusOnOpen`, `resolveReturnFocus` e `hasOpenModal`:
 *   quando o tour pode mover o foco e para onde ele volta.
 * - `ancestorCreatesContainingBlock`: a condição de que o host na árvore
 *   depende (nenhum ancestral cria containing block para o `position: fixed`).
 */

export type Rect = { top: number; left: number; width: number; height: number }
export type Viewport = { width: number; height: number }

/** Distância mínima entre o card e a borda da janela. */
export const LAYOUT_MARGIN = 12
/** Distância entre o card e o alvo (ou um obstáculo). */
export const LAYOUT_GAP = 10
/** O card nunca cruza o alvo inflado por esta folga. */
export const TARGET_INFLATE = 4
/** Abaixo destas medidas (px CSS) o card vira folha: 320×720, 375×667, zoom +3 ≈ 417×289. */
export const COMPACT_MAX_WIDTH = 480
export const COMPACT_MAX_HEIGHT = 360
/** Menor altura aceitável para o card encolhido; abaixo disso ele cobre o obstáculo. */
export const SHEET_MIN_HEIGHT = 160
export const SHEET_HEIGHT_RATIO = 0.6
/**
 * Menor largura da folha em coluna ao lado do alvo: cabe "Pular tutorial" numa
 * linha e o título do passo sem quebra. Abaixo disso a coluna não é oferecida.
 */
export const SHEET_MIN_COLUMN_WIDTH = 160
/** O anel fica dentro da janela por esta folga, para o contorno não sumir na borda. */
export const RING_INSET = 2
/** Fração mínima do alvo que precisa estar visível na janela e no contêiner rolável. */
export const MIN_VISIBLE_FRACTION = 0.5

export const HIDDEN_ANCESTOR_SELECTOR = '[inert], [aria-hidden="true"], [hidden]'
/** Superfícies do próprio tutorial: nunca contam como algo que tampa o alvo. */
export const OWN_SURFACE_SELECTOR = '[data-felixo-onboarding]'

// ---------------------------------------------------------------------------
// Retângulos
// ---------------------------------------------------------------------------

export function toRect(value: Rect): Rect {
  return { top: value.top, left: value.left, width: value.width, height: value.height }
}

const right = (rect: Rect) => rect.left + rect.width
const bottom = (rect: Rect) => rect.top + rect.height

export function inflateRect(rect: Rect, amount: number): Rect {
  return {
    top: rect.top - amount,
    left: rect.left - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  }
}

/** Interseção com área positiva (encostar na borda não conta). */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.left < right(b) && right(a) > b.left && a.top < bottom(b) && bottom(a) > b.top
}

function intersection(a: Rect, b: Rect): Rect | null {
  const left = Math.max(a.left, b.left)
  const top = Math.max(a.top, b.top)
  const width = Math.min(right(a), right(b)) - left
  const height = Math.min(bottom(a), bottom(b)) - top
  return width > 0 && height > 0 ? { top, left, width, height } : null
}

function visibleFraction(rect: Rect, box: Rect): number {
  const area = rect.width * rect.height
  if (area <= 0) return 0
  const shared = intersection(rect, box)
  return shared ? (shared.width * shared.height) / area : 0
}

function viewportRect(viewport: Viewport): Rect {
  return { top: 0, left: 0, width: viewport.width, height: viewport.height }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

export function isCompactViewport(viewport: Viewport): boolean {
  return viewport.width < COMPACT_MAX_WIDTH || viewport.height < COMPACT_MAX_HEIGHT
}

/** Alvo grande demais para caber um card ao lado (a região do canvas, a coluna do inspector). */
function isHugeTarget(target: Rect, viewport: Viewport): boolean {
  return target.width > viewport.width / 2 || target.height > viewport.height / 2
}

// ---------------------------------------------------------------------------
// Posicionamento do card
// ---------------------------------------------------------------------------

export type PlacementMode = 'ancorado' | 'folha'

export type CardPlacement = {
  mode: PlacementMode
  /**
   * Lado do alvo no modo ancorado. No modo folha, a borda da janela (`cima`/`baixo`)
   * ou, quando nenhuma borda cabe sem cobrir o alvo, a coluna ao lado dele
   * (`direita`/`esquerda`).
   */
  side: CardSide
  top: number
  left: number
  width: number
  /** Teto aplicado no card: o corpo rola dentro dele e o rodapé continua visível. */
  maxHeight: number
  /** Altura efetiva do card com o teto aplicado. */
  height: number
  /** Limitação declarada: sem 160 px livres, a folha cobre o aviso (card em z 55 sobre z 50). */
  coversObstacle: boolean
}

export type PlacementInput = {
  viewport: Viewport
  target: Rect | null
  /** Tamanho natural do card, medido com a largura do modo ancorado. */
  card: { width: number; height: number }
  preferredSide?: CardSide
  obstacles?: readonly Rect[]
}

const SIDE_ORDER: readonly CardSide[] = ['baixo', 'cima', 'esquerda', 'direita']

function sideOrder(preferred: CardSide | undefined): CardSide[] {
  return preferred ? [preferred, ...SIDE_ORDER.filter((side) => side !== preferred)] : [...SIDE_ORDER]
}

function unique(values: number[]): number[] {
  return values.filter((value, index) => values.findIndex((other) => Math.abs(other - value) < 0.5) === index)
}

/**
 * Candidatos de um lado, na ordem de preferência: centrado no alvo, alinhado ao
 * início, alinhado ao fim e, por último, encostado antes ou depois de cada
 * obstáculo. O eixo principal é fixo (o card nunca cruza o alvo inflado); o
 * transversal é limitado à janela.
 */
function sideCandidates(
  side: CardSide,
  target: Rect,
  size: { width: number; height: number },
  viewport: Viewport,
  obstacles: readonly Rect[],
): Rect[] {
  const inflated = inflateRect(target, TARGET_INFLATE)
  const { width, height } = size
  if (side === 'direita' || side === 'esquerda') {
    const left = side === 'direita' ? right(inflated) + LAYOUT_GAP : inflated.left - LAYOUT_GAP - width
    if (left < LAYOUT_MARGIN || left + width > viewport.width - LAYOUT_MARGIN) return []
    if (height > viewport.height - LAYOUT_MARGIN * 2) return []
    const tops = unique(
      [
        target.top + target.height / 2 - height / 2,
        target.top,
        bottom(target) - height,
        ...obstacles.flatMap((obstacle) => [obstacle.top - LAYOUT_GAP - height, bottom(obstacle) + LAYOUT_GAP]),
      ].map((top) => clamp(top, LAYOUT_MARGIN, viewport.height - LAYOUT_MARGIN - height)),
    )
    return tops.map((top) => ({ top, left, width, height }))
  }
  const top = side === 'baixo' ? bottom(inflated) + LAYOUT_GAP : inflated.top - LAYOUT_GAP - height
  if (top < LAYOUT_MARGIN || top + height > viewport.height - LAYOUT_MARGIN) return []
  if (width > viewport.width - LAYOUT_MARGIN * 2) return []
  const lefts = unique(
    [
      target.left + target.width / 2 - width / 2,
      target.left,
      right(target) - width,
      ...obstacles.flatMap((obstacle) => [obstacle.left - LAYOUT_GAP - width, right(obstacle) + LAYOUT_GAP]),
    ].map((left) => clamp(left, LAYOUT_MARGIN, viewport.width - LAYOUT_MARGIN - width)),
  )
  return lefts.map((left) => ({ top, left, width, height }))
}

/**
 * O teto do card ancorado é o espaço daquele lado, não a altura medida: um
 * arredondamento de subpixel nunca corta o rodapé, e um texto que cresce
 * depois é remedido pelo `ResizeObserver` da camada.
 */
function anchored(side: CardSide, rect: Rect, maxHeight: number): CardPlacement {
  return { mode: 'ancorado', side, ...rect, maxHeight, coversObstacle: false }
}

function sideCeiling(side: CardSide, rect: Rect, viewport: Viewport): number {
  if (side === 'baixo') return viewport.height - LAYOUT_MARGIN - rect.top
  if (side === 'cima') return rect.height
  return viewport.height - LAYOUT_MARGIN - rect.top
}

/** Faixas verticais livres de uma coluna da janela, descontados os obstáculos que a cruzam. */
function freeColumnBands(left: number, width: number, viewport: Viewport, obstacles: readonly Rect[]) {
  let bands = [{ top: LAYOUT_MARGIN, end: viewport.height - LAYOUT_MARGIN }]
  for (const obstacle of obstacles) {
    if (obstacle.left >= left + width || right(obstacle) <= left) continue
    const cutTop = obstacle.top - LAYOUT_GAP
    const cutEnd = bottom(obstacle) + LAYOUT_GAP
    bands = bands.flatMap((band) => {
      if (cutEnd <= band.top || cutTop >= band.end) return [band]
      return [
        { top: band.top, end: Math.min(band.end, cutTop) },
        { top: Math.max(band.top, cutEnd), end: band.end },
      ].filter((part) => part.end > part.top)
    })
  }
  return bands
}

type Band = { top: number; end: number }

/** A faixa livre da coluna mais próxima do centro do alvo, com pelo menos `minHeight`. */
function nearestFreeBand(
  column: { left: number; width: number },
  center: number,
  viewport: Viewport,
  obstacles: readonly Rect[],
  minHeight: number,
): Band | null {
  const distance = (band: Band) => (center < band.top ? band.top - center : center > band.end ? center - band.end : 0)
  const bands = freeColumnBands(column.left, column.width, viewport, obstacles)
    .filter((band) => band.end - band.top >= minHeight)
    .sort((a, b) => distance(a) - distance(b) || a.top - b.top)
  return bands[0] ?? null
}

/** Altura limitada à faixa, centrada no alvo e contida nela; o teto vai até o fim da faixa. */
function fitInBand(band: Band, center: number, naturalHeight: number) {
  const height = Math.min(naturalHeight, band.end - band.top)
  const top = clamp(center - height / 2, band.top, band.end - height)
  return { top, height, maxHeight: band.end - top }
}

function anchoredPlacement(input: PlacementInput, target: Rect): CardPlacement | null {
  const { viewport, card } = input
  const obstacles = input.obstacles ?? []
  const inflated = inflateRect(target, TARGET_INFLATE)
  const free = (rect: Rect) => !rectsIntersect(rect, inflated) && !obstacles.some((item) => rectsIntersect(rect, item))
  const sides = sideOrder(input.preferredSide)

  // 1ª passada: o card inteiro cabe num lado sem tocar alvo nem obstáculo.
  for (const side of sides) {
    const found = sideCandidates(side, target, card, viewport, obstacles).find(free)
    if (found) return anchored(side, found, sideCeiling(side, found, viewport))
  }

  // 2ª passada: ao lado (direita/esquerda), com a altura limitada à faixa livre
  // da coluna (janela menos obstáculos) mais próxima do alvo; o corpo rola.
  const center = target.top + target.height / 2
  for (const side of sides.filter((item) => item === 'direita' || item === 'esquerda')) {
    const left = side === 'direita' ? right(inflated) + LAYOUT_GAP : inflated.left - LAYOUT_GAP - card.width
    if (left < LAYOUT_MARGIN || left + card.width > viewport.width - LAYOUT_MARGIN) continue
    const band = nearestFreeBand({ left, width: card.width }, center, viewport, obstacles, SHEET_MIN_HEIGHT)
    if (!band) continue
    const fit = fitInBand(band, center, card.height)
    return anchored(side, { top: fit.top, left, width: card.width, height: fit.height }, fit.maxHeight)
  }
  return null
}

/**
 * Folha em coluna ao lado do alvo. Numa janela baixa (zoom alto na janela
 * mínima: 416×289 CSS px), nenhuma borda recebe a folha de largura cheia sem
 * cobrir um alvo do meio da altura (o rail, a sidebar), e a faixa acima ou
 * abaixo dele tem menos de 160 px. Sobra a coluna à direita (ou à esquerda) do
 * alvo, na altura inteira da janela: a folha fica nela, com a largura da coluna
 * (no máximo a do card) e a altura da faixa livre mais próxima do alvo; o corpo
 * rola e o rodapé continua visível. Colunas com menos de 160 px não contam.
 *
 * `respectObstacles` falso é o penúltimo recurso: cobrir um aviso (z 50) é o
 * preço de não cobrir o alvo, e isso fica declarado em `coversObstacle`.
 */
function sheetBesideTarget(input: PlacementInput, target: Rect, respectObstacles: boolean): CardPlacement | null {
  const { viewport, card } = input
  const allObstacles = input.obstacles ?? []
  const avoided = respectObstacles ? allObstacles : []
  const inflated = inflateRect(target, TARGET_INFLATE)
  const center = target.top + target.height / 2
  const columns = (['direita', 'esquerda'] as const)
    .map((side) => {
      const start = side === 'direita' ? right(inflated) + LAYOUT_GAP : LAYOUT_MARGIN
      const end = side === 'direita' ? viewport.width - LAYOUT_MARGIN : inflated.left - LAYOUT_GAP
      return { side, start, room: end - start }
    })
    .filter((column) => column.room >= SHEET_MIN_COLUMN_WIDTH)
    .sort(
      (a, b) =>
        Number(b.side === input.preferredSide) - Number(a.side === input.preferredSide) || b.room - a.room,
    )
  const minHeight = Math.min(SHEET_MIN_HEIGHT, viewport.height - LAYOUT_MARGIN * 2)
  for (const column of columns) {
    const width = Math.min(column.room, Math.max(card.width, SHEET_MIN_COLUMN_WIDTH))
    // Encostada no alvo: à direita começa logo depois dele; à esquerda termina logo antes.
    const left = column.side === 'direita' ? column.start : column.start + column.room - width
    const band = nearestFreeBand({ left, width }, center, viewport, avoided, minHeight)
    if (!band) continue
    const fit = fitInBand(band, center, card.height)
    const rect = { top: fit.top, left, width, height: fit.height }
    return {
      mode: 'folha',
      side: column.side,
      ...rect,
      maxHeight: fit.maxHeight,
      coversObstacle: allObstacles.some((item) => rectsIntersect(rect, item)),
    }
  }
  return null
}

/** Faixa livre entre o alvo e a borda da janela, cortada pelos obstáculos que a atravessam. */
function freeBand(edge: CardSide, target: Rect | null, viewport: Viewport, obstacles: readonly Rect[]) {
  let top = LAYOUT_MARGIN
  let end = viewport.height - LAYOUT_MARGIN
  if (target) {
    const inflated = inflateRect(target, TARGET_INFLATE)
    if (edge === 'baixo') top = Math.max(top, bottom(inflated) + LAYOUT_GAP)
    else end = Math.min(end, inflated.top - LAYOUT_GAP)
  }
  const sorted = [...obstacles].sort((a, b) => (edge === 'baixo' ? a.top - b.top : bottom(b) - bottom(a)))
  for (const obstacle of sorted) {
    if (bottom(obstacle) <= top || obstacle.top >= end) continue
    if (edge === 'baixo') {
      if (obstacle.top >= top) end = Math.min(end, obstacle.top - LAYOUT_GAP)
      else top = Math.max(top, bottom(obstacle) + LAYOUT_GAP)
    } else if (bottom(obstacle) <= end) {
      top = Math.max(top, bottom(obstacle) + LAYOUT_GAP)
    } else {
      end = Math.min(end, obstacle.top - LAYOUT_GAP)
    }
  }
  return { top, end }
}

/**
 * Modo folha, na ordem:
 * 1. largura cheia menos as margens, na borda oposta ao centro do alvo, sem
 *    tocar alvo nem obstáculo;
 * 2. com obstáculo nas duas bordas, encolhida entre o obstáculo e o alvo (piso
 *    de 160 px);
 * 3. na coluna ao lado do alvo, quando nenhuma borda cabe sem cobri-lo;
 * 4. cobrindo um obstáculo (limitação declarada: card em z 55 sobre o aviso em
 *    z 50), na borda e depois na coluna, mas nunca o alvo;
 * 5. só sem espaço nenhum (coluna com menos de 160 px dos dois lados), cobre o
 *    alvo. Um alvo maior que meia janela não conta como alvo a desviar.
 */
function sheetPlacement(input: PlacementInput): CardPlacement {
  const { viewport, target, card } = input
  const obstacles = input.obstacles ?? []
  const width = Math.max(0, viewport.width - LAYOUT_MARGIN * 2)
  const cap = Math.max(
    0,
    Math.min(Math.max(SHEET_MIN_HEIGHT, viewport.height * SHEET_HEIGHT_RATIO), viewport.height - LAYOUT_MARGIN * 2),
  )
  const height = Math.min(card.height, cap)
  const blocking = target && !isHugeTarget(target, viewport) ? inflateRect(target, TARGET_INFLATE) : null
  const targetCenter = target ? target.top + target.height / 2 : 0
  const edges: CardSide[] = targetCenter < viewport.height / 2 ? ['baixo', 'cima'] : ['cima', 'baixo']
  const at = (edge: CardSide, h: number): Rect => ({
    top: edge === 'baixo' ? viewport.height - LAYOUT_MARGIN - h : LAYOUT_MARGIN,
    left: LAYOUT_MARGIN,
    width,
    height: h,
  })
  const sheet = (edge: CardSide, rect: Rect, maxHeight: number, coversObstacle = false): CardPlacement => ({
    mode: 'folha',
    side: edge,
    ...rect,
    maxHeight,
    coversObstacle,
  })
  const hitsTarget = (rect: Rect) => blocking !== null && rectsIntersect(rect, blocking)

  for (const edge of edges) {
    const rect = at(edge, height)
    if (!hitsTarget(rect) && !obstacles.some((item) => rectsIntersect(rect, item))) return sheet(edge, rect, cap)
  }
  for (const edge of edges) {
    const band = freeBand(edge, target && blocking ? target : null, viewport, obstacles)
    const available = band.end - band.top
    if (available >= Math.min(SHEET_MIN_HEIGHT, cap)) {
      const h = Math.min(height, available)
      const top = edge === 'baixo' ? band.end - h : band.top
      return sheet(edge, { top, left: LAYOUT_MARGIN, width, height: h }, Math.min(cap, available))
    }
  }
  const beside = (respectObstacles: boolean) =>
    target && blocking ? sheetBesideTarget(input, target, respectObstacles) : null
  const column = beside(true)
  if (column) return column
  const coveringObstacle = edges.find((item) => !hitsTarget(at(item, height)))
  if (coveringObstacle) {
    const rect = at(coveringObstacle, height)
    return sheet(coveringObstacle, rect, cap, obstacles.some((item) => rectsIntersect(rect, item)))
  }
  const columnCoveringObstacle = beside(false)
  if (columnCoveringObstacle) return columnCoveringObstacle
  const rect = at(edges[0], height)
  return sheet(edges[0], rect, cap, obstacles.some((item) => rectsIntersect(rect, item)))
}

/**
 * Onde o card fica. Em viewport compacto (largura < 480 ou altura < 360) é
 * sempre folha. Senão testa os lados na ordem: o preferido do passo (rail e
 * sidebar → direita; inspector → esquerda), baixo, cima, esquerda e direita,
 * alinhando ao alvo com clamp e sem cruzar o alvo inflado em 4 px. Obstáculos
 * são evitados sempre que há lado livre. Nenhum lado cabe → folha. A folha
 * também desvia do alvo (na borda oposta ou na coluna ao lado dele); só um alvo
 * maior que meia janela pode ficar coberto, e, sem espaço nenhum (coluna com
 * menos de 160 px dos dois lados), a limitação declarada de `sheetPlacement`.
 * Determinístico.
 */
export function computeCardPlacement(input: PlacementInput): CardPlacement {
  if (isCompactViewport(input.viewport) || !input.target) return sheetPlacement(input)
  return anchoredPlacement(input, input.target) ?? sheetPlacement(input)
}

/** Retângulo do anel: o próprio alvo, contido na janela por 2 px para o contorno não sumir na borda. */
export function computeRingRect(target: Rect, viewport: Viewport): Rect {
  const left = clamp(target.left, RING_INSET, viewport.width - RING_INSET)
  const top = clamp(target.top, RING_INSET, viewport.height - RING_INSET)
  const rightEdge = clamp(right(target), RING_INSET, viewport.width - RING_INSET)
  const bottomEdge = clamp(bottom(target), RING_INSET, viewport.height - RING_INSET)
  return { top, left, width: Math.max(0, rightEdge - left), height: Math.max(0, bottomEdge - top) }
}

/**
 * Novo `scrollTop` do `.felixo-sidebar-scroll` para o alvo ficar inteiro na
 * área visível, ou `null` quando ele já está. Aplicado de forma instantânea
 * pela camada, só nesse contêiner.
 */
export function computeSidebarReveal(input: {
  target: Rect
  container: Rect
  scrollTop: number
  margin?: number
}): number | null {
  const margin = input.margin ?? 8
  const { target, container, scrollTop } = input
  if (target.top >= container.top && bottom(target) <= bottom(container)) return null
  if (bottom(target) > bottom(container)) {
    const delta = bottom(target) - bottom(container) + margin
    // Alvo mais alto que o contêiner: alinha pelo topo, que é onde o texto começa.
    const limited = target.height + margin * 2 > container.height ? target.top - container.top - margin : delta
    return Math.max(0, scrollTop + limited)
  }
  return Math.max(0, scrollTop - (container.top - target.top) - margin)
}

// ---------------------------------------------------------------------------
// Resolução do alvo de um passo
// ---------------------------------------------------------------------------

/** O mínimo de um elemento do DOM que a resolução usa (o `HTMLElement` real serve). */
export interface TargetNode {
  readonly isConnected: boolean
  closest(selector: string): unknown
  contains(other: unknown): boolean
  getBoundingClientRect(): Rect
}

export type TargetEnv = {
  viewport: Viewport
  query: (selector: string) => TargetNode | null
  /** Estilo computado (só `visibility` e `opacity` importam aqui). */
  style: (node: TargetNode) => { visibility: string; opacity: string }
  /** `.felixo-sidebar-scroll`, se existir: um alvo lá dentro pode estar abaixo da dobra. */
  scrollContainer: TargetNode | null
  elementFromPoint: (x: number, y: number) => unknown
}

export type TargetResolution = {
  anchor: AnchorId
  target: StepTarget
  element: TargetNode
  rect: Rect
  /** O alvo existe, mas está fora da área visível da sidebar: a camada rola o contêiner e resolve de novo. */
  needsReveal: boolean
  /** Nenhum alvo passou: o último da cadeia (sempre visível) foi usado assim mesmo. */
  fallback: boolean
}

function hasClosest(value: unknown): value is { closest(selector: string): unknown } {
  return typeof value === 'object' && value !== null && typeof (value as { closest?: unknown }).closest === 'function'
}

type Evaluation = { status: 'ok' | 'revelar'; element: TargetNode; rect: Rect } | { status: 'rejeitado' }

function evaluateTarget(target: StepTarget, env: TargetEnv): Evaluation {
  const element = env.query(ONBOARDING_ANCHORS[target.anchor])
  if (!element || !element.isConnected || element.closest(HIDDEN_ANCESTOR_SELECTOR)) return { status: 'rejeitado' }
  const style = env.style(element)
  if (style.visibility === 'hidden' || style.visibility === 'collapse' || !(Number(style.opacity) > 0)) {
    return { status: 'rejeitado' }
  }
  const rect = toRect(element.getBoundingClientRect())
  if (rect.width <= 0 || rect.height <= 0) return { status: 'rejeitado' }

  const screen = viewportRect(env.viewport)
  let visibleBox = screen
  const container = env.scrollContainer
  if (container && container !== element && container.contains(element)) {
    const box = toRect(container.getBoundingClientRect())
    if (visibleFraction(rect, box) < MIN_VISIBLE_FRACTION) {
      // Abaixo (ou acima) da dobra da sidebar: rolar só o contêiner resolve.
      return visibleFraction(box, screen) > 0 ? { status: 'revelar', element, rect } : { status: 'rejeitado' }
    }
    visibleBox = intersection(box, screen) ?? screen
  }
  if (visibleFraction(rect, screen) < MIN_VISIBLE_FRACTION) return { status: 'rejeitado' }

  const shown = intersection(rect, visibleBox) ?? rect
  const hit = env.elementFromPoint(shown.left + shown.width / 2, shown.top + shown.height / 2)
  const onTarget = hit === element || (hit !== null && hit !== undefined && element.contains(hit))
  const ownSurface = hasClosest(hit) && hit.closest(OWN_SURFACE_SELECTOR) !== null
  if (!onTarget && !ownSurface) return { status: 'rejeitado' }
  return { status: 'ok', element, rect }
}

/**
 * Primeiro alvo da cadeia que está conectado, fora de `[inert]`,
 * `[aria-hidden="true"]` e `[hidden]`, visível (`visibility`, `opacity`), com
 * pelo menos metade dentro da janela e da sidebar rolável e sem nada por cima
 * do centro (`elementFromPoint`). As superfícies do próprio tour não contam
 * como obstrução. Sem nenhum, usa o último da cadeia (sempre visível) se ele
 * existir; senão `null`.
 */
export function resolveStepTarget(
  step: { targets: readonly StepTarget[] },
  env: TargetEnv,
): TargetResolution | null {
  for (const target of step.targets) {
    const result = evaluateTarget(target, env)
    if (result.status === 'rejeitado') continue
    return {
      anchor: target.anchor,
      target,
      element: result.element,
      rect: result.rect,
      needsReveal: result.status === 'revelar',
      fallback: false,
    }
  }
  const last = step.targets.at(-1)
  if (!last) return null
  const element = env.query(ONBOARDING_ANCHORS[last.anchor])
  if (!element || !element.isConnected || element.closest(HIDDEN_ANCESTOR_SELECTOR)) return null
  const rect = toRect(element.getBoundingClientRect())
  if (rect.width <= 0 || rect.height <= 0) return null
  return { anchor: last.anchor, target: last, element, rect, needsReveal: false, fallback: true }
}

// ---------------------------------------------------------------------------
// Foco
// ---------------------------------------------------------------------------

/** O mínimo de um elemento focável que as regras de foco usam. */
export type FocusNode = {
  tagName?: string
  isConnected?: boolean
  closest?: (selector: string) => unknown
  getClientRects?: () => { length: number }
}

function tagOf(value: unknown): string {
  const tag = (value as FocusNode | null)?.tagName
  return typeof tag === 'string' ? tag.toUpperCase() : ''
}

function isDocumentRoot(value: unknown): boolean {
  const tag = tagOf(value)
  return tag === 'BODY' || tag === 'HTML'
}

/**
 * Exemplos do que NUNCA perde o foco para uma abertura automática: campos de
 * texto, terminal (xterm e a gaveta), webview, diálogos, modais e menus do
 * Felixo. Documentado e testado; a regra em si é uma lista de permissão.
 */
export const FOCUS_OWNERS_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '.xterm',
  '.xterm-helper-textarea',
  '[data-canvas-terminal-drawer]',
  'webview',
  '[role="dialog"]',
  '[aria-modal="true"]',
  '[data-felixo-popover-surface]',
].join(', ')

/**
 * A abertura automática só pode tirar o foco de "lugar nenhum": `null`,
 * `body`, `html` ou a própria região do canvas. Qualquer outro elemento foi
 * escolhido pela pessoa (um campo, o terminal, um botão da barra), e roubar o
 * foco dele desviaria teclas: Enter acionaria "Próximo" em vez de chegar à CLI.
 */
export function canStealFocus(active: unknown, canvasRegion?: unknown): boolean {
  if (active === null || active === undefined) return true
  if (canvasRegion !== undefined && canvasRegion !== null && active === canvasRegion) return true
  if (hasClosest(active) && active.closest(FOCUS_OWNERS_SELECTOR) !== null) return false
  return isDocumentRoot(active)
}

/**
 * Move o foco para o card ao abrir? Ajuda e "Ver" no aviso sempre movem (ação
 * da pessoa); a abertura automática do primeiro uso só move se `canStealFocus`;
 * retomada e volta do chat (`foco: 'manter'`) nunca movem.
 */
export function decideFocusOnOpen(input: {
  trigger: 'primeiro-uso' | 'ajuda' | 'novidade' | 'retomada'
  foco: 'mover' | 'manter'
  activeElement: unknown
  canvasRegion?: unknown
}): boolean {
  if (input.foco === 'manter' || input.trigger === 'retomada') return false
  if (input.trigger === 'primeiro-uso') return canStealFocus(input.activeElement, input.canvasRegion)
  return true
}

function isReturnable(candidate: unknown): candidate is FocusNode {
  if (typeof candidate !== 'object' || candidate === null) return false
  const node = candidate as FocusNode
  if (node.isConnected !== true || isDocumentRoot(node)) return false
  if (typeof node.closest === 'function' && node.closest(HIDDEN_ANCESTOR_SELECTOR) !== null) return false
  return typeof node.getClientRects !== 'function' || node.getClientRects().length > 0
}

/**
 * Para onde o foco volta quando o tour fecha: o elemento salvo na abertura, se
 * ainda estiver conectado, visível e fora de `inert`; senão o botão Ajuda; senão
 * a região do canvas. Só devolve se o foco estava no card ao fechar e ninguém o
 * levou para outro lugar desde então (`current` ainda é `body` ou nada).
 */
export function resolveReturnFocus<T>(input: {
  focusWasInside: boolean
  current: unknown
  saved: unknown
  helpTrigger: T | null
  canvas: T | null
}): T | null {
  if (!input.focusWasInside) return null
  if (input.current !== null && input.current !== undefined && !isDocumentRoot(input.current)) return null
  for (const candidate of [input.saved, input.helpTrigger, input.canvas]) {
    if (isReturnable(candidate)) return candidate as T
  }
  return null
}

/** Há um diálogo modal aberto (AgentQuestionDialog, HandoffDialog)? Então o Esc e os anúncios são dele. */
export function hasOpenModal(root: { querySelector(selector: string): unknown } | null | undefined): boolean {
  return Boolean(root && root.querySelector('[aria-modal="true"]'))
}

// ---------------------------------------------------------------------------
// Stacking context do host na árvore
// ---------------------------------------------------------------------------

export type ContainingBlockStyle = {
  transform?: string
  filter?: string
  perspective?: string
  contain?: string
  isolation?: string
  willChange?: string
  backdropFilter?: string
}

const isSet = (value: string | undefined) => Boolean(value && value !== 'none' && value !== 'auto' && value !== 'normal')

/** Propriedade que faz este estilo criar containing block ou stacking context, ou `null`. */
export function containingBlockReason(style: ContainingBlockStyle): string | null {
  if (isSet(style.transform)) return 'transform'
  if (isSet(style.filter)) return 'filter'
  if (isSet(style.perspective)) return 'perspective'
  if (style.contain && /\b(paint|layout|strict|content)\b/.test(style.contain)) return 'contain'
  if (style.isolation === 'isolate') return 'isolation'
  if (style.willChange && /\b(transform|filter|perspective)\b/.test(style.willChange)) return 'will-change'
  if (isSet(style.backdropFilter)) return 'backdrop-filter'
  return null
}

type ParentChain = { parentElement: ParentChain | null }

/**
 * Algum ancestral do host cria containing block ou stacking context? Se sim, o
 * `position: fixed` e o z 55 do tour ficariam presos a ele, e um diálogo (z 60)
 * poderia ficar por baixo. Verificado no smoke; o plano B é um host irmão no shell.
 */
export function ancestorCreatesContainingBlock<T extends ParentChain>(
  element: T,
  getStyle: (node: T) => ContainingBlockStyle,
): boolean {
  for (let node = element.parentElement as T | null; node; node = node.parentElement as T | null) {
    if (containingBlockReason(getStyle(node))) return true
  }
  return false
}
