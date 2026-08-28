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

function agent(
  id: string,
  cwd: string,
  position = { x: 0, y: 0 },
): Node {
  return { id, type: 'terminal', position, width: 520, height: 360, data: { cwd } }
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
  it('anchors the matrix on the top-left corner, ignoring pan and zoom', () => {
    const nodes = [
      terminal('a', { x: 900, y: 700 }),
      terminal('b', { x: 300, y: 200 }),
      terminal('c', { x: 1500, y: 1200 }),
    ]

    const { nodes: arranged } = arrangeNodesAsMatrix(nodes)

    // O canto de partida é o do bloco mais ao topo-esquerda; quem ocupa a
    // primeira célula é o primeiro bloco do dock, não o que estava ali.
    expect(positionOf(arranged, 'a')).toEqual({ x: 300, y: 200 })
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

  it('não muda o arranjo depois de a pessoa arrastar os blocos', () => {
    // Esta é a dor original: a matriz era montada a partir da posição atual,
    // então arrastar um terminal trocava a célula dele no próximo Organizar e
    // a pessoa perdia a referência de qual bloco era qual.
    const nodes = [
      terminal('a', { x: 100, y: 100 }),
      terminal('b', { x: 700, y: 100 }),
      terminal('c', { x: 100, y: 600 }),
    ]
    const arranged = arrangeNodesAsMatrix(nodes).nodes

    const afterDragging = nodes.map((node) =>
      node.id === 'c' ? { ...node, position: { x: 100, y: 100 } } : node,
    )
    const rearranged = arrangeNodesAsMatrix(afterDragging).nodes

    expect(rearranged.map((node) => node.position)).toEqual(
      arranged.map((node) => node.position),
    )
  })

  it('acrescenta o bloco novo no fim sem mover os que já estavam', () => {
    const existing = [
      terminal('a', { x: 100, y: 100 }),
      terminal('b', { x: 700, y: 100 }),
    ]
    const before = arrangeNodesAsMatrix(existing).nodes

    // Bloco novo entra no fim do dock, como o canvas faz ao criá-lo.
    const after = arrangeNodesAsMatrix([
      ...existing,
      terminal('c', { x: 3000, y: 3000 }),
    ]).nodes

    expect(positionOf(after, 'a')).toEqual(positionOf(before, 'a'))
    expect(positionOf(after, 'b')).toEqual(positionOf(before, 'b'))
  })

  it('fechar o último bloco não move os que ficaram', () => {
    const nodes = [
      terminal('a', { x: 100, y: 100 }),
      terminal('b', { x: 700, y: 100 }),
      terminal('c', { x: 1300, y: 100 }),
    ]
    const before = arrangeNodesAsMatrix(nodes).nodes
    const after = arrangeNodesAsMatrix(nodes.slice(0, 2)).nodes

    expect(positionOf(after, 'a')).toEqual(positionOf(before, 'a'))
    expect(positionOf(after, 'b')).toEqual(positionOf(before, 'b'))
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

describe('arrangeNodesAsMatrix por repositório', () => {
  it('separa os blocos em faixas, uma por repositório', () => {
    const nodes = [
      agent('a1', '/projetos/alpha'),
      agent('b1', '/projetos/beta'),
      agent('a2', '/projetos/alpha'),
      agent('b2', '/projetos/beta'),
    ]

    const { nodes: arranged } = arrangeNodesAsMatrix(nodes, [], 'by-repository')
    const y = (id: string) => positionOf(arranged, id)?.y

    // Cada repositório tem a sua faixa: os dois do alpha na primeira linha, os
    // dois do beta abaixo — e nenhuma faixa invade a outra.
    expect(y('a1')).toBe(y('a2'))
    expect(y('b1')).toBe(y('b2'))
    expect(y('b1')).toBeGreaterThan(y('a1') ?? 0)
  })

  it('trata caminhos equivalentes como o mesmo repositório', () => {
    const nodes = [
      agent('a1', '/projetos/alpha'),
      agent('a2', '/projetos/alpha/'),
      agent('b1', '/projetos/beta'),
    ]

    const { nodes: arranged } = arrangeNodesAsMatrix(nodes, [], 'by-repository')

    expect(positionOf(arranged, 'a1')?.y).toBe(positionOf(arranged, 'a2')?.y)
    expect(positionOf(arranged, 'b1')?.y).toBeGreaterThan(
      positionOf(arranged, 'a1')?.y ?? 0,
    )
  })

  it('joga os blocos sem repositório para a última faixa', () => {
    const nodes = [
      note('anotação', { x: 0, y: 0 }),
      agent('a1', '/projetos/alpha'),
      agent('a2', '/projetos/alpha'),
    ]

    const { nodes: arranged } = arrangeNodesAsMatrix(nodes, [], 'by-repository')

    // A nota é a primeira do dock, mas nota não pertence a repositório nenhum:
    // deixá-la no meio partiria a faixa de quem pertence.
    expect(positionOf(arranged, 'anotação')?.y).toBeGreaterThan(
      positionOf(arranged, 'a1')?.y ?? 0,
    )
  })

  it('mantém a ordem do dock dentro de cada faixa', () => {
    const nodes = [
      agent('a1', '/projetos/alpha'),
      agent('b1', '/projetos/beta'),
      agent('a2', '/projetos/alpha'),
    ]

    const { nodes: arranged } = arrangeNodesAsMatrix(nodes, [], 'by-repository')

    expect(positionOf(arranged, 'a1')?.x).toBeLessThan(
      positionOf(arranged, 'a2')?.x ?? 0,
    )
  })

  it('enquadra todas as faixas, não só a primeira', () => {
    const nodes = [
      agent('a1', '/projetos/alpha'),
      agent('b1', '/projetos/beta'),
    ]

    const single = arrangeNodesAsMatrix(nodes).bounds
    const banded = arrangeNodesAsMatrix(nodes, [], 'by-repository').bounds

    expect(banded?.height).toBeGreaterThan(single?.height ?? 0)
  })

  it('sem repositório nenhum, o resultado é o da matriz única', () => {
    const nodes = [
      terminal('a', { x: 100, y: 100 }),
      terminal('b', { x: 700, y: 100 }),
    ]

    expect(arrangeNodesAsMatrix(nodes, [], 'by-repository').nodes).toEqual(
      arrangeNodesAsMatrix(nodes).nodes,
    )
  })
})

describe('arrangeNodesAsMatrix em linha por repositório', () => {
  it('põe cada pasta em uma linha e preserva a ordem do dock da esquerda para a direita', () => {
    const nodes = [
      agent('a1', '/projetos/alpha'),
      agent('b1', '/projetos/beta'),
      agent('a2', '/projetos/alpha'),
      agent('a3', '/projetos/alpha'),
      note('sem-pasta', { x: 0, y: 0 }),
    ]

    const { nodes: arranged } = arrangeNodesAsMatrix(nodes, [], 'by-repository-row')
    const position = (id: string) => positionOf(arranged, id)

    expect(position('a1')).toEqual({ x: 0, y: 0 })
    expect(position('a2')).toEqual({ x: 552, y: 0 })
    expect(position('a3')).toEqual({ x: 1104, y: 0 })
    expect(position('b1')?.x).toBe(0)
    expect(position('b1')?.y).toBeGreaterThan(position('a1')?.y ?? 0)
    expect(position('sem-pasta')?.x).toBe(0)
    expect(position('sem-pasta')?.y).toBeGreaterThan(position('b1')?.y ?? 0)
  })

  it('não quebra uma faixa larga em várias linhas e enquadra toda a largura', () => {
    const nodes = Array.from({ length: 5 }, (_, index) =>
      agent(`alpha-${index + 1}`, '/projetos/alpha'),
    )

    const { nodes: arranged, bounds } = arrangeNodesAsMatrix(
      nodes,
      [],
      'by-repository-row',
    )
    const positions = arranged.map((node) => node.position)

    expect(new Set(positions.map(({ y }) => y))).toEqual(new Set([0]))
    expect(positions.map(({ x }) => x)).toEqual([0, 552, 1104, 1656, 2208])
    expect(bounds?.width).toBe(5 * 520 + 4 * 32)
  })

  it('mantém a ordem dos componentes conectados sem sacrificar a linha única', () => {
    const nodes = [
      agent('a1', '/projetos/alpha'),
      agent('a2', '/projetos/alpha'),
      agent('a3', '/projetos/alpha'),
    ]

    const { nodes: arranged } = arrangeNodesAsMatrix(
      nodes,
      [edge('a1', 'a3')],
      'by-repository-row',
    )

    expect(arranged.map((node) => node.position)).toEqual([
      { x: 0, y: 0 },
      { x: 1104, y: 0 },
      { x: 552, y: 0 },
    ])
  })

  it('continua determinístico quando a mesma faixa é organizada duas vezes', () => {
    const nodes = [
      agent('a1', '/projetos/alpha', { x: 900, y: 700 }),
      agent('b1', '/projetos/beta', { x: 300, y: 200 }),
      agent('a2', '/projetos/alpha', { x: 1500, y: 1200 }),
    ]

    const first = arrangeNodesAsMatrix(nodes, [], 'by-repository-row').nodes
    const second = arrangeNodesAsMatrix(first, [], 'by-repository-row').nodes

    expect(second.map((node) => node.position)).toEqual(first.map((node) => node.position))
  })
})
