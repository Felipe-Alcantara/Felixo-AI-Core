import { describe, expect, it } from 'vitest'
import { readVisibleColumns, saveVisibleColumns } from './notion-table-columns'

function storage(initial?: Record<string, string>) {
  const values = new Map(Object.entries(initial ?? {}))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, next: string) => {
      values.set(key, next)
    },
  }
}

describe('notion-table-columns', () => {
  it('não mostra colunas extras por padrão', () => {
    expect(readVisibleColumns('conn-1', 'db-1', storage())).toEqual([])
  })

  it('persiste e recupera a escolha por conexão + database', () => {
    const target = storage()
    saveVisibleColumns('conn-1', 'db-1', ['Área', 'Projeto'], target)
    expect(readVisibleColumns('conn-1', 'db-1', target)).toEqual(['Área', 'Projeto'])
    expect(readVisibleColumns('conn-1', 'db-2', target)).toEqual([])
  })

  it('ignora dado guardado corrompido ou em formato inesperado', () => {
    expect(readVisibleColumns('conn-1', 'db-1', storage({ 'felixo:notion-table-columns:conn-1:db-1': '{not-json' }))).toEqual([])
    expect(readVisibleColumns('conn-1', 'db-1', storage({ 'felixo:notion-table-columns:conn-1:db-1': '[1,2]' }))).toEqual([])
  })
})
