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
}

const NODE_PLACEMENT_GAP = 32
const VIEWPORT_PLACEMENT_PADDING = { x: 40, top: 88, bottom: 40 }

export type CanvasBounds = { x: number; y: number; width: number; height: number }

export type Side = 'top' | 'right' | 'bottom' | 'left'

/**
 * Finds the closest free top-level position, preferring the currently visible
 * canvas. Candidate coordinates follow existing node edges, which keeps the
 * layout aligned while avoiding overlap between differently sized blocks.
 */
export function findFreeNodePosition(
  nodes: Node[],
  size: { width: number; height: number },
  viewport?: CanvasBounds,
): { x: number; y: number } {
  const origin = viewport
    ? {
        x: viewport.x + VIEWPORT_PLACEMENT_PADDING.x,
        y: viewport.y + VIEWPORT_PLACEMENT_PADDING.top,
      }
    : { x: 120, y: 120 }
  const topLevelNodes = nodes.filter((node) => !node.parentId)
  const xCandidates = uniqueSortedCoordinates([
    origin.x,
    ...topLevelNodes.map(
      (node) =>
        node.position.x + getNodeSize(node).width + NODE_PLACEMENT_GAP,
    ),
  ]).filter((x) => x >= origin.x)
  const yCandidates = uniqueSortedCoordinates([
    origin.y,
    ...topLevelNodes.map(
      (node) =>
        node.position.y + getNodeSize(node).height + NODE_PLACEMENT_GAP,
    ),
  ]).filter((y) => y >= origin.y)
  const candidates = yCandidates.flatMap((y) =>
    xCandidates.map((x) => ({ x, y })),
  )
  const visibleCandidates = viewport
    ? candidates.filter(
        (candidate) =>
          candidate.x + size.width <=
            viewport.x + viewport.width - VIEWPORT_PLACEMENT_PADDING.x &&
          candidate.y + size.height <=
            viewport.y + viewport.height - VIEWPORT_PLACEMENT_PADDING.bottom,
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

function isPositionFree(
  position: { x: number; y: number },
  size: { width: number; height: number },
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
