import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import { createCanvasConnectionIndex } from './canvas-connection-index'

function file(id: string, fileName?: string): Node {
  return {
    id,
    type: 'file',
    position: { x: 0, y: 0 },
    data: fileName === undefined ? {} : { fileName },
  }
}

function terminal(id: string, label = id): Node {
  return {
    id,
    type: 'terminal',
    position: { x: 0, y: 0 },
    data: { label },
  }
}

function note(id: string): Node {
  return { id, type: 'note', position: { x: 0, y: 0 }, data: {} }
}

function edge(id: string, source: string, target: string): Edge {
  return { id, source, target }
}

describe('createCanvasConnectionIndex', () => {
  it('indexa links nas duas direções e deduplica nomes repetidos', () => {
    const nodes = [
      file('file-a', 'notas/compartilhada.md'),
      file('file-b', 'notas/compartilhada.md'),
      terminal('terminal-1', 'Agente 1'),
      terminal('terminal-2', 'Agente 2'),
      note('note-1'),
    ]
    const edges = [
      edge('a-1', 'file-a', 'terminal-1'),
      edge('a-1-reversed', 'terminal-1', 'file-a'),
      edge('b-1', 'terminal-1', 'file-b'),
      edge('b-2', 'file-b', 'terminal-2'),
      edge('other', 'file-a', 'note-1'),
    ]

    const index = createCanvasConnectionIndex(nodes, edges)

    expect([...index.getLinkedAgentIds('file-a')]).toEqual(['terminal-1'])
    expect([...index.getLinkedAgentIds('file-b')]).toEqual([
      'terminal-1',
      'terminal-2',
    ])
    expect(index.getConnectedCanvasFileNames('terminal-1')).toEqual([
      'notas/compartilhada.md',
    ])
    expect(index.getConnectedCanvasFileNames('terminal-2')).toEqual([
      'notas/compartilhada.md',
    ])
  })

  it('ignora arestas inválidas, nós removidos e arquivos sem nome', () => {
    const nodes = [file('file-a'), terminal('terminal-1'), note('note-1')]
    const edges = [
      edge('valid-without-name', 'file-a', 'terminal-1'),
      edge('missing-source', 'deleted', 'terminal-1'),
      edge('missing-target', 'file-a', 'deleted'),
      edge('wrong-type', 'file-a', 'note-1'),
    ]

    const index = createCanvasConnectionIndex(nodes, edges)

    expect([...index.getLinkedAgentIds('file-a')]).toEqual(['terminal-1'])
    expect(index.getConnectedCanvasFileNames('terminal-1')).toEqual([])
    expect(index.getLinkedAgentIds('deleted')).toEqual(new Set())
    expect(index.getConnectedCanvasFileNames('deleted')).toEqual([])
    expect(index.terminalNodes.map((node) => node.id)).toEqual(['terminal-1'])
  })

  it('mantém a ordem dos terminais e atualiza ao reconstruir após remoção', () => {
    const firstNodes = [terminal('terminal-1'), file('file-a', 'a.md'), terminal('terminal-2')]
    const first = createCanvasConnectionIndex(firstNodes, [edge('a-1', 'file-a', 'terminal-1')])

    expect(first.terminalNodes.map((node) => node.id)).toEqual([
      'terminal-1',
      'terminal-2',
    ])

    const secondNodes = [terminal('terminal-2'), file('file-a', 'a.md')]
    const second = createCanvasConnectionIndex(secondNodes, [edge('a-1', 'file-a', 'terminal-2')])

    expect(second.terminalNodes.map((node) => node.id)).toEqual(['terminal-2'])
    expect([...second.getLinkedAgentIds('file-a')]).toEqual(['terminal-2'])
    expect(first.terminalNodes.map((node) => node.id)).toEqual([
      'terminal-1',
      'terminal-2',
    ])
  })
})
