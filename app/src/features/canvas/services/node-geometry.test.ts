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

  it('places every node in the batch without overlapping each other', () => {
    const positions = findFreeNodePositions([], 4, SIZE)
    expect(positions).toHaveLength(4)

    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        const a = positions[i]
        const b = positions[j]
        const overlaps =
          a.x < b.x + SIZE.width &&
          a.x + SIZE.width > b.x &&
          a.y < b.y + SIZE.height &&
          a.y + SIZE.height > b.y
        expect(overlaps).toBe(false)
      }
    }
  })

  it('also avoids nodes that already existed on the canvas', () => {
    const existing: Node[] = [
      { id: 'a', type: 'terminal', position: { x: 120, y: 120 }, width: 100, height: 100, data: {} },
    ]
    const [position] = findFreeNodePositions(existing, 1, SIZE)
    const overlapsExisting =
      position.x < existing[0].position.x + 100 &&
      position.x + SIZE.width > existing[0].position.x &&
      position.y < existing[0].position.y + 100 &&
      position.y + SIZE.height > existing[0].position.y
    expect(overlapsExisting).toBe(false)
  })
})
