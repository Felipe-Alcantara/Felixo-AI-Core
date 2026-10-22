import { describe, expect, it } from 'vitest'
import type { NotionSchemaProperty, NotionTask } from '../../shared/types/notion'
import {
  BUILT_IN_VIEWS,
  NO_VALUE_FILTER,
  describeFilterValues,
  filterTasksByView,
  filterValueChoices,
  isBuiltInView,
  listFilterableProperties,
  noValueLabel,
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

  // Hotfix de 22/10/2026: uma tarefa sem Repositório não tem valor nenhum, então nenhum filtro com
  // valores a deixava passar e ela sumia de toda visualização filtrada, sem jeito de escolhê-la.
  describe('tarefas sem valor na propriedade', () => {
    const SO_SEM_REPO: NotionTaskView = {
      id: 'sem-repo',
      name: 'Sem repositório',
      statusFilter: 'all',
      propertyFilters: [{ property: 'Repositório', values: [NO_VALUE_FILTER] }],
    }
    const COM_REPO_E_SEM: NotionTaskView = {
      id: 'core-e-sem',
      name: 'Core e sem repositório',
      statusFilter: 'all',
      propertyFilters: [{ property: 'Repositório', values: ['Felixo-AI-Core', NO_VALUE_FILTER] }],
    }
    const SO_CORE: NotionTaskView = {
      id: 'core',
      name: 'Core',
      statusFilter: 'all',
      propertyFilters: [{ property: 'Repositório', values: ['Felixo-AI-Core'] }],
    }

    // Como o valor vazio chega do Notion: propriedade ausente, null, texto vazio, lista vazia ou objeto sem nome.
    const VAZIOS: Array<[string, NotionTask['fields']]> = [
      ['campo ausente', {}],
      ['select nulo', { Repositório: null }],
      ['campo indefinido', { Repositório: undefined }],
      ['texto vazio', { Repositório: '' }],
      ['multi_select vazio', { Repositório: [] }],
      ['objeto sem nome', { Repositório: {} }],
    ]

    for (const [nome, fields] of VAZIOS) {
      it(`"sem repositório" pega a tarefa com ${nome}`, () => {
        expect(taskMatchesView(task({ fields }), SO_SEM_REPO)).toBe(true)
      })
    }

    it('"sem repositório" NÃO pega a tarefa que tem repositório', () => {
      expect(taskMatchesView(task({ fields: { Repositório: { name: 'Felixo-AI-Core' } } }), SO_SEM_REPO)).toBe(false)
    })

    it('a escolha combinada pega os dois lados: o repositório marcado e as tarefas sem repositório', () => {
      const comRepo = task({ id: 'a', fields: { Repositório: { name: 'Felixo-AI-Core' } } })
      const outroRepo = task({ id: 'b', fields: { Repositório: { name: 'Outro-Repo' } } })
      const semRepo = task({ id: 'c', fields: { Repositório: null } })

      expect(filterTasksByView([comRepo, outroRepo, semRepo], COM_REPO_E_SEM)).toEqual([comRepo, semRepo])
    })

    it('sem o marcador o comportamento de sempre continua: a tarefa sem repositório fica de fora', () => {
      expect(taskMatchesView(task({ fields: { Repositório: null } }), SO_CORE)).toBe(false)
      expect(taskMatchesView(task({ fields: {} }), SO_CORE)).toBe(false)
    })

    it('um filtro sem nenhum valor continua deixando tudo passar, com ou sem repositório', () => {
      const semValores: NotionTaskView = { ...SO_CORE, propertyFilters: [{ property: 'Repositório', values: [] }] }

      expect(taskMatchesView(task({ fields: { Repositório: null } }), semValores)).toBe(true)
      expect(taskMatchesView(task({ fields: { Repositório: { name: 'X' } } }), semValores)).toBe(true)
    })

    it('combina com o estado: "abertas e sem repositório" tira as concluídas sem repositório', () => {
      const aberta = task({ id: 'a', completed: false, fields: { Repositório: null } })
      const concluida = task({ id: 'b', completed: true, fields: { Repositório: null } })

      expect(filterTasksByView([aberta, concluida], { ...SO_SEM_REPO, statusFilter: 'open' })).toEqual([aberta])
    })

    it('a visualização salva com o marcador volta do armazenamento e continua funcionando', () => {
      const target = storage()
      saveCustomViews('conn-1', 'db-1', [SO_SEM_REPO], target)
      const [volta] = readCustomViews('conn-1', 'db-1', target)

      expect(taskMatchesView(task({ fields: { Repositório: null } }), volta)).toBe(true)
    })
  })

  describe('escolhas de valor do editor de visualização', () => {
    it('select e multi_select ganham "Sem <propriedade>" primeiro, antes das opções do schema', () => {
      expect(filterValueChoices({ name: 'Repositório', type: 'select', options: ['A', 'B'] })).toEqual([
        { value: NO_VALUE_FILTER, label: 'Sem Repositório' },
        { value: 'A', label: 'A' },
        { value: 'B', label: 'B' },
      ])
      expect(filterValueChoices({ name: 'Áreas', type: 'multi_select', options: ['VS'] })[0]).toEqual({
        value: NO_VALUE_FILTER,
        label: 'Sem Áreas',
      })
    })

    it('status não ganha a escolha: no Notion ele sempre tem valor', () => {
      expect(filterValueChoices({ name: 'Etapa', type: 'status', options: ['Entrada', 'Concluída'] })).toEqual([
        { value: 'Entrada', label: 'Entrada' },
        { value: 'Concluída', label: 'Concluída' },
      ])
    })

    it('o rótulo é o mesmo do cartão das tarefas sem valor no Painel', () => {
      expect(noValueLabel('Repositório')).toBe('Sem Repositório')
    })

    it('a dica da aba mostra o rótulo, nunca o marcador interno', () => {
      expect(describeFilterValues('Repositório', [NO_VALUE_FILTER])).toBe('Sem Repositório')
      expect(describeFilterValues('Repositório', ['Felixo-AI-Core', NO_VALUE_FILTER])).toBe('Felixo-AI-Core, Sem Repositório')
      expect(describeFilterValues('Repositório', ['Felixo-AI-Core'])).toBe('Felixo-AI-Core')
    })
  })
})
