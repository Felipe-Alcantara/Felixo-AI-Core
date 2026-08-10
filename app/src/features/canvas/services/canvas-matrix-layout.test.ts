import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import { arrangeNodesAsMatrix, countArrangeableNodes } from './canvas-matrix-layout'

function terminal(
  id: string,
  position: { x: number; y: number },
  parentId?: string,
): Node {
  return {
    id,
    type: 'terminal',
    position,
    width: 520,
    height: 360,
    data: {},
    ...(parentId ? { parentId } : {}),
  }
}

function note(id: string, position: { x: number; y: number }): Node {
  return { id, type: 'note', position, width: 220, height: 160, data: {} }
}

function edge(source: string, target: string): Edge {
  return { id: `${source}->${target}`, source, target }
}

const positionOf = (nodes: Node[], id: string) =>
  nodes.find((node) => node.id === id)?.position

describe('arrangeNodesAsMatrix', () => {
  it('anchors the matrix on the top-left block, ignoring pan and zoom', () => {
    const nodes = [
      terminal('a', { x: 900, y: 700 }),
      terminal('b', { x: 300, y: 200 }),
      terminal('c', { x: 1500, y: 1200 }),
    ]

    const { nodes: arranged } = arrangeNodesAsMatrix(nodes)

    // 'b' is the top-left block, so the matrix starts exactly on it.
    expect(positionOf(arranged, 'b')).toEqual({ x: 300, y: 200 })
  })

  it('is deterministic: arranging twice changes nothing the second time', () => {
    const nodes = [
      terminal('a', { x: 900, y: 700 }),
      terminal('b', { x: 300, y: 200 }),
      terminal('c', { x: 1500, y: 1200 }),
      terminal('d', { x: 200, y: 900 }),
    ]

    const first = arrangeNodesAsMatrix(nodes).nodes
    const second = arrangeNodesAsMatrix(first).nodes

    // The old viewport-derived anchor made repeated clicks drift; this is the
    // regression that guards against it.
    expect(second.map((node) => node.position)).toEqual(
      first.map((node) => node.position),
    )
  })

  it('keeps connected blocks in adjacent cells', () => {
    const nodes = [
      terminal('lonely-a', { x: 100, y: 100 }),
      terminal('linked-a', { x: 2000, y: 2000 }),
      terminal('lonely-b', { x: 700, y: 100 }),
      terminal('linked-b', { x: 3000, y: 100 }),
    ]
    const edges = [edge('linked-a', 'linked-b')]

    const { nodes: arranged } = arrangeNodesAsMatrix(nodes, edges)
    const a = positionOf(arranged, 'linked-a')
    const b = positionOf(arranged, 'linked-b')

    // Same row, one cell apart — 520 wide + 32 gap.
    expect(a?.y).toBe(b?.y)
    expect(Math.abs((a?.x ?? 0) - (b?.x ?? 0))).toBe(552)
  })

  it('does not split a connected component across two rows', () => {
    // 5 blocks -> 3 columns. The pair would straddle rows if placed blindly.
    const nodes = [
      terminal('solo-1', { x: 100, y: 100 }),
      terminal('solo-2', { x: 700, y: 100 }),
      terminal('pair-a', { x: 100, y: 600 }),
      terminal('pair-b', { x: 700, y: 600 }),
      terminal('solo-3', { x: 1300, y: 600 }),
    ]
    const edges = [edge('pair-a', 'pair-b')]

    const { nodes: arranged } = arrangeNodesAsMatrix(nodes, edges)

    expect(positionOf(arranged, 'pair-a')?.y).toBe(positionOf(arranged, 'pair-b')?.y)
  })

  it('sizes every cell by the largest block so nothing overlaps', () => {
    const nodes = [
      note('small', { x: 100, y: 100 }),
      terminal('big', { x: 800, y: 100 }),
    ]

    const { nodes: arranged } = arrangeNodesAsMatrix(nodes)
    const first = positionOf(arranged, 'small')
    const second = positionOf(arranged, 'big')

    // Cell width comes from the terminal (520), not the note (220).
    expect(Math.abs((first?.x ?? 0) - (second?.x ?? 0))).toBe(552)
  })

  it('moves blocks of every type, not just agent terminals', () => {
    const nodes = [
      note('note', { x: 2000, y: 2000 }),
      terminal('term', { x: 100, y: 100 }),
    ]

    const { nodes: arranged } = arrangeNodesAsMatrix(nodes)

    expect(positionOf(arranged, 'note')).not.toEqual({ x: 2000, y: 2000 })
  })

  it('moves a group as one block and leaves its children untouched', () => {
    const group: Node = {
      id: 'group',
      type: 'group',
      position: { x: 3000, y: 3000 },
      width: 480,
      height: 320,
      data: {},
    }
    const child = terminal('child', { x: 20, y: 20 }, 'group')
    const nodes = [terminal('outside', { x: 100, y: 100 }), group, child]

    const { nodes: arranged } = arrangeNodesAsMatrix(nodes)

    expect(positionOf(arranged, 'group')).not.toEqual({ x: 3000, y: 3000 })
    // Child coordinates are relative to the group, so they must not change.
    expect(positionOf(arranged, 'child')).toEqual({ x: 20, y: 20 })
  })

  it('ignores edges pointing at blocks that are not being arranged', () => {
    const nodes = [terminal('a', { x: 100, y: 100 }), terminal('b', { x: 700, y: 100 })]
    const edges = [edge('a', 'ghost'), edge('missing', 'b')]

    expect(() => arrangeNodesAsMatrix(nodes, edges)).not.toThrow()
  })

  it('reports the bounds the matrix occupies so the view can frame it', () => {
    const nodes = [
      terminal('a', { x: 100, y: 100 }),
      terminal('b', { x: 700, y: 100 }),
      terminal('c', { x: 100, y: 600 }),
      terminal('d', { x: 700, y: 600 }),
    ]

    const { bounds } = arrangeNodesAsMatrix(nodes)

    expect(bounds).toEqual({
      x: 100,
      y: 100,
      width: 2 * 520 + 32,
      height: 2 * 360 + 32,
    })
  })

  it('does nothing until two top-level blocks exist', () => {
    const single = terminal('only', { x: 800, y: 800 })
    const child = terminal('child', { x: 20, y: 20 }, 'group')
    const nodes = [single, child]

    expect(countArrangeableNodes(nodes)).toBe(1)
    expect(arrangeNodesAsMatrix(nodes).nodes).toBe(nodes)
    expect(arrangeNodesAsMatrix(nodes).bounds).toBeNull()
  })
})
