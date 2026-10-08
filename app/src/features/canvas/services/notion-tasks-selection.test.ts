import { describe, expect, it } from 'vitest'
import { keepIfListed, readNotionTasksSelection, selectionPatch } from './notion-tasks-selection'

const connections = [{ id: 'conexao-a' }, { id: 'conexao-b' }]

describe('keepIfListed', () => {
  it('mantém a escolha salva quando ela ainda está na lista', () => {
    expect(keepIfListed('conexao-b', connections)).toBe('conexao-b')
  })

  it('escolha que sumiu (conexão removida, database descompartilhada) volta para a primeira', () => {
    expect(keepIfListed('conexao-apagada', connections)).toBe('conexao-a')
  })

  it('sem escolha usa a primeira, e lista vazia dá vazio', () => {
    expect(keepIfListed('', connections)).toBe('conexao-a')
    expect(keepIfListed('conexao-a', [])).toBe('')
  })
})

describe('readNotionTasksSelection', () => {
  it('lê a conexão e a database gravadas no bloco', () => {
    expect(readNotionTasksSelection({ label: 'Tarefas Notion', notionConnectionId: 'c', notionDataSourceId: 'd' }))
      .toEqual({ connectionId: 'c', dataSourceId: 'd' })
  })

  it('bloco antigo, sem escolha gravada, ou campo de tipo errado vira vazio', () => {
    expect(readNotionTasksSelection({ label: 'Tarefas Notion' })).toEqual({ connectionId: '', dataSourceId: '' })
    expect(readNotionTasksSelection({ notionConnectionId: 42, notionDataSourceId: null })).toEqual({ connectionId: '', dataSourceId: '' })
    expect(readNotionTasksSelection(undefined)).toEqual({ connectionId: '', dataSourceId: '' })
  })
})

describe('selectionPatch', () => {
  it('grava quando a escolha mudou', () => {
    expect(selectionPatch({ connectionId: 'c', dataSourceId: 'velha' }, { connectionId: 'c', dataSourceId: 'nova' }))
      .toEqual({ notionConnectionId: 'c', notionDataSourceId: 'nova' })
  })

  it('não grava o que já está gravado', () => {
    expect(selectionPatch({ connectionId: 'c', dataSourceId: 'd' }, { connectionId: 'c', dataSourceId: 'd' })).toBeNull()
  })

  it('não grava escolha pela metade (conexão sem database ainda)', () => {
    expect(selectionPatch({ connectionId: '', dataSourceId: '' }, { connectionId: 'c', dataSourceId: '' })).toBeNull()
    expect(selectionPatch({ connectionId: '', dataSourceId: '' }, { connectionId: '', dataSourceId: 'd' })).toBeNull()
  })
})
