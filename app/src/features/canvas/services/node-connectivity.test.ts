import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import { connectedComponents, inReadingOrder } from './node-connectivity'

function node(id: string, x: number, y: number): Node {
  return { id, type: 'terminal', position: { x, y }, width: 520, height: 360, data: {} }
}

function edge(source: string, target: string): Edge {
  return { id: `${source}->${target}`, source, target }
}

const idsOf = (nodes: Node[]) => nodes.map((entry) => entry.id)

describe('inReadingOrder', () => {
  it('orders top to bottom, then left to right', () => {
    const nodes = [node('c', 100, 900), node('b', 700, 100), node('a', 100, 100)]

    expect(idsOf(inReadingOrder(nodes))).toEqual(['a', 'b', 'c'])
  })

  it('treats blocks within the row tolerance as the same row', () => {
    // 40px apart vertically: visually side by side, so x decides the order.
    const nodes = [node('right', 700, 140), node('left', 100, 100)]

    expect(idsOf(inReadingOrder(nodes))).toEqual(['left', 'right'])
  })

  it('breaks ties by id so exactly stacked blocks never swap', () => {
    const nodes = [node('b', 100, 100), node('a', 100, 100)]

    expect(idsOf(inReadingOrder(nodes))).toEqual(['a', 'b'])
    expect(idsOf(inReadingOrder([...nodes].reverse()))).toEqual(['a', 'b'])
  })

  it('does not mutate the input', () => {
    const nodes = [node('b', 700, 100), node('a', 100, 100)]
    inReadingOrder(nodes)

    expect(idsOf(nodes)).toEqual(['b', 'a'])
  })
})

describe('connectedComponents', () => {
  it('groups blocks joined by an edge', () => {
    const nodes = [node('a', 100, 100), node('b', 700, 100), node('loose', 1300, 100)]

    const components = connectedComponents(nodes, [edge('a', 'b')])

    expect(components.map(idsOf)).toEqual([['a', 'b'], ['loose']])
  })

  it('groups blocks joined indirectly through a chain', () => {
    const nodes = [node('a', 100, 100), node('b', 700, 100), node('c', 1300, 100)]

    const components = connectedComponents(nodes, [edge('a', 'b'), edge('b', 'c')])

    expect(components).toHaveLength(1)
    expect(idsOf(components[0])).toEqual(['a', 'b', 'c'])
  })

  it('puts larger components first so links stay grouped', () => {
    const nodes = [
      node('solo', 100, 100),
      node('a', 700, 100),
      node('b', 1300, 100),
      node('c', 1900, 100),
    ]

    const components = connectedComponents(nodes, [edge('a', 'b'), edge('b', 'c')])

    expect(components[0]).toHaveLength(3)
    expect(idsOf(components[1])).toEqual(['solo'])
  })

  it('ignores edges pointing at blocks outside the list', () => {
    const nodes = [node('a', 100, 100), node('b', 700, 100)]

    const components = connectedComponents(nodes, [
      edge('a', 'child-of-group'),
      edge('deleted', 'b'),
    ])

    // Neither edge may merge anything: both endpoints must be arrangeable.
    expect(components.map(idsOf)).toEqual([['a'], ['b']])
  })

  it('is deterministic for equally sized components', () => {
    const nodes = [node('x', 100, 100), node('y', 700, 100)]

    const first = connectedComponents(nodes, []).map(idsOf)
    const second = connectedComponents([...nodes].reverse(), []).map(idsOf)

    expect(second).toEqual(first)
  })

  it('returns every block exactly once', () => {
    const nodes = [
      node('a', 100, 100),
      node('b', 700, 100),
      node('c', 1300, 100),
      node('d', 100, 600),
    ]

    const components = connectedComponents(nodes, [edge('a', 'c')])

    expect(components.flat()).toHaveLength(4)
    expect(new Set(idsOf(components.flat())).size).toBe(4)
  })
})
