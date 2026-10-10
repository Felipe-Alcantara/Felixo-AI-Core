import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import { getLinkedFileNodeIds } from './file-terminal-links'

const node = (id: string, type: string): Node => ({ id, type, position: { x: 0, y: 0 }, data: {} })
const edge = (source: string, target: string): Edge => ({ id: `${source}-${target}`, source, target })

describe('getLinkedFileNodeIds', () => {
  const nodes = [node('t1', 'terminal'), node('f1', 'file'), node('f2', 'file'), node('n1', 'note'), node('t2', 'terminal')]

  it('acha os arquivos ligados ao terminal nas duas direções da linha, na ordem dos blocos', () => {
    const edges = [edge('t1', 'f2'), edge('f1', 't1')]

    expect(getLinkedFileNodeIds('t1', nodes, edges)).toEqual(['f1', 'f2'])
  })

  it('ignora o que não é arquivo e as linhas de outros terminais', () => {
    const edges = [edge('t1', 'n1'), edge('t1', 't2'), edge('f1', 't2')]

    expect(getLinkedFileNodeIds('t1', nodes, edges)).toEqual([])
  })

  it('duas linhas para o mesmo arquivo contam uma vez', () => {
    const edges = [edge('t1', 'f1'), edge('f1', 't1')]

    expect(getLinkedFileNodeIds('t1', nodes, edges)).toEqual(['f1'])
  })
})
