/**
 * Reordering math for the "Elementos" dock, extracted so it's unit-testable
 * without a DOM. The dock's list order IS the canvas node array order, which
 * also drives each terminal's "#N" badge — so moving a row here renumbers the
 * blocks themselves.
 */

/** Moves one item to another index, returning a new array. Out-of-range or
 * no-op moves return the input array unchanged (so callers can skip a state
 * update / persistence round-trip cheaply). */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return items as T[]
  }

  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/**
 * Where a row dropped ON `targetIndex` should land. HTML5 drag-and-drop
 * reports the row the pointer is over plus which half of it (`before`/
 * `after`); dragging downwards also shifts everything after the dragged row up
 * by one once it's plucked out, which this compensates for.
 */
export function dropTargetIndex(
  fromIndex: number,
  targetIndex: number,
  edge: 'before' | 'after',
): number {
  const insertAt = edge === 'after' ? targetIndex + 1 : targetIndex
  return insertAt > fromIndex ? insertAt - 1 : insertAt
}

/**
 * Moves the item with `nodeId` so it lands immediately before/after
 * `targetId`. Ids rather than indices, because the dock renders a filtered
 * view of the node list — its row indices are not node-array indices.
 * Unknown ids or a no-op move return the input array unchanged.
 */
export function moveById<T extends { id: string }>(
  items: readonly T[],
  nodeId: string,
  targetId: string,
  edge: 'before' | 'after',
): T[] {
  const from = items.findIndex((item) => item.id === nodeId)
  const target = items.findIndex((item) => item.id === targetId)
  if (from === -1 || target === -1) {
    return items as T[]
  }
  return moveItem(items, from, dropTargetIndex(from, target, edge))
}

/** Which half of a row the pointer is in — the row's own bounding box. */
export function pointerEdge(clientY: number, rect: { top: number; height: number }) {
  return clientY < rect.top + rect.height / 2 ? ('before' as const) : ('after' as const)
}

/**
 * Where the row being dragged currently belongs, given the pointer's Y and the
 * on-screen box of every row (in list order, as laid out BEFORE the drag —
 * rows only shift visually, they are not re-measured mid-drag).
 *
 * The dragged row is treated as occupying the slot the pointer is over, so the
 * result is directly a target index in the list (no before/after edge to
 * resolve): the row is past a given slot once the pointer clears that slot's
 * midpoint, which is what makes the neighbours swap one at a time as the
 * pointer travels.
 */
export function draggedRowIndex(
  clientY: number,
  fromIndex: number,
  rects: readonly { top: number; height: number }[],
): number {
  let index = fromIndex

  // Moving down: step past every row below whose midpoint the pointer cleared.
  for (let candidate = fromIndex + 1; candidate < rects.length; candidate += 1) {
    const rect = rects[candidate]
    if (clientY > rect.top + rect.height / 2) {
      index = candidate
    } else {
      break
    }
  }

  // Moving up: same, walking towards the top of the list.
  for (let candidate = fromIndex - 1; candidate >= 0; candidate -= 1) {
    const rect = rects[candidate]
    if (clientY < rect.top + rect.height / 2) {
      index = candidate
    } else {
      break
    }
  }

  return index
}

/**
 * How far each row must slide (in px) to show the gap opening up while a row
 * is dragged from `fromIndex` to `toIndex`: every row between the two shifts
 * one slot towards the vacated one, and the rest stay put.
 */
export function rowShift(
  index: number,
  fromIndex: number,
  toIndex: number,
  rects: readonly { height: number }[],
): number {
  if (index === fromIndex) {
    return 0
  }
  if (fromIndex < toIndex && index > fromIndex && index <= toIndex) {
    return -rects[fromIndex].height
  }
  if (fromIndex > toIndex && index >= toIndex && index < fromIndex) {
    return rects[fromIndex].height
  }
  return 0
}

/**
 * The slot a row would occupy if the in-flight drag were dropped right now,
 * so the "#N" badges preview the resulting order instead of freezing at the
 * pre-drag numbering.
 */
export function previewIndex(index: number, fromIndex: number, toIndex: number): number {
  if (index === fromIndex) {
    return toIndex
  }
  if (fromIndex < toIndex && index > fromIndex && index <= toIndex) {
    return index - 1
  }
  if (fromIndex > toIndex && index >= toIndex && index < fromIndex) {
    return index + 1
  }
  return index
}

/** Keeps a value inside `[min, max]`; `min` wins when the range is inverted. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
