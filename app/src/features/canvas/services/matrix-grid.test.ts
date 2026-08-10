import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import {
  assignSlots,
  cellSize,
  MATRIX_GAP,
  matrixAnchor,
  matrixBounds,
  matrixColumns,
  slotPosition,
} from './matrix-grid'

function node(id: string, x: number, y: number, size?: { width: number; height: number }): Node {
  return {
    id,
    type: 'terminal',
    position: { x, y },
    width: size?.width ?? 520,
    height: size?.height ?? 360,
    data: {},
  }
}

describe('cellSize', () => {
  it('uses the largest block so nothing overlaps', () => {
    const nodes = [
      node('note', 0, 0, { width: 220, height: 160 }),
      node('web', 0, 0, { width: 560, height: 420 }),
      node('terminal', 0, 0, { width: 520, height: 360 }),
    ]

    expect(cellSize(nodes)).toEqual({ width: 560, height: 420 })
  })

  it('falls back to the type default when a block has no measured size', () => {
    const bare: Node = { id: 'bare', type: 'terminal', position: { x: 0, y: 0 }, data: {} }

    expect(cellSize([bare])).toEqual({ width: 520, height: 360 })
  })
})

describe('matrixAnchor', () => {
  it('anchors on the topmost-leftmost corner', () => {
    const nodes = [node('a', 900, 700), node('b', 300, 200), node('c', 1500, 1200)]

    expect(matrixAnchor(nodes)).toEqual({ x: 300, y: 200 })
  })

  it('takes x and y independently, from different blocks if needed', () => {
    const nodes = [node('leftmost', 100, 900), node('topmost', 800, 100)]

    expect(matrixAnchor(nodes)).toEqual({ x: 100, y: 100 })
  })

  it('handles negative coordinates', () => {
    const nodes = [node('a', -500, -300), node('b', 100, 100)]

    expect(matrixAnchor(nodes)).toEqual({ x: -500, y: -300 })
  })
})

describe('matrixColumns', () => {
  it('builds a near-square grid', () => {
    expect(matrixColumns(2)).toBe(2)
    expect(matrixColumns(4)).toBe(2)
    expect(matrixColumns(5)).toBe(3)
    expect(matrixColumns(9)).toBe(3)
  })
})

describe('assignSlots', () => {
  it('fills row by row', () => {
    const groups = [[node('a', 0, 0)], [node('b', 0, 0)], [node('c', 0, 0)]]

    const slots = assignSlots(groups, 2)

    expect(slots.get('a')).toEqual({ row: 0, column: 0 })
    expect(slots.get('b')).toEqual({ row: 0, column: 1 })
    expect(slots.get('c')).toEqual({ row: 1, column: 0 })
  })

  it('never splits a group that still fits in the next row', () => {
    // 3 columns; the pair would straddle rows 0 and 1 if placed blindly.
    const groups = [
      [node('solo-1', 0, 0)],
      [node('solo-2', 0, 0)],
      [node('pair-a', 0, 0), node('pair-b', 0, 0)],
    ]

    const slots = assignSlots(groups, 3)

    expect(slots.get('pair-a')?.row).toBe(slots.get('pair-b')?.row)
  })

  it('splits a group too large for one row, since it cannot stay contiguous', () => {
    const wide = [node('a', 0, 0), node('b', 0, 0), node('c', 0, 0), node('d', 0, 0)]

    const slots = assignSlots([wide], 2)

    expect(slots.get('a')).toEqual({ row: 0, column: 0 })
    expect(slots.get('d')).toEqual({ row: 1, column: 1 })
  })

  it('assigns one slot per block', () => {
    const groups = [[node('a', 0, 0), node('b', 0, 0)], [node('c', 0, 0)]]

    expect(assignSlots(groups, 2).size).toBe(3)
  })
})

describe('slotPosition', () => {
  it('spaces cells by the block size plus the gap', () => {
    const anchor = { x: 100, y: 200 }
    const cell = { width: 520, height: 360 }

    expect(slotPosition({ row: 0, column: 0 }, anchor, cell)).toEqual({ x: 100, y: 200 })
    expect(slotPosition({ row: 1, column: 1 }, anchor, cell)).toEqual({
      x: 100 + 520 + MATRIX_GAP,
      y: 200 + 360 + MATRIX_GAP,
    })
  })
})

describe('matrixBounds', () => {
  it('covers every cell plus the gaps between them', () => {
    const bounds = matrixBounds({ x: 100, y: 100 }, { width: 520, height: 360 }, 2, 2)

    expect(bounds).toEqual({
      x: 100,
      y: 100,
      width: 2 * 520 + MATRIX_GAP,
      height: 2 * 360 + MATRIX_GAP,
    })
  })

  it('has no trailing gap on a single column or row', () => {
    const bounds = matrixBounds({ x: 0, y: 0 }, { width: 520, height: 360 }, 1, 1)

    expect(bounds.width).toBe(520)
    expect(bounds.height).toBe(360)
  })
})
