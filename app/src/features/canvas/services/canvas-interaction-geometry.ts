import type { SurfaceOccupancy } from './canvas-surfaces'

/** Alturas publicadas pelo chrome fixo em `index.css`. */
export const CANVAS_TOPBAR_HEIGHT = 48
export const CANVAS_STATUSBAR_HEIGHT = 30

export type CanvasScreenRect = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export type CanvasFlowBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type CanvasSafeViewport = {
  x: number
  y: number
  zoom: number
}

export type CanvasSafeViewportOptions = {
  /** Mantém a mesma escala de respiro do `fitView` do React Flow. */
  padding?: number
  minZoom?: number
  maxZoom?: number
}

type CanvasRectLike = {
  left: number
  top: number
  right: number
  bottom: number
  width?: number
  height?: number
}

export type CanvasSafeAreaOptions = {
  /** A gaveta é irmã do flow container e já está fora do seu rect. */
  drawerOutsideContainer?: boolean
  topbarHeight?: number
  statusbarHeight?: number
  /** Reserva adicional para um dock que ainda não virou coluna permanente. */
  bottomExtra?: number
}

function finiteNonNegative(value: number | undefined, fallback = 0): number {
  return Number.isFinite(value) ? Math.max(0, value as number) : fallback
}

/**
 * Retângulo de tela onde um node pode ser criado ou enquadrado sem ficar sob
 * uma superfície fixa. O flow container continua full-bleed para preservar o
 * pan livre; esta função só traduz o chrome interativo em insets explícitos.
 */
export function getCanvasSafeArea(
  container: CanvasRectLike,
  occupancy: Pick<SurfaceOccupancy, 'toolbar' | 'panel' | 'drawer' | 'inspector'>,
  options: CanvasSafeAreaOptions = {},
): CanvasScreenRect {
  const topInset = finiteNonNegative(options.topbarHeight, CANVAS_TOPBAR_HEIGHT)
  const bottomInset =
    finiteNonNegative(options.statusbarHeight, CANVAS_STATUSBAR_HEIGHT) +
    finiteNonNegative(options.bottomExtra)
  const leftInset =
    finiteNonNegative(occupancy.toolbar) + finiteNonNegative(occupancy.panel)
  const rightInset =
    finiteNonNegative(occupancy.inspector) +
    (options.drawerOutsideContainer ? 0 : finiteNonNegative(occupancy.drawer))
  const left = Math.min(container.right, container.left + leftInset)
  const top = Math.min(container.bottom, container.top + topInset)
  const right = Math.max(container.left, container.right - rightInset)
  const bottom = Math.max(container.top, container.bottom - bottomInset)

  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  }
}

/** Centro de uma área de tela, usado para escolher o alvo de enquadramento. */
export function canvasScreenCenter(rect: Pick<CanvasScreenRect, 'left' | 'top' | 'right' | 'bottom'>): { x: number; y: number } {
  return {
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2,
  }
}

/**
 * Coordenada flow que deve ficar no centro do viewport para que um node seja
 * visto no centro da área útil. React Flow centraliza no container inteiro;
 * este deslocamento compensa a assimetria do chrome em pixels de tela.
 */
export function flowCenterForSafeArea(
  nodeCenter: { x: number; y: number },
  container: Pick<CanvasScreenRect, 'left' | 'top' | 'right' | 'bottom'>,
  safeArea: Pick<CanvasScreenRect, 'left' | 'top' | 'right' | 'bottom'>,
  zoom: number,
): { x: number; y: number } {
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  const containerCenter = canvasScreenCenter(container)
  const safeCenter = canvasScreenCenter(safeArea)

  return {
    x: nodeCenter.x + (containerCenter.x - safeCenter.x) / scale,
    y: nodeCenter.y + (containerCenter.y - safeCenter.y) / scale,
  }
}

/** Deslocamento em pixels para corrigir um fit feito no viewport inteiro. */
export function safeViewportOffset(
  container: Pick<CanvasScreenRect, 'left' | 'top' | 'right' | 'bottom'>,
  safeArea: Pick<CanvasScreenRect, 'left' | 'top' | 'right' | 'bottom'>,
): { x: number; y: number } {
  const containerCenter = canvasScreenCenter(container)
  const safeCenter = canvasScreenCenter(safeArea)
  return {
    x: safeCenter.x - containerCenter.x,
    y: safeCenter.y - containerCenter.y,
  }
}

/**
 * Calcula o viewport que enquadra os bounds dentro da área útil, e não no
 * retângulo inteiro do flow. O `fitView` nativo centraliza no container todo;
 * em uma tela com sidebar e inspector isso pode colocar a extremidade do
 * grafo por baixo dessas superfícies. O resultado usa coordenadas relativas
 * ao container do React Flow, como `setViewport` espera.
 */
export function viewportForSafeArea(
  bounds: CanvasFlowBounds,
  container: Pick<CanvasScreenRect, 'left' | 'top' | 'right' | 'bottom'>,
  safeArea: Pick<CanvasScreenRect, 'left' | 'top' | 'right' | 'bottom'>,
  options: CanvasSafeViewportOptions = {},
): CanvasSafeViewport | undefined {
  if (
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    return undefined
  }

  const safeWidth = Math.max(0, safeArea.right - safeArea.left)
  const safeHeight = Math.max(0, safeArea.bottom - safeArea.top)
  if (safeWidth <= 0 || safeHeight <= 0) {
    return undefined
  }

  const padding = Number.isFinite(options.padding) ? Math.max(0, options.padding as number) : 0
  // React Flow resolves a numeric padding to:
  // `viewport - viewport / (1 + padding)`, split over both sides.
  const availableWidth = safeWidth / (1 + padding)
  const availableHeight = safeHeight / (1 + padding)
  const rawZoom = Math.min(availableWidth / bounds.width, availableHeight / bounds.height)
  const minZoom = Number.isFinite(options.minZoom) ? Math.max(0, options.minZoom as number) : 0.05
  const maxZoom = Number.isFinite(options.maxZoom)
    ? Math.max(minZoom, options.maxZoom as number)
    : 2
  const zoom = Math.min(maxZoom, Math.max(minZoom, rawZoom))
  const safeCenter = canvasScreenCenter(safeArea)
  const boundsCenter = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  }

  return {
    x: safeCenter.x - container.left - boundsCenter.x * zoom,
    y: safeCenter.y - container.top - boundsCenter.y * zoom,
    zoom,
  }
}

/** Normaliza um rect do DOM para que os testes não dependam de DOMRect. */
export function normalizeCanvasScreenRect(rect: CanvasRectLike): CanvasScreenRect {
  const right = Number.isFinite(rect.right) ? rect.right : rect.left + (rect.width ?? 0)
  const bottom = Number.isFinite(rect.bottom) ? rect.bottom : rect.top + (rect.height ?? 0)
  return {
    left: rect.left,
    top: rect.top,
    right,
    bottom,
    width: Math.max(0, right - rect.left),
    height: Math.max(0, bottom - rect.top),
  }
}

/**
 * Hit-test simples para a auditoria E2E: bordas que só encostam não são
 * oclusão, mas qualquer área compartilhada entre duas superfícies é.
 */
export function screenRectsOverlap(
  first: Pick<CanvasScreenRect, 'left' | 'top' | 'right' | 'bottom'>,
  second: Pick<CanvasScreenRect, 'left' | 'top' | 'right' | 'bottom'>,
): boolean {
  return (
    Math.min(first.right, second.right) > Math.max(first.left, second.left) &&
    Math.min(first.bottom, second.bottom) > Math.max(first.top, second.top)
  )
}
