import { describe, expect, it } from 'vitest'
import {
  clamp,
  draggedRowIndex,
  dropTargetIndex,
  moveById,
  moveItem,
  pointerEdge,
  previewIndex,
  rowShift,
} from './terminals-panel-reorder'

describe('moveItem', () => {
  it('moves an item down the list', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
  })

  it('moves an item up the list', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('promotes the second item to first', () => {
    expect(moveItem(['a', 'b', 'c'], 1, 0)).toEqual(['b', 'a', 'c'])
  })

  it('returns the same array reference for a no-op move, so callers can skip persisting', () => {
    const items = ['a', 'b']
    expect(moveItem(items, 1, 1)).toBe(items)
  })

  it('ignores out-of-range indices instead of inserting undefined', () => {
    const items = ['a', 'b']
    expect(moveItem(items, 5, 0)).toBe(items)
    expect(moveItem(items, 0, 9)).toBe(items)
    expect(moveItem(items, -1, 0)).toBe(items)
  })
})

describe('dropTargetIndex', () => {
  it('drops before a row above the dragged one', () => {
    // ['a','b','c'], dragging 'c' (2) onto the top half of 'a' (0) => index 0.
    expect(dropTargetIndex(2, 0, 'before')).toBe(0)
  })

  it('drops after a row above the dragged one', () => {
    expect(dropTargetIndex(2, 0, 'after')).toBe(1)
  })

  it('compensates for the dragged row being plucked out when moving downwards', () => {
    // ['a','b','c'], dragging 'a' (0) onto the bottom half of 'c' (2). The
    // naive insert index is 3, but 'a' is removed first, so everything after
    // it shifts up by one and the real landing spot is 2 (the last slot).
    expect(dropTargetIndex(0, 2, 'after')).toBe(2)
  })

  it('does not compensate when moving upwards, where nothing before the target shifts', () => {
    expect(dropTargetIndex(2, 1, 'before')).toBe(1)
  })
})

describe('moveById', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('promotes a block to first', () => {
    expect(moveById(items, 'c', 'a', 'before')).toEqual([
      { id: 'c' },
      { id: 'a' },
      { id: 'b' },
    ])
  })

  it('sends a block to last', () => {
    expect(moveById(items, 'a', 'c', 'after')).toEqual([
      { id: 'b' },
      { id: 'c' },
      { id: 'a' },
    ])
  })

  it('swaps with the next neighbour (the Alt+ArrowDown case)', () => {
    expect(moveById(items, 'a', 'b', 'after')).toEqual([
      { id: 'b' },
      { id: 'a' },
      { id: 'c' },
    ])
  })

  it('ignores unknown ids instead of dropping or duplicating a block', () => {
    expect(moveById(items, 'ghost', 'a', 'before')).toBe(items)
    expect(moveById(items, 'a', 'ghost', 'before')).toBe(items)
  })

  it('is a no-op when a block is dropped on itself', () => {
    expect(moveById(items, 'b', 'b', 'before')).toBe(items)
  })

  it('works when the dock indices are not the array indices (filtered view)', () => {
    // The dock hides typeless nodes, so the row the user dropped on can sit at
    // a different index in the full node array — ids sidestep that entirely.
    const full = [{ id: 'hidden' }, ...items]
    expect(moveById(full, 'c', 'a', 'before')).toEqual([
      { id: 'hidden' },
      { id: 'c' },
      { id: 'a' },
      { id: 'b' },
    ])
  })
})

// Three 40px-tall rows starting at y=100: [100–140], [140–180], [180–220].
const rects = [
  { top: 100, height: 40 },
  { top: 140, height: 40 },
  { top: 180, height: 40 },
]

describe('draggedRowIndex', () => {
  it('stays put while the row has not cleared a neighbour midpoint', () => {
    expect(draggedRowIndex(135, 0, rects)).toBe(0)
  })

  it('takes the next slot once it clears that row midpoint', () => {
    expect(draggedRowIndex(165, 0, rects)).toBe(1)
  })

  it('walks past several rows in one move (fast drag)', () => {
    expect(draggedRowIndex(215, 0, rects)).toBe(2)
  })

  it('moves upwards symmetrically', () => {
    expect(draggedRowIndex(115, 2, rects)).toBe(0)
    expect(draggedRowIndex(155, 2, rects)).toBe(1)
  })

  it('cannot go past the ends of the list', () => {
    expect(draggedRowIndex(-9999, 1, rects)).toBe(0)
    expect(draggedRowIndex(9999, 1, rects)).toBe(2)
  })
})

describe('rowShift', () => {
  it('does not move the dragged row itself (the pointer delta drives it)', () => {
    expect(rowShift(0, 0, 2, rects)).toBe(0)
  })

  it('slides passed-over rows up when the drag goes down', () => {
    expect(rowShift(1, 0, 2, rects)).toBe(-40)
    expect(rowShift(2, 0, 2, rects)).toBe(-40)
  })

  it('slides passed-over rows down when the drag goes up', () => {
    expect(rowShift(0, 2, 0, rects)).toBe(40)
    expect(rowShift(1, 2, 0, rects)).toBe(40)
  })

  it('leaves rows outside the travelled range alone', () => {
    expect(rowShift(2, 0, 1, rects)).toBe(0)
  })
})

describe('previewIndex', () => {
  it('shows the dragged row already at its landing slot', () => {
    expect(previewIndex(0, 0, 2)).toBe(2)
  })

  it('renumbers passed-over rows for a downward drag', () => {
    expect(previewIndex(1, 0, 2)).toBe(0)
    expect(previewIndex(2, 0, 2)).toBe(1)
  })

  it('renumbers passed-over rows for an upward drag', () => {
    expect(previewIndex(0, 2, 0)).toBe(1)
    expect(previewIndex(1, 2, 0)).toBe(2)
  })

  it('leaves untouched rows on their own number', () => {
    expect(previewIndex(2, 0, 1)).toBe(2)
  })

  it('is the identity when nothing has moved yet', () => {
    expect([0, 1, 2].map((index) => previewIndex(index, 1, 1))).toEqual([0, 1, 2])
  })
})

describe('clamp', () => {
  it('passes values inside the range through', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })

  it('caps at both ends', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(50, 0, 10)).toBe(10)
  })
})

describe('pointerEdge', () => {
  it('reports the top half as "before"', () => {
    expect(pointerEdge(105, { top: 100, height: 40 })).toBe('before')
  })

  it('reports the bottom half as "after"', () => {
    expect(pointerEdge(135, { top: 100, height: 40 })).toBe('after')
  })

  it('treats the exact midpoint as "after" so the boundary is not ambiguous', () => {
    expect(pointerEdge(120, { top: 100, height: 40 })).toBe('after')
  })
})
