import { describe, expect, it } from 'vitest'
import {
  sortByOrderIndex,
  toPersistedNode,
  withOrderIndex,
} from './useCanvasPersistence'
import type { CanvasNodeData, PersistedCanvasNode } from '../types'

function node(id: string, data: CanvasNodeData = {}): PersistedCanvasNode {
  return { id, type: 'terminal', position: { x: 0, y: 0 }, data }
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
})
