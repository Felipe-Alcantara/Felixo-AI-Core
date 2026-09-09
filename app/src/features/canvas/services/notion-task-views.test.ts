import { describe, expect, it } from 'vitest'
import type { NotionSchemaProperty, NotionTask } from '../../shared/types/notion'
import {
  BUILT_IN_VIEWS,
  filterTasksByView,
  isBuiltInView,
  listFilterableProperties,
  readCustomViews,
  saveCustomViews,
  taskMatchesView,
  type NotionTaskView,
} from './notion-task-views'

function storage(initial?: Record<string, string>) {
  const values = new Map(Object.entries(initial ?? {}))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, next: string) => {
      values.set(key, next)
    },
  }
}

function task(overrides: Partial<NotionTask> = {}): NotionTask {
  return {
    id: overrides.id || 't1',
    title: overrides.title || 'Tarefa',
    completed: overrides.completed ?? false,
    status: overrides.status ?? '',
    dueDate: overrides.dueDate ?? '',
    priority: overrides.priority ?? '',
    text: overrides.text ?? '',
    url: overrides.url ?? null,
    archived: overrides.archived ?? false,
    createdAt: overrides.createdAt ?? null,
    updatedAt: overrides.updatedAt ?? null,
    fields: overrides.fields ?? {},
  }
}

describe('notion-task-views', () => {
  it('exposes Todas/Abertas/Concluídas como views fixas', () => {
    expect(BUILT_IN_VIEWS.map((view) => view.id)).toEqual(['all', 'open', 'done'])
    expect(isBuiltInView('all')).toBe(true)
    expect(isBuiltInView('minha-view')).toBe(false)
  })

  it('filtra por estado de conclusão', () => {
    const done = task({ id: 'a', completed: true })
    const open = task({ id: 'b', completed: false })
    expect(taskMatchesView(done, BUILT_IN_VIEWS[1])).toBe(false) // Abertas
    expect(taskMatchesView(done, BUILT_IN_VIEWS[2])).toBe(true) // Concluídas
    expect(taskMatchesView(open, BUILT_IN_VIEWS[1])).toBe(true)
  })

  it('filtra por propriedade select, como "Repositório"', () => {
    const view: NotionTaskView = {
      id: 'repo-core',
      name: 'Felixo AI Core',
      statusFilter: 'all',
      propertyFilters: [{ property: 'Repositório', values: ['Felixo-AI-Core'] }],
    }
    const matching = task({ fields: { Repositório: { name: 'Felixo-AI-Core' } } })
    const other = task({ fields: { Repositório: { name: 'Outro-Repo' } } })
    const missing = task({ fields: {} })

    expect(taskMatchesView(matching, view)).toBe(true)
    expect(taskMatchesView(other, view)).toBe(false)
    expect(taskMatchesView(missing, view)).toBe(false)
  })

  it('filtra por propriedade multi_select considerando qualquer valor em comum', () => {
    const view: NotionTaskView = {
      id: 'v',
      name: 'v',
      statusFilter: 'all',
      propertyFilters: [{ property: 'Áreas', values: ['Projetos'] }],
    }
    const matching = task({ fields: { Áreas: [{ name: 'Projetos' }, { name: 'VS' }] } })
    const other = task({ fields: { Áreas: [{ name: 'VS' }] } })
    expect(taskMatchesView(matching, view)).toBe(true)
    expect(taskMatchesView(other, view)).toBe(false)
  })

  it('combina filtro de estado e de propriedade (AND)', () => {
    const view: NotionTaskView = {
      id: 'v',
      name: 'v',
      statusFilter: 'open',
      propertyFilters: [{ property: 'Repositório', values: ['Felixo-AI-Core'] }],
    }
    const openMatch = task({ completed: false, fields: { Repositório: { name: 'Felixo-AI-Core' } } })
    const doneMatch = task({ completed: true, fields: { Repositório: { name: 'Felixo-AI-Core' } } })
    const openOther = task({ completed: false, fields: { Repositório: { name: 'Outro' } } })
    const result = filterTasksByView([openMatch, doneMatch, openOther], view)
    expect(result).toEqual([openMatch])
  })

  it('persiste e recupera views customizadas por conexão + database', () => {
    const target = storage()
    expect(readCustomViews('conn-1', 'db-1', target)).toEqual([])

    const views: NotionTaskView[] = [
      { id: 'repo-core', name: 'Felixo AI Core', statusFilter: 'all', propertyFilters: [{ property: 'Repositório', values: ['Felixo-AI-Core'] }] },
    ]
    saveCustomViews('conn-1', 'db-1', views, target)
    expect(readCustomViews('conn-1', 'db-1', target)).toEqual(views)
    expect(readCustomViews('conn-1', 'db-2', target)).toEqual([])
  })

  it('ignora dado guardado corrompido ou em formato inesperado', () => {
    expect(readCustomViews('conn-1', 'db-1', storage({ 'felixo:notion-task-views:conn-1:db-1': '{not-json' }))).toEqual([])
    expect(readCustomViews('conn-1', 'db-1', storage({ 'felixo:notion-task-views:conn-1:db-1': '[{"id":1}]' }))).toEqual([])
  })

  it('lista só propriedades com opções fechadas e não vazias', () => {
    const schema: Record<string, NotionSchemaProperty> = {
      Repositório: { id: '1', name: 'Repositório', type: 'select', select: { options: [{ name: 'A' }, { name: 'B' }] } },
      Título: { id: '2', name: 'Título', type: 'title' },
      SemOpcao: { id: '3', name: 'SemOpcao', type: 'select', select: { options: [] } },
    }
    expect(listFilterableProperties(schema)).toEqual([{ name: 'Repositório', type: 'select', options: ['A', 'B'] }])
  })
})
