import { describe, expect, it } from 'vitest'
import { nextSortState, readSortState, saveSortState, sortTasks } from './notion-task-sort'
import type { NotionTask } from '../../shared/types/notion'

function storage(initial?: Record<string, string>) {
  const values = new Map(Object.entries(initial ?? {}))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, next: string) => {
      values.set(key, next)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  }
}

function task(overrides: Partial<NotionTask>): NotionTask {
  return {
    id: overrides.id ?? 'id',
    title: '',
    completed: false,
    status: '',
    dueDate: '',
    priority: '',
    text: '',
    url: null,
    archived: false,
    createdAt: null,
    updatedAt: null,
    fields: {},
    ...overrides,
  }
}

const formatValue = (value: unknown) => (typeof value === 'string' ? value : '')

describe('notion-task-sort: persistência', () => {
  it('não tem ordenação por padrão', () => {
    expect(readSortState('conn-1', 'db-1', storage())).toBeNull()
  })

  it('persiste e recupera a escolha por conexão + database', () => {
    const target = storage()
    saveSortState('conn-1', 'db-1', { column: 'title', direction: 'asc' }, target)
    expect(readSortState('conn-1', 'db-1', target)).toEqual({ column: 'title', direction: 'asc' })
    expect(readSortState('conn-1', 'db-2', target)).toBeNull()
  })

  it('salvar null remove a ordenação persistida', () => {
    const target = storage()
    saveSortState('conn-1', 'db-1', { column: 'title', direction: 'asc' }, target)
    saveSortState('conn-1', 'db-1', null, target)
    expect(readSortState('conn-1', 'db-1', target)).toBeNull()
  })

  it('ignora dado guardado corrompido ou em formato inesperado', () => {
    expect(readSortState('conn-1', 'db-1', storage({ 'felixo:notion-task-sort:conn-1:db-1': '{not-json' }))).toBeNull()
    expect(readSortState('conn-1', 'db-1', storage({ 'felixo:notion-task-sort:conn-1:db-1': '{"column":"title","direction":"cima"}' }))).toBeNull()
  })
})

describe('nextSortState: ciclo de três estados por clique', () => {
  it('primeiro clique numa coluna ordena crescente', () => {
    expect(nextSortState(null, 'title')).toEqual({ column: 'title', direction: 'asc' })
  })

  it('segundo clique na mesma coluna inverte pra decrescente', () => {
    expect(nextSortState({ column: 'title', direction: 'asc' }, 'title')).toEqual({ column: 'title', direction: 'desc' })
  })

  it('terceiro clique na mesma coluna remove a ordenação', () => {
    expect(nextSortState({ column: 'title', direction: 'desc' }, 'title')).toBeNull()
  })

  it('clicar numa coluna diferente reinicia o ciclo em crescente', () => {
    expect(nextSortState({ column: 'title', direction: 'desc' }, 'priority')).toEqual({ column: 'priority', direction: 'asc' })
  })
})

describe('sortTasks', () => {
  const tasks = [
    task({ id: '1', title: 'Banana' }),
    task({ id: '2', title: 'abacaxi' }),
    task({ id: '3', title: 'Cereja' }),
  ]

  it('sem ordenação, devolve a lista na ordem original (mesma referência)', () => {
    expect(sortTasks(tasks, null, formatValue)).toBe(tasks)
  })

  it('ordena por título, sem diferenciar maiúsculas/minúsculas', () => {
    const sorted = sortTasks(tasks, { column: 'title', direction: 'asc' }, formatValue)
    expect(sorted.map((t) => t.title)).toEqual(['abacaxi', 'Banana', 'Cereja'])
  })

  it('inverte a ordem em decrescente', () => {
    const sorted = sortTasks(tasks, { column: 'title', direction: 'desc' }, formatValue)
    expect(sorted.map((t) => t.title)).toEqual(['Cereja', 'Banana', 'abacaxi'])
  })

  it('não muta a lista original', () => {
    const original = [...tasks]
    sortTasks(tasks, { column: 'title', direction: 'desc' }, formatValue)
    expect(tasks).toEqual(original)
  })

  it('ordena por status, considerando "Concluída" quando completed=true independente do texto de status', () => {
    const withStatus = [
      task({ id: '1', status: 'Em andamento' }),
      task({ id: '2', completed: true, status: 'Entrada' }),
      task({ id: '3', status: 'Aguardando' }),
    ]
    const sorted = sortTasks(withStatus, { column: 'status', direction: 'asc' }, formatValue)
    expect(sorted.map((t) => t.id)).toEqual(['3', '2', '1']) // Aguardando < Concluída < Em andamento
  })

  it('ordena por prazo (dueDate) como texto ISO, que ordena cronologicamente', () => {
    const withDue = [
      task({ id: '1', dueDate: '2026-09-20' }),
      task({ id: '2', dueDate: '2026-01-05' }),
      task({ id: '3', dueDate: '2026-06-10' }),
    ]
    const sorted = sortTasks(withDue, { column: 'dueDate', direction: 'asc' }, formatValue)
    expect(sorted.map((t) => t.id)).toEqual(['2', '3', '1'])
  })

  it('valores vazios sempre vão para o fim, tanto crescente quanto decrescente', () => {
    const mixed = [
      task({ id: '1', priority: 'Alta' }),
      task({ id: '2', priority: '' }),
      task({ id: '3', priority: 'Baixa' }),
    ]
    expect(sortTasks(mixed, { column: 'priority', direction: 'asc' }, formatValue).map((t) => t.id)).toEqual(['1', '3', '2'])
    expect(sortTasks(mixed, { column: 'priority', direction: 'desc' }, formatValue).map((t) => t.id)).toEqual(['3', '1', '2'])
  })

  it('ordena por coluna dinâmica de propriedade, via formatValue', () => {
    const withField = [
      task({ id: '1', fields: { Repositório: 'Zeta' } }),
      task({ id: '2', fields: { Repositório: 'Alfa' } }),
    ]
    const sorted = sortTasks(withField, { column: 'Repositório', direction: 'asc' }, formatValue)
    expect(sorted.map((t) => t.id)).toEqual(['2', '1'])
  })
})
