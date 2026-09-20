import { describe, expect, it } from 'vitest'
import type { NotionSchemaProperty } from '../../shared/types/notion'
import {
  ROW_PAGE_SIZE,
  UNSUPPORTED_LABEL,
  defaultVisibleColumns,
  formatPropertyValue,
  hasTaskRoles,
  isUnsupportedType,
  nextRowLimit,
} from './notion-table-view'

const schemaOf = (types: Record<string, string>): Record<string, NotionSchemaProperty> =>
  Object.fromEntries(Object.entries(types).map(([name, type]) => [name, { id: name, name, type }]))

describe('formatPropertyValue por tipo', () => {
  it('tipo sem valor legível é "não suportado", nunca vazio', () => {
    for (const type of ['button', 'verification', 'place', 'um_tipo_novo_do_notion']) {
      expect(isUnsupportedType(type), type).toBe(true)
      expect(formatPropertyValue(null, type)).toBe(`${UNSUPPORTED_LABEL} (${type})`)
      expect(formatPropertyValue({ qualquer: 'coisa' }, type)).toBe(`${UNSUPPORTED_LABEL} (${type})`)
    }
  })
  it('os tipos que o backend lê nunca são "não suportado"', () => {
    for (const type of ['title', 'people', 'files', 'relation', 'rollup', 'unique_id', 'created_by', 'formula', 'phone_number']) {
      expect(isUnsupportedType(type), type).toBe(false)
    }
  })
  it('relação vira contagem no singular e no plural; vazia fica vazia', () => {
    expect(formatPropertyValue(['a'], 'relation')).toBe('1 relação')
    expect(formatPropertyValue(['a', 'b', 'c'], 'relation')).toBe('3 relações')
    expect(formatPropertyValue([], 'relation')).toBe('')
  })
  it('listas, números, booleanos e textos seguem legíveis', () => {
    expect(formatPropertyValue(['Ana', 'Bia'], 'people')).toBe('Ana, Bia')
    expect(formatPropertyValue(12, 'rollup')).toBe('12')
    expect(formatPropertyValue(true, 'checkbox')).toBe('Sim')
    expect(formatPropertyValue(false, 'checkbox')).toBe('Não')
    expect(formatPropertyValue('TSK-42', 'unique_id')).toBe('TSK-42')
    expect(formatPropertyValue('', 'rich_text')).toBe('')
  })
  it('sem tipo cai no formato solto de antes (ordenação e chamadas antigas)', () => {
    expect(formatPropertyValue({ name: 'X' })).toBe('X')
    expect(formatPropertyValue(null)).toBe('')
    expect(formatPropertyValue([{ start: '2026-01-02' }, 3])).toBe('2026-01-02, 3')
  })
})

describe('database genérica × de tarefas', () => {
  it('sem status/select/data/checkbox a tabela é genérica e mostra todas as colunas', () => {
    const repos = schemaOf({ Nome: 'title', Descrição: 'rich_text', Estrelas: 'number', Link: 'url' })
    expect(hasTaskRoles(repos)).toBe(false)
    expect(defaultVisibleColumns(repos)).toEqual(['Descrição', 'Estrelas', 'Link'])
  })
  it('com papel de tarefa continua como antes: nenhuma coluna extra por padrão', () => {
    for (const papel of ['status', 'select', 'date', 'checkbox']) {
      const schema = schemaOf({ Nome: 'title', Coluna: papel, Texto: 'rich_text' })
      expect(hasTaskRoles(schema), papel).toBe(true)
      expect(defaultVisibleColumns(schema), papel).toEqual([])
    }
  })
  it('schema vazio não quebra', () => {
    expect(hasTaskRoles({})).toBe(false)
    expect(defaultVisibleColumns({})).toEqual([])
  })
})

describe('paginação local das linhas', () => {
  it('cada "mostrar mais" soma uma página e nunca passa do total', () => {
    expect(nextRowLimit(ROW_PAGE_SIZE, 2000)).toBe(ROW_PAGE_SIZE * 2)
    expect(nextRowLimit(1900, 2000)).toBe(2000)
    expect(nextRowLimit(2000, 2000)).toBe(2000)
    expect(nextRowLimit(0, 50)).toBe(50)
    expect(nextRowLimit(ROW_PAGE_SIZE, 250)).toBe(250)
  })
})
