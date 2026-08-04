import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import { findFreeNodePosition, findFreeNodePositions } from './node-geometry'

const SIZE = { width: 100, height: 100 }

describe('findFreeNodePositions', () => {
  it('returns an empty list for count 0', () => {
    expect(findFreeNodePositions([], 0, SIZE)).toEqual([])
  })

  it('matches findFreeNodePosition for a single node', () => {
    const nodes: Node[] = [
      { id: 'a', type: 'terminal', position: { x: 0, y: 0 }, width: 100, height: 100, data: {} },
    ]
    expect(findFreeNodePositions(nodes, 1, SIZE)).toEqual([findFreeNodePosition(nodes, SIZE)])
  })

  it('places four terminals as a 2 by 2 matrix', () => {
    expect(findFreeNodePositions([], 4, SIZE)).toEqual([
      { x: 120, y: 120 },
      { x: 252, y: 120 },
      { x: 120, y: 252 },
      { x: 252, y: 252 },
    ])
  })

  it('grows the matrix by columns and rows instead of one long line', () => {
    expect(findFreeNodePositions([], 5, SIZE)).toEqual([
      { x: 120, y: 120 },
      { x: 252, y: 120 },
      { x: 384, y: 120 },
      { x: 120, y: 252 },
      { x: 252, y: 252 },
    ])
  })

  it('prioritizes a matrix that fits entirely in the visible canvas', () => {
    expect(
      findFreeNodePositions([], 4, SIZE, { x: 0, y: 0, width: 400, height: 400 }),
    ).toEqual([
      { x: 40, y: 88 },
      { x: 172, y: 88 },
      { x: 40, y: 220 },
      { x: 172, y: 220 },
    ])
  })

  it('moves the complete matrix past blocks that already exist on the canvas', () => {
    const existing: Node[] = [
      { id: 'a', type: 'terminal', position: { x: 120, y: 120 }, width: 100, height: 100, data: {} },
    ]

    expect(findFreeNodePositions(existing, 4, SIZE)).toEqual([
      { x: 252, y: 120 },
      { x: 384, y: 120 },
      { x: 252, y: 252 },
      { x: 384, y: 252 },
    ])
  })
})
