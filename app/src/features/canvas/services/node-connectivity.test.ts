import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import { connectedComponents } from './node-connectivity'

function node(id: string, x: number, y: number): Node {
  return { id, type: 'terminal', position: { x, y }, width: 520, height: 360, data: {} }
}

function edge(source: string, target: string): Edge {
  return { id: `${source}->${target}`, source, target }
}

const idsOf = (nodes: Node[]) => nodes.map((entry) => entry.id)

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

  it('mantém os componentes na ordem de entrada, não do maior para o menor', () => {
    const nodes = [
      node('solo', 100, 100),
      node('a', 700, 100),
      node('b', 1300, 100),
      node('c', 1900, 100),
    ]

    const components = connectedComponents(nodes, [edge('a', 'b'), edge('b', 'c')])

    // Ordenar por tamanho fazia ligar/desligar uma aresta reorganizar a matriz
    // inteira em cascata: o componente de 3 pulava para a frente do 'solo'.
    expect(components.map(idsOf)).toEqual([['solo'], ['a', 'b', 'c']])
  })

  it('ignora a posição no canvas: só a ordem de entrada decide', () => {
    // 'b' está acima e à esquerda de 'a', mas entra depois no dock.
    const nodes = [node('a', 900, 900), node('b', 100, 100)]

    expect(connectedComponents(nodes, []).map(idsOf)).toEqual([['a'], ['b']])
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

  it('é determinístico para a mesma entrada', () => {
    const nodes = [node('x', 100, 100), node('y', 700, 100)]

    const first = connectedComponents(nodes, []).map(idsOf)
    const second = connectedComponents(nodes, []).map(idsOf)

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
