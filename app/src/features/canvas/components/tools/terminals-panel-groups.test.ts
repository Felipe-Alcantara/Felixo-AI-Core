import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import {
  canReorderDockRows,
  dockGroupRange,
  groupDockElements,
} from './terminals-panel-groups'

function node(id: string, cwd?: string): Node {
  return {
    id,
    type: 'terminal',
    position: { x: 0, y: 0 },
    data: cwd === undefined ? {} : { cwd },
  }
}

describe('groupDockElements', () => {
  it('não cria cabeçalho implícito e preserva índices quando há uma pasta só', () => {
    const groups = groupDockElements([
      node('a1', '/projetos/alpha'),
      node('a2', '/projetos/alpha'),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].nodes.map(({ node: entry, index }) => [entry.id, index])).toEqual([
      ['a1', 0],
      ['a2', 1],
    ])
  })

  it('segue as mesmas faixas do canvas, sem deixar a pasta sem nome no meio', () => {
    const groups = groupDockElements([
      node('a1', '/projetos/alpha'),
      node('sem-pasta'),
      node('b1', '/projetos/beta'),
      node('a2', '/projetos/alpha'),
    ])

    expect(groups.map((group) => [group.label, group.nodes.map(({ node: entry }) => entry.id)])).toEqual([
      ['alpha', ['a1', 'a2']],
      ['beta', ['b1']],
      ['', ['sem-pasta']],
    ])
  })

  it('mantém o índice plano mesmo quando a renderização agrupa membros intercalados', () => {
    const groups = groupDockElements([
      node('a1', '/projetos/alpha'),
      node('b1', '/projetos/beta'),
      node('a2', '/projetos/alpha'),
    ])

    expect(groups[0].nodes.map(({ index }) => index)).toEqual([0, 2])
    expect(groups[1].nodes.map(({ index }) => index)).toEqual([1])
  })
})

describe('limites de reordenação do dock', () => {
  const rows = [
    { groupKey: 'alpha' },
    { groupKey: 'alpha' },
    { groupKey: 'beta' },
    { groupKey: '' },
  ]

  it('permite reordenar dentro da pasta e rejeita o cabeçalho da pasta seguinte', () => {
    expect(canReorderDockRows(rows, 0, 1)).toBe(true)
    expect(canReorderDockRows(rows, 1, 2)).toBe(false)
  })

  it('fornece a faixa visual usada para prender o preview ao grupo de origem', () => {
    expect(dockGroupRange(rows, 1)).toEqual({ start: 0, end: 1 })
    expect(dockGroupRange(rows, 2)).toEqual({ start: 2, end: 2 })
    expect(dockGroupRange(rows, 99)).toBeNull()
  })
})
