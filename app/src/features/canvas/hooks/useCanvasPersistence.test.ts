import { describe, expect, it } from 'vitest'
import {
  sortByOrderIndex,
  toFlowNode,
  toPersistedNode,
  withOrderIndex,
} from './useCanvasPersistence'
import type { CanvasNodeData, CanvasNodeType, PersistedCanvasNode } from '../types'

function node(
  id: string,
  data: CanvasNodeData = {},
  type: CanvasNodeType = 'terminal',
): PersistedCanvasNode {
  return { id, type, position: { x: 0, y: 0 }, data }
}

describe('sortByOrderIndex', () => {
  it('restores the user dock order regardless of how the backend listed the nodes', () => {
    // The repository lists by `updated_at`, so a node saved last comes back
    // last no matter where the user put it — this is what the stored index is
    // for.
    const loaded = [
      node('c', { orderIndex: 2 }),
      node('a', { orderIndex: 0 }),
      node('b', { orderIndex: 1 }),
    ]
    expect(sortByOrderIndex(loaded).map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('keeps nodes without a stored index after the ordered ones, in load order', () => {
    const loaded = [node('new'), node('older'), node('placed', { orderIndex: 0 })]
    expect(sortByOrderIndex(loaded).map((item) => item.id)).toEqual([
      'placed',
      'new',
      'older',
    ])
  })

  it('keeps load order for a canvas that has never been reordered', () => {
    const loaded = [node('a'), node('b'), node('c')]
    expect(sortByOrderIndex(loaded).map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('falls back to load order for duplicate indices instead of ordering arbitrarily', () => {
    const loaded = [
      node('second', { orderIndex: 1 }),
      node('tie-a', { orderIndex: 0 }),
      node('tie-b', { orderIndex: 0 }),
    ]
    expect(sortByOrderIndex(loaded).map((item) => item.id)).toEqual([
      'tie-a',
      'tie-b',
      'second',
    ])
  })

  it('does not mutate the loaded array', () => {
    const loaded = [node('b', { orderIndex: 1 }), node('a', { orderIndex: 0 })]
    sortByOrderIndex(loaded)
    expect(loaded.map((item) => item.id)).toEqual(['b', 'a'])
  })
})

describe('withOrderIndex', () => {
  it('carimba o índice em quem não tem, congelando a ordem carregada', () => {
    // Um canvas que nunca foi reordenado volta na ordem de `updated_at`:
    // arrastar um bloco o jogaria para o fim do dock no próximo início. O
    // carimbo transforma a ordem atual em identidade.
    const stamped = withOrderIndex([node('a'), node('b'), node('c')])

    expect(stamped.map((item) => item.data.orderIndex)).toEqual([0, 1, 2])
  })

  it('corrige índice desalinhado da posição real', () => {
    const stamped = withOrderIndex([node('a', { orderIndex: 7 }), node('b')])

    expect(stamped.map((item) => item.data.orderIndex)).toEqual([0, 1])
  })

  it('devolve o mesmo objeto para quem já está certo, para não gravar à toa', () => {
    const correct = node('a', { orderIndex: 0 })
    const wrong = node('b')

    const stamped = withOrderIndex([correct, wrong])

    expect(stamped[0]).toBe(correct)
    expect(stamped[1]).not.toBe(wrong)
  })
})

describe('canvas persistence boundaries', () => {
  it('does not persist the one-shot handoff transcript', () => {
    const persisted = toPersistedNode({
      id: 'handoff',
      type: 'terminal',
      position: { x: 0, y: 0 },
      data: {
        command: 'codex',
        initialText: 'standing instruction',
        handoffText: 'terminal output that may contain a secret',
      },
    })

    expect(persisted.data.initialText).toBe('standing instruction')
    expect(persisted.data.handoffText).toBeUndefined()
  })

  // Fatia 3 da task Canvas Excalidraw: os dois nodes de desenho usam formatos
  // deliberadamente separados — o leve guarda um JSON de traços simples, o
  // Excalidraw guarda a cena nativa dele — mas o caminho de ida e volta pelo
  // storage é o mesmo bridge genérico dos outros node types, então o que
  // importa testar é que nenhum dos dois campos se perde no round-trip.
  it('round-trips o desenho leve (drawing) entre sessões', () => {
    const strokes = JSON.stringify([{ d: 'M 0 0 L 10 10', color: '#f4f4f5', width: 2 }])
    const flowNode = toFlowNode(node('d1', { strokes, label: 'Rabisco' }, 'drawing'))

    expect(flowNode.data.strokes).toBe(strokes)

    const persisted = toPersistedNode({ ...flowNode, data: { ...flowNode.data, strokes } })
    expect(persisted.type).toBe('drawing')
    expect(persisted.data.strokes).toBe(strokes)
  })

  it('round-trips a cena do Excalidraw (excalidrawDrawing) entre sessões', () => {
    const scene = JSON.stringify({
      elements: [{ id: 'el1', type: 'rectangle' }],
      appState: { viewBackgroundColor: '#ffffff' },
    })
    const flowNode = toFlowNode(node('e1', { scene, label: 'Diagrama' }, 'excalidrawDrawing'))

    expect(flowNode.data.scene).toBe(scene)

    const persisted = toPersistedNode(flowNode)
    expect(persisted.type).toBe('excalidrawDrawing')
    expect(persisted.data.scene).toBe(scene)
  })

  it('nunca persiste o onDataChange injetado nos nodes de desenho', () => {
    // `onDataChange` não é um campo formal de `CanvasNodeData` — é injetado em
    // runtime pelo CanvasView (ver `updateNodeData`), do mesmo jeito pros
    // outros node types. O cast espelha isso; o que o teste garante é que
    // `stripFunctions` some com ele antes de gravar.
    const dataWithHandler = { strokes: '[]', onDataChange: () => {} } as unknown as CanvasNodeData
    const persisted = toPersistedNode({
      id: 'd2',
      type: 'drawing',
      position: { x: 0, y: 0 },
      data: dataWithHandler,
    })

    expect(persisted.data.strokes).toBe('[]')
    expect((persisted.data as Record<string, unknown>).onDataChange).toBeUndefined()
  })
})
