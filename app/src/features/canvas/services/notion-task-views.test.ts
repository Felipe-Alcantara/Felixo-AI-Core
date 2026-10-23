import { describe, expect, it } from 'vitest'
import type { NotionSchemaProperty, NotionTask } from '../../shared/types/notion'
import { buildRepoCards } from './notion-repo-board'
import { repoChoices } from './notion-task-scope'
import {
  BUILT_IN_VIEWS,
  NO_VALUE_FILTER,
  describeFilterValues,
  filterTasksByView,
  filterValueChoices,
  isBuiltInView,
  listFilterableProperties,
  noValueLabel,
  planRepoViews,
  readCustomViews,
  repoViewsLabel,
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

  // Hotfix de 23/10/2026: criar de uma vez uma visualização para cada repositório da lista do
  // seletor, em vez de abrir o editor e marcar um por um. Repetir a ação não pode duplicar abas.
  describe('visualização para cada repositório', () => {
    const REPOS = [
      { value: 'Felixo-AI-Core', label: 'Felixo-AI-Core' },
      { value: 'Meu-Ecoo-Prisma', label: 'Meu-Ecoo-Prisma' },
      { value: 'Estudo-IA-Flashcards', label: 'Estudo-IA-Flashcards' },
    ]

    function sequentialIds() {
      let next = 0
      return () => `id-${(next += 1)}`
    }

    function planFor(overrides: Partial<Parameters<typeof planRepoViews>[0]> = {}) {
      return planRepoViews({
        property: 'Repositório',
        repos: REPOS,
        existing: [],
        statusFilter: 'open',
        newId: sequentialIds(),
        ...overrides,
      })
    }

    it('cria uma visualização por repositório, só com o filtro dele, na ordem recebida', () => {
      const plan = planFor()

      expect(plan.existing).toBe(0)
      expect(plan.create).toEqual([
        { id: 'id-1', name: 'Felixo-AI-Core', statusFilter: 'open', propertyFilters: [{ property: 'Repositório', values: ['Felixo-AI-Core'] }] },
        { id: 'id-2', name: 'Meu-Ecoo-Prisma', statusFilter: 'open', propertyFilters: [{ property: 'Repositório', values: ['Meu-Ecoo-Prisma'] }] },
        { id: 'id-3', name: 'Estudo-IA-Flashcards', statusFilter: 'open', propertyFilters: [{ property: 'Repositório', values: ['Estudo-IA-Flashcards'] }] },
      ])
    })

    it('o estado da nova aba é o pedido: com as concluídas à mostra a aba mostra todas', () => {
      expect(planFor({ statusFilter: 'all' }).create.every((view) => view.statusFilter === 'all')).toBe(true)
    })

    it('cada aba criada pega só as tarefas do próprio repositório', () => {
      const core = task({ id: 'a', fields: { Repositório: { name: 'Felixo-AI-Core' } } })
      const prisma = task({ id: 'b', fields: { Repositório: { name: 'Meu-Ecoo-Prisma' } } })
      const semRepo = task({ id: 'c', fields: { Repositório: null } })
      const [abaCore, abaPrisma] = planFor().create

      expect(filterTasksByView([core, prisma, semRepo], abaCore)).toEqual([core])
      expect(filterTasksByView([core, prisma, semRepo], abaPrisma)).toEqual([prisma])
    })

    it('não repete a aba de quem já tem uma, mesmo renomeada e com outro estado', () => {
      const existing: NotionTaskView[] = [
        { id: 'minha', name: 'Meu core', statusFilter: 'all', propertyFilters: [{ property: 'Repositório', values: ['Felixo-AI-Core'] }] },
      ]
      const plan = planFor({ existing })

      expect(plan.existing).toBe(1)
      expect(plan.create.map((view) => view.name)).toEqual(['Meu-Ecoo-Prisma', 'Estudo-IA-Flashcards'])
    })

    it('uma aba com mais de um valor, com outro filtro junto ou de outra propriedade não vale como a do repositório', () => {
      const existing: NotionTaskView[] = [
        { id: 'dois', name: 'Dois', statusFilter: 'all', propertyFilters: [{ property: 'Repositório', values: ['Felixo-AI-Core', 'Meu-Ecoo-Prisma'] }] },
        {
          id: 'dois-filtros',
          name: 'Dois filtros',
          statusFilter: 'all',
          propertyFilters: [
            { property: 'Repositório', values: ['Estudo-IA-Flashcards'] },
            { property: 'Prioridade', values: ['Alta'] },
          ],
        },
        { id: 'outra', name: 'Outra', statusFilter: 'all', propertyFilters: [{ property: 'Projeto', values: ['Felixo-AI-Core'] }] },
      ]
      const plan = planFor({ existing })

      expect(plan.existing).toBe(0)
      expect(plan.create).toHaveLength(3)
    })

    it('repetir a ação com o resultado da primeira não cria nada', () => {
      const first = planFor()
      const second = planFor({ existing: first.create })

      expect(second.create).toEqual([])
      expect(second.existing).toBe(3)
    })

    it('nome já usado por outra aba, inclusive as fixas, ganha a coluna entre parênteses', () => {
      const existing: NotionTaskView[] = [
        ...BUILT_IN_VIEWS,
        { id: 'blog', name: 'Blog', statusFilter: 'all', propertyFilters: [{ property: 'Tipo', values: ['Conteúdo'] }] },
      ]
      const plan = planFor({
        repos: [
          { value: 'Abertas', label: 'Abertas' },
          { value: 'blog', label: 'blog' },
        ],
        existing,
      })

      expect(plan.create.map((view) => view.name)).toEqual(['Abertas (Repositório)', 'blog (Repositório)'])
    })

    it('dois repositórios de mesmo nome não ficam com abas de mesmo nome', () => {
      const plan = planFor({
        repos: [
          { value: 'a', label: 'Repo' },
          { value: 'b', label: 'Repo' },
        ],
      })

      expect(plan.create.map((view) => view.name)).toEqual(['Repo', 'Repo (Repositório)'])
    })

    it('ignora valor vazio, o marcador "sem valor" e repetições da lista', () => {
      const plan = planFor({
        repos: [
          { value: '', label: 'Todos os repositórios' },
          { value: NO_VALUE_FILTER, label: 'Sem Repositório' },
          { value: 'Felixo-AI-Core', label: 'Felixo-AI-Core' },
          { value: 'Felixo-AI-Core', label: 'Felixo-AI-Core' },
        ],
      })

      expect(plan.create.map((view) => view.propertyFilters[0].values[0])).toEqual(['Felixo-AI-Core'])
    })

    it('sem coluna ou sem repositório não há o que criar', () => {
      expect(planFor({ property: '' }).create).toEqual([])
      expect(planFor({ repos: [] }).create).toEqual([])
    })

    it('as abas criadas a partir da lista do seletor trazem as mesmas tarefas que o número ao lado de cada item', () => {
      const schema: Record<string, NotionSchemaProperty> = {
        Repositório: { id: '1', name: 'Repositório', type: 'select', select: { options: [{ name: 'Felixo-AI-Core' }, { name: 'Meu-Ecoo-Prisma' }] } },
      }
      // O formato que o app entrega: select é o texto da opção e multi_select, a lista de textos.
      const tasks = [
        task({ id: '1', fields: { Repositório: 'Felixo-AI-Core' } }),
        task({ id: '2', fields: { Repositório: 'Felixo-AI-Core' } }),
        task({ id: '3', completed: true, fields: { Repositório: 'Felixo-AI-Core' } }),
        task({ id: '4', fields: { Repositório: 'Meu-Ecoo-Prisma' } }),
        task({ id: '5', fields: { Repositório: null } }),
      ]
      const abertas = tasks.filter((item) => !item.completed)
      const cards = buildRepoCards({ tasks: abertas, schema, groupBy: 'Repositório', detailsVia: '', details: null, tagProperties: [], showEmpty: false, search: '' })
      const lista = repoChoices(cards, 'Repositório', null, false)
      const plan = planRepoViews({ property: 'Repositório', repos: lista, existing: [], statusFilter: 'open' })

      // A lista do seletor traz "todos" e "Sem Repositório"; nenhum dos dois vira aba.
      expect(plan.create.map((view) => view.name)).toEqual(['Felixo-AI-Core', 'Meu-Ecoo-Prisma'])
      for (const view of plan.create) {
        const item = lista.find((choice) => choice.value === view.propertyFilters[0].values[0])
        expect(filterTasksByView(tasks, view)).toHaveLength(Number(item?.meta))
      }
    })

    it('o nome da ação segue a coluna de agrupamento', () => {
      expect(repoViewsLabel('Repositório')).toBe('repositório')
      expect(repoViewsLabel('Projeto')).toBe('projeto')
    })
  })
})
