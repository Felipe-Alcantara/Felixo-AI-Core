import { describe, expect, it } from 'vitest'
import { nextSortState, readSortState, saveSortState, schemaOptionOrder, sortTasks } from './notion-task-sort'
import type { NotionSchemaProperty, NotionTask } from '../../shared/types/notion'

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

/** Propriedade `select` do schema real do Notion — `options` na ordem visual configurada. */
function selectProperty(name: string, optionNames: string[]): NotionSchemaProperty {
  return {
    id: name,
    name,
    type: 'select',
    select: { options: optionNames.map((optionName, index) => ({ id: `opt-${index}`, name: optionName, color: 'default' })) },
  }
}

/**
 * Propriedade `status` do schema real do Notion — `options` é a lista completa
 * SEM garantia de ordem visual; `groups` traz `option_ids` na ordem certa
 * dentro de cada grupo ("A fazer" → "Em andamento" → "Concluído").
 */
function statusProperty(name: string, groupsInOrder: string[][]): NotionSchemaProperty {
  const allNames = groupsInOrder.flat()
  const idOf = (optionName: string) => `opt-${allNames.indexOf(optionName)}`
  return {
    id: name,
    name,
    type: 'status',
    status: {
      // Embaralhado de propósito — o teste real precisa provar que a ordem
      // vem dos `groups`, não deste array.
      options: [...allNames].reverse().map((optionName) => ({ id: idOf(optionName), name: optionName, color: 'default' })),
      groups: groupsInOrder.map((group, groupIndex) => ({
        id: `group-${groupIndex}`,
        name: `Grupo ${groupIndex}`,
        color: 'default',
        option_ids: group.map(idOf),
      })),
    },
  }
}

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

  it('sem schema, ordena status pelo texto — igual antes (fallback, não regressão)', () => {
    const withStatus = [
      task({ id: '1', status: 'Em andamento' }),
      task({ id: '2', status: 'Aguardando' }),
    ]
    const sorted = sortTasks(withStatus, { column: 'status', direction: 'asc' }, formatValue)
    expect(sorted.map((t) => t.id)).toEqual(['2', '1']) // "Aguardando" < "Em andamento" por texto
  })

  it('usa task.status real mesmo quando completed=true — não força mais o texto "Concluída"', () => {
    // O achado da task: forçar "Concluída" ignorava o status real e o
    // colocava fora de ordem entre outros textos. task.status já vem certo
    // do backend (normalizePage lê a propriedade de verdade); sortTasks não
    // deve reescrever isso.
    const withStatus = [
      task({ id: '1', completed: true, status: 'Feito' }),
      task({ id: '2', status: 'Bloqueado' }),
    ]
    const sorted = sortTasks(withStatus, { column: 'status', direction: 'asc' }, formatValue)
    expect(sorted.map((t) => t.status)).toEqual(['Bloqueado', 'Feito'])
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

  describe('com schema — ordem do Notion, não ordem alfabética (o achado real da task)', () => {
    // Exemplo real citado na task: alfabético daria Alta, Baixa, Hiperfoco,
    // Média, Urgente; a ordem certa do Notion é Baixa → Média → Alta →
    // Urgente → Hiperfoco.
    const priorityOrder = ['Baixa', 'Média', 'Alta', 'Urgente', 'Hiperfoco']
    const schema = { Prioridade: selectProperty('Prioridade', priorityOrder) }

    it('ordena a coluna fixa "priority" pela ordem das opções do schema, não por texto', () => {
      const tasks = [
        task({ id: '1', priority: 'Alta' }),
        task({ id: '2', priority: 'Hiperfoco' }),
        task({ id: '3', priority: 'Baixa' }),
        task({ id: '4', priority: 'Urgente' }),
        task({ id: '5', priority: 'Média' }),
      ]
      const sorted = sortTasks(tasks, { column: 'priority', direction: 'asc' }, formatValue, schema)
      expect(sorted.map((t) => t.priority)).toEqual(priorityOrder)
    })

    it('acha a propriedade de prioridade pelo nome (contém "prior"/"urg"), mesmo em coluna dinâmica com outro nome de exibição', () => {
      const customSchema = { Urgência: selectProperty('Urgência', priorityOrder) }
      const tasks = [
        task({ id: '1', fields: { Urgência: 'Hiperfoco' } }),
        task({ id: '2', fields: { Urgência: 'Baixa' } }),
      ]
      const sorted = sortTasks(tasks, { column: 'Urgência', direction: 'asc' }, formatValue, customSchema)
      expect(sorted.map((t) => t.id)).toEqual(['2', '1'])
    })

    it('ordem decrescente inverte a ordem do schema, não a alfabética', () => {
      const tasks = [task({ id: '1', priority: 'Baixa' }), task({ id: '2', priority: 'Alta' })]
      const sorted = sortTasks(tasks, { column: 'priority', direction: 'desc' }, formatValue, schema)
      expect(sorted.map((t) => t.priority)).toEqual(['Alta', 'Baixa'])
    })

    it('valor que não está mais no schema (opção removida/legada) cai pro fim, não quebra', () => {
      const tasks = [task({ id: '1', priority: 'Baixa' }), task({ id: '2', priority: 'Descontinuada' })]
      const sorted = sortTasks(tasks, { column: 'priority', direction: 'asc' }, formatValue, schema)
      expect(sorted.map((t) => t.id)).toEqual(['1', '2'])
    })
  })

  describe('status com grupo (ex.: "Etapa") — ordem vem dos groups, não do array options', () => {
    const schema = {
      Etapa: statusProperty('Etapa', [
        ['A fazer', 'Em breve'],
        ['Em andamento'],
        ['Concluído', 'Cancelado'],
      ]),
    }

    it('ordena pela ordem dos grupos e, dentro do grupo, pela ordem de option_ids', () => {
      const tasks = [
        task({ id: '1', status: 'Concluído' }),
        task({ id: '2', status: 'A fazer' }),
        task({ id: '3', status: 'Em andamento' }),
        task({ id: '4', status: 'Em breve' }),
      ]
      const sorted = sortTasks(tasks, { column: 'status', direction: 'asc' }, formatValue, schema)
      expect(sorted.map((t) => t.status)).toEqual(['A fazer', 'Em breve', 'Em andamento', 'Concluído'])
    })

    it('uma tarefa concluída (completed=true) ordena pelo grupo real dela, não isolada no fim por um texto fixo', () => {
      const tasks = [
        task({ id: '1', completed: true, status: 'Cancelado' }),
        task({ id: '2', status: 'A fazer' }),
        task({ id: '3', completed: true, status: 'Concluído' }),
      ]
      const sorted = sortTasks(tasks, { column: 'status', direction: 'asc' }, formatValue, schema)
      expect(sorted.map((t) => t.id)).toEqual(['2', '3', '1'])
    })
  })

  describe('outros tipos de propriedade — comparados pelo valor real, não pelo texto formatado', () => {
    it('number: compara numericamente (não como string)', () => {
      const schema = { Pontos: { id: 'Pontos', name: 'Pontos', type: 'number' } }
      const tasks = [
        task({ id: '1', fields: { Pontos: 9 } }),
        task({ id: '2', fields: { Pontos: 10 } }),
        task({ id: '3', fields: { Pontos: 2 } }),
      ]
      const sorted = sortTasks(tasks, { column: 'Pontos', direction: 'asc' }, formatValue, schema)
      expect(sorted.map((t) => t.id)).toEqual(['3', '1', '2'])
    })

    it('checkbox: false antes de true em ordem crescente', () => {
      const schema = { Revisado: { id: 'Revisado', name: 'Revisado', type: 'checkbox' } }
      const tasks = [
        task({ id: '1', fields: { Revisado: true } }),
        task({ id: '2', fields: { Revisado: false } }),
      ]
      const sorted = sortTasks(tasks, { column: 'Revisado', direction: 'asc' }, formatValue, schema)
      expect(sorted.map((t) => t.id)).toEqual(['2', '1'])
    })

    it('multi_select: ordena pela opção selecionada mais "cedo" na ordem do schema', () => {
      const options = ['P0', 'P1', 'P2']
      const schema = {
        Tags: {
          id: 'Tags',
          name: 'Tags',
          type: 'multi_select',
          multi_select: { options: options.map((name, index) => ({ id: `opt-${index}`, name, color: 'default' })) },
        } satisfies NotionSchemaProperty,
      }
      const tasks = [
        task({ id: '1', fields: { Tags: ['P2'] } }),
        task({ id: '2', fields: { Tags: ['P1', 'P0'] } }),
      ]
      const sorted = sortTasks(tasks, { column: 'Tags', direction: 'asc' }, formatValue, schema)
      expect(sorted.map((t) => t.id)).toEqual(['2', '1']) // menor índice: P0 (0) < P2 (2)
    })
  })

  describe('desempenho — chave calculada uma vez por tarefa, não a cada comparação', () => {
    it('chama formatValue no máximo N vezes para N tarefas (não O(n log n))', () => {
      const tasks = Array.from({ length: 50 }, (_, index) => task({ id: String(index), fields: { X: `v${index}` } }))
      let calls = 0
      const countingFormat = (value: unknown) => {
        calls += 1
        return typeof value === 'string' ? value : ''
      }
      sortTasks(tasks, { column: 'X', direction: 'asc' }, countingFormat, {})
      expect(calls).toBeLessThanOrEqual(tasks.length)
    })
  })
})

describe('schemaOptionOrder', () => {
  it('select: devolve as opções na ordem em que estão no schema', () => {
    expect(schemaOptionOrder(selectProperty('Prioridade', ['Baixa', 'Alta']))).toEqual(['Baixa', 'Alta'])
  })

  it('status com groups: monta a ordem a partir dos grupos, ignorando a ordem do array options solto', () => {
    const property = statusProperty('Etapa', [['A fazer'], ['Em andamento'], ['Feito']])
    expect(schemaOptionOrder(property)).toEqual(['A fazer', 'Em andamento', 'Feito'])
  })

  it('status sem groups: cai pro array options', () => {
    const property: NotionSchemaProperty = {
      id: 'Etapa',
      name: 'Etapa',
      type: 'status',
      status: { options: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }] },
    }
    expect(schemaOptionOrder(property)).toEqual(['A', 'B'])
  })

  it('propriedade indefinida ou de tipo sem opções devolve lista vazia', () => {
    expect(schemaOptionOrder(undefined)).toEqual([])
    expect(schemaOptionOrder({ id: 'x', name: 'x', type: 'number' })).toEqual([])
  })
})
