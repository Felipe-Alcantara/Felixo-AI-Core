import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import { summarizeCanvasSelection } from './canvas-selection'

function node(id: string, selected = false): Node {
  return { id, type: 'note', position: { x: 0, y: 0 }, data: {}, selected }
}

function edge(id: string, selected = false): Edge {
  return { id, source: 'a', target: 'b', selected }
}

describe('summarizeCanvasSelection', () => {
  it('sem nada selecionado não há rótulo nem ids', () => {
    expect(summarizeCanvasSelection([node('a'), node('b')], [edge('e')])).toEqual({
      nodeIds: [],
      edgeIds: [],
      label: null,
    })
  })

  it('uma conexão selecionada', () => {
    expect(summarizeCanvasSelection([node('a')], [edge('e1', true), edge('e2')])).toEqual({
      nodeIds: [],
      edgeIds: ['e1'],
      label: '1 conexão selecionada',
    })
  })

  it('várias conexões selecionadas', () => {
    expect(summarizeCanvasSelection([], [edge('e1', true), edge('e2', true)]).label).toBe(
      '2 conexões selecionadas',
    )
  })

  it('um bloco e vários blocos', () => {
    expect(summarizeCanvasSelection([node('a', true), node('b')], []).label).toBe(
      '1 bloco selecionado',
    )
    expect(
      summarizeCanvasSelection([node('a', true), node('b', true), node('c', true)], []).label,
    ).toBe('3 blocos selecionados')
  })

  it('blocos e conexões juntos viram itens, com os ids de cada lado', () => {
    expect(
      summarizeCanvasSelection([node('a', true), node('b', true)], [edge('e1', true)]),
    ).toEqual({
      nodeIds: ['a', 'b'],
      edgeIds: ['e1'],
      label: '3 itens selecionados',
    })
  })
})
