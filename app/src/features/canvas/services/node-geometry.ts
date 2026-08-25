// Geometria pura do canvas: tamanhos padrão, posicionamento livre de blocos,
// hit-test de grupos e roteamento de arestas pelos lados mais próximos.
import type { Node } from '@xyflow/react'
import type { CanvasNodeType } from '../types'

export const DEFAULT_SIZE: Record<
  CanvasNodeType,
  { width: number; height: number }
> = {
  group: { width: 480, height: 320 },
  file: { width: 320, height: 260 },
  terminal: { width: 520, height: 360 },
  note: { width: 220, height: 160 },
  webpage: { width: 560, height: 420 },
}

const NODE_PLACEMENT_GAP = 32
const VIEWPORT_PLACEMENT_PADDING = { x: 40, top: 88, bottom: 40 }

export type CanvasBounds = { x: number; y: number; width: number; height: number }

/** Encontra uma posição livre ao redor de um bloco existente. */
export function findFreeNodePositionNearNode(
  nodes: Node[],
  sourceId: string,
  size: NodeSize,
): Position {
  const source = nodes.find((node) => node.id === sourceId)
  if (!source || source.parentId) {
    return findFreeNodePosition(nodes, size)
  }

  const sourceSize = getNodeSize(source)
  const candidates = [
    { x: source.position.x + sourceSize.width + NODE_PLACEMENT_GAP, y: source.position.y },
    { x: source.position.x - size.width - NODE_PLACEMENT_GAP, y: source.position.y },
    { x: source.position.x, y: source.position.y + sourceSize.height + NODE_PLACEMENT_GAP },
    { x: source.position.x, y: source.position.y - size.height - NODE_PLACEMENT_GAP },
  ]
  const topLevelNodes = nodes.filter((node) => !node.parentId)

  return candidates.find((candidate) => isPositionFree(candidate, size, topLevelNodes)) ??
    findFreeNodePosition(nodes, size)
}

export type Side = 'top' | 'right' | 'bottom' | 'left'

type Position = { x: number; y: number }

type NodeSize = { width: number; height: number }

/**
 * Finds the closest free top-level position, preferring the currently visible
 * canvas. Candidate coordinates follow existing node edges, which keeps the
 * layout aligned while avoiding overlap between differently sized blocks.
 */
export function findFreeNodePosition(
  nodes: Node[],
  size: NodeSize,
  viewport?: CanvasBounds,
): Position {
  const origin = placementOrigin(viewport)
  const { topLevelNodes, candidates } = placementCandidates(nodes, origin)
  const visibleCandidates = viewport
    ? candidates.filter(
        (candidate) => isVisiblePlacement(candidate, size, viewport),
      )
    : candidates

  return (
    visibleCandidates.find((candidate) =>
      isPositionFree(candidate, size, topLevelNodes),
    ) ??
    candidates.find((candidate) =>
      isPositionFree(candidate, size, topLevelNodes),
    ) ?? {
      x: origin.x,
      y:
        Math.max(
          origin.y,
          ...topLevelNodes.map(
            (node) =>
              node.position.y + getNodeSize(node).height + NODE_PLACEMENT_GAP,
          ),
        ),
    }
  )
}

/**
 * Finds one free area for a whole batch, then lays it out as a near-square
 * matrix. This keeps agents launched from the queue visually grouped rather
 * than extending one long row or column. The matrix is tested as a whole
 * against existing nodes, so no member is forced out of the group by a block
 * that already occupies the canvas.
 */
export function findFreeNodePositions(
  nodes: Node[],
  count: number,
  size: NodeSize,
  viewport?: CanvasBounds,
): Position[] {
  if (count <= 0) {
    return []
  }

  if (count === 1) {
    return [findFreeNodePosition(nodes, size, viewport)]
  }

  const origin = placementOrigin(viewport)
  const { topLevelNodes, candidates } = placementCandidates(nodes, origin)
  const matrix = matrixMetrics(count, size)
  const matrixAt = (anchor: Position) => matrixPositions(anchor, count, size, matrix.columns)
  const hasFreeMatrix = (anchor: Position) =>
    matrixAt(anchor).every((position) => isPositionFree(position, size, topLevelNodes))
  const visibleCandidates = viewport
    ? candidates.filter((candidate) => isVisiblePlacement(candidate, matrix, viewport))
    : candidates
  const anchor =
    visibleCandidates.find(hasFreeMatrix) ??
    candidates.find(hasFreeMatrix) ?? {
      x: origin.x,
      y: Math.max(
        origin.y,
        ...topLevelNodes.map(
          (node) => node.position.y + getNodeSize(node).height + NODE_PLACEMENT_GAP,
        ),
      ),
    }

  return matrixAt(anchor)
}

function placementOrigin(viewport?: CanvasBounds): Position {
  return viewport
    ? {
        x: viewport.x + VIEWPORT_PLACEMENT_PADDING.x,
        y: viewport.y + VIEWPORT_PLACEMENT_PADDING.top,
      }
    : { x: 120, y: 120 }
}

function placementCandidates(
  nodes: Node[],
  origin: Position,
): { topLevelNodes: Node[]; candidates: Position[] } {
  const topLevelNodes = nodes.filter((node) => !node.parentId)
  const xCandidates = uniqueSortedCoordinates([
    origin.x,
    ...topLevelNodes.map(
      (node) => node.position.x + getNodeSize(node).width + NODE_PLACEMENT_GAP,
    ),
  ]).filter((x) => x >= origin.x)
  const yCandidates = uniqueSortedCoordinates([
    origin.y,
    ...topLevelNodes.map(
      (node) => node.position.y + getNodeSize(node).height + NODE_PLACEMENT_GAP,
    ),
  ]).filter((y) => y >= origin.y)

  return {
    topLevelNodes,
    candidates: yCandidates.flatMap((y) => xCandidates.map((x) => ({ x, y }))),
  }
}

function matrixMetrics(count: number, size: NodeSize): NodeSize & { columns: number } {
  const columns = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / columns)
  return {
    columns,
    width: columns * size.width + (columns - 1) * NODE_PLACEMENT_GAP,
    height: rows * size.height + (rows - 1) * NODE_PLACEMENT_GAP,
  }
}

function matrixPositions(
  anchor: Position,
  count: number,
  size: NodeSize,
  columns: number,
): Position[] {
  return Array.from({ length: count }, (_, index) => ({
    x: anchor.x + (index % columns) * (size.width + NODE_PLACEMENT_GAP),
    y: anchor.y + Math.floor(index / columns) * (size.height + NODE_PLACEMENT_GAP),
  }))
}

function isVisiblePlacement(
  position: Position,
  size: NodeSize,
  viewport: CanvasBounds,
): boolean {
  return (
    position.x + size.width <=
      viewport.x + viewport.width - VIEWPORT_PLACEMENT_PADDING.x &&
    position.y + size.height <=
      viewport.y + viewport.height - VIEWPORT_PLACEMENT_PADDING.bottom
  )
}

function isPositionFree(
  position: Position,
  size: NodeSize,
  nodes: Node[],
): boolean {
  return nodes.every((node) => {
    const nodeSize = getNodeSize(node)
    return (
      position.x + size.width + NODE_PLACEMENT_GAP <= node.position.x ||
      position.x >= node.position.x + nodeSize.width + NODE_PLACEMENT_GAP ||
      position.y + size.height + NODE_PLACEMENT_GAP <= node.position.y ||
      position.y >= node.position.y + nodeSize.height + NODE_PLACEMENT_GAP
    )
  })
}

export function getNodeSize(node: Node): { width: number; height: number } {
  const fallback = DEFAULT_SIZE[node.type as CanvasNodeType] ?? DEFAULT_SIZE.note
  return {
    width: node.width ?? node.measured?.width ?? fallback.width,
    height: node.height ?? node.measured?.height ?? fallback.height,
  }
}

function uniqueSortedCoordinates(values: number[]): number[] {
  return [...new Set(values.map((value) => Math.round(value)))].sort(
    (left, right) => left - right,
  )
}

/** True when the dragged node's top-left sits within the group's bounds. */
export function isInside(node: Node, group: Node): boolean {
  const gx = group.position.x
  const gy = group.position.y
  const gw = group.width ?? group.measured?.width ?? 0
  const gh = group.height ?? group.measured?.height ?? 0

  return (
    node.position.x >= gx &&
    node.position.y >= gy &&
    node.position.x <= gx + gw &&
    node.position.y <= gy + gh
  )
}

/** Center point and half-extents of a node, from its current geometry. */
function nodeCenter(node: Node): { x: number; y: number } {
  const width = node.width ?? node.measured?.width ?? 0
  const height = node.height ?? node.measured?.height ?? 0
  return {
    x: node.position.x + width / 2,
    y: node.position.y + height / 2,
  }
}

/**
 * Pick the source/target sides whose handles face each other, so a connection
 * leaves and enters by the nearest edge instead of always the top handle.
 * Chooses horizontal sides (left/right) when the nodes are mostly side by side,
 * vertical sides (top/bottom) when they're mostly stacked.
 */
export function nearestSides(
  source: Node,
  target: Node,
): { source: Side; target: Side } {
  const a = nodeCenter(source)
  const b = nodeCenter(target)
  const dx = b.x - a.x
  const dy = b.y - a.y

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { source: 'right', target: 'left' }
      : { source: 'left', target: 'right' }
  }
  return dy >= 0
    ? { source: 'bottom', target: 'top' }
    : { source: 'top', target: 'bottom' }
}
