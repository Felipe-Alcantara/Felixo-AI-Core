import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import {
  groupByRepository,
  repositoryKey,
  repositoryLabel,
} from './repository-grouping'

function node(id: string, cwd?: string): Node {
  return {
    id,
    type: 'terminal',
    position: { x: 0, y: 0 },
    data: cwd === undefined ? {} : { cwd },
  }
}

describe('repositoryKey', () => {
  it('normaliza barra final e separador do Windows', () => {
    // Sem isso o mesmo repositório apareceria duas vezes na tela, com uma
    // diferença invisível de um caractere.
    expect(repositoryKey(node('a', '/projetos/app/'))).toBe('/projetos/app')
    expect(repositoryKey(node('b', 'C:\\projetos\\app'))).toBe('C:/projetos/app')
  })

  it('devolve vazio para bloco sem diretório', () => {
    expect(repositoryKey(node('nota'))).toBe('')
    expect(repositoryKey(node('vazio', '   '))).toBe('')
  })
})

describe('repositoryLabel', () => {
  it('usa a última pasta do caminho', () => {
    expect(repositoryLabel('/home/pessoa/projetos/felixo-ai-core')).toBe(
      'felixo-ai-core',
    )
    expect(repositoryLabel('C:\\projetos\\app\\')).toBe('app')
  })

  it('não inventa rótulo para bloco sem diretório', () => {
    expect(repositoryLabel(undefined)).toBe('')
    expect(repositoryLabel('')).toBe('')
  })

  it('sobrevive a um caminho de raiz, que não tem última pasta', () => {
    expect(repositoryLabel('/')).toBe('')
  })
})

describe('groupByRepository', () => {
  it('preserva a ordem de entrada entre as faixas e dentro delas', () => {
    const nodes = [
      node('a1', '/projetos/alpha'),
      node('b1', '/projetos/beta'),
      node('a2', '/projetos/alpha'),
    ]

    expect(
      groupByRepository(nodes).map((band) => [
        band.label,
        band.nodes.map((entry) => entry.id),
      ]),
    ).toEqual([
      ['alpha', ['a1', 'a2']],
      ['beta', ['b1']],
    ])
  })

  it('põe os blocos sem repositório na última faixa', () => {
    const nodes = [node('nota'), node('a1', '/projetos/alpha')]

    expect(groupByRepository(nodes).map((band) => band.nodes.map((n) => n.id))).toEqual([
      ['a1'],
      ['nota'],
    ])
  })

  it('devolve uma faixa só quando todos compartilham o repositório', () => {
    const nodes = [node('a', '/projetos/alpha'), node('b', '/projetos/alpha')]

    expect(groupByRepository(nodes)).toHaveLength(1)
  })
})
