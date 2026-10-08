import { describe, expect, it } from 'vitest'
import type { NotionSchemaProperty, NotionTask } from '../../shared/types/notion'
import { buildRepoCards, filterTasksByGroup } from './notion-repo-board'
import {
  DEFAULT_TASK_SCOPE,
  defaultTableView,
  effectiveRepoFilter,
  hideCompletedTasks,
  readTaskScope,
  repoChoices,
  saveTaskScope,
  visibleBuiltInViews,
} from './notion-task-scope'

function task(id: string, repo: string | null, completed = false): NotionTask {
  return {
    id,
    title: `Tarefa ${id}`,
    completed,
    status: completed ? 'Concluído' : 'A fazer',
    dueDate: '',
    priority: '',
    text: '',
    url: null,
    archived: false,
    createdAt: null,
    updatedAt: null,
    fields: repo ? { Repositório: repo } : {},
  }
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  }
}

const SCHEMA: Record<string, NotionSchemaProperty> = {
  Tarefa: { id: 'title', name: 'Tarefa', type: 'title' },
  Repositório: { id: 'r', name: 'Repositório', type: 'select' },
}

const TASKS = [
  task('1', 'felixo'),
  task('2', 'felixo'),
  task('3', 'felixo', true),
  task('4', 'midia'),
  task('5', 'midia', true),
  task('6', 'antigo', true),
  task('7', null),
]

describe('recorte da tabela do bloco Tarefas Notion', () => {
  it('nasce com todos os repositórios e as concluídas escondidas', () => {
    expect(DEFAULT_TASK_SCOPE).toEqual({ repo: null, showCompleted: false })
    expect(readTaskScope('c', 'd', memoryStorage())).toEqual(DEFAULT_TASK_SCOPE)
  })

  it('grava e relê por conexão + database', () => {
    const storage = memoryStorage()
    const scope = { repo: { property: 'Repositório', key: 'felixo', label: 'felixo' }, showCompleted: true }
    saveTaskScope('c', 'd', scope, storage)
    expect(readTaskScope('c', 'd', storage)).toEqual(scope)
    expect(readTaskScope('c', 'outra', storage)).toEqual(DEFAULT_TASK_SCOPE)
    expect([...storage.data.keys()]).toEqual(['felixo:notion-task-scope:c:d'])
  })

  it('campo inválido volta ao padrão sem derrubar o outro', () => {
    const storage = memoryStorage({ 'felixo:notion-task-scope:c:d': JSON.stringify({ repo: { key: 1 }, showCompleted: true }) })
    expect(readTaskScope('c', 'd', storage)).toEqual({ repo: null, showCompleted: true })
    expect(readTaskScope('c', 'd', memoryStorage({ 'felixo:notion-task-scope:c:d': '{quebrado' }))).toEqual(DEFAULT_TASK_SCOPE)
  })

  it('sem storage ou sem database não lê nem grava', () => {
    expect(readTaskScope('c', 'd', undefined)).toEqual(DEFAULT_TASK_SCOPE)
    const storage = memoryStorage()
    saveTaskScope('c', '', { repo: null, showCompleted: true }, storage)
    expect(storage.data.size).toBe(0)
  })

  it('com as concluídas escondidas, a barra fica só com Abertas', () => {
    expect(visibleBuiltInViews(false).map((view) => view.id)).toEqual(['open'])
    expect(visibleBuiltInViews(true).map((view) => view.id)).toEqual(['all', 'open', 'done'])
    expect(defaultTableView(false).id).toBe('open')
    expect(defaultTableView(true).id).toBe('all')
  })

  it('esconde as concluídas só quando pedido', () => {
    expect(hideCompletedTasks(TASKS, false).map((item) => item.id)).toEqual(['1', '2', '4', '7'])
    expect(hideCompletedTasks(TASKS, true)).toBe(TASKS)
  })

  it('o repositório gravado só vale com o Painel agrupando pela mesma coluna', () => {
    const scope = { repo: { property: 'Repositório', key: 'felixo', label: 'felixo' }, showCompleted: false }
    expect(effectiveRepoFilter(scope, 'Repositório')).toEqual(scope.repo)
    expect(effectiveRepoFilter(scope, 'Projeto')).toBeNull()
    expect(effectiveRepoFilter(scope, '')).toBeNull()
    expect(effectiveRepoFilter(DEFAULT_TASK_SCOPE, 'Repositório')).toBeNull()
  })

  it('o seletor lista os repositórios com tarefas abertas, mais abertas primeiro, com a contagem', () => {
    const cards = buildRepoCards({
      tasks: hideCompletedTasks(TASKS, false),
      schema: SCHEMA,
      groupBy: 'Repositório',
      detailsVia: '',
      details: null,
      tagProperties: [],
      showEmpty: false,
      search: '',
    })
    expect(repoChoices(cards, 'Repositório', null, false)).toEqual([
      { value: '', label: 'Todos os repositórios' },
      { value: 'felixo', label: 'felixo', meta: '2' },
      { value: 'midia', label: 'midia', meta: '1' },
      { value: '__sem-valor__', label: 'Sem Repositório', meta: '1' },
    ])
  })

  it('com as concluídas à mostra, conta o total e lista o repositório só com concluídas', () => {
    const cards = buildRepoCards({
      tasks: TASKS,
      schema: SCHEMA,
      groupBy: 'Repositório',
      detailsVia: '',
      details: null,
      tagProperties: [],
      showEmpty: false,
      search: '',
    })
    const choices = repoChoices(cards, 'Repositório', null, true)
    expect(choices.find((choice) => choice.value === 'felixo')?.meta).toBe('3')
    expect(choices.some((choice) => choice.value === 'antigo')).toBe(true)
  })

  it('mantém na lista o repositório escolhido que ficou sem tarefas', () => {
    const selected = { property: 'Repositório', key: 'antigo', label: 'antigo' }
    expect(repoChoices([], 'Repositório', selected, false)).toEqual([
      { value: '', label: 'Todos os repositórios' },
      { value: 'antigo', label: 'antigo', meta: '0' },
    ])
  })

  it('coluna sem "reposit" no nome rotula o item de todos pela coluna', () => {
    expect(repoChoices([], 'Projeto', null, false)[0]).toEqual({ value: '', label: 'Projeto: todos' })
  })

  it('escolher um repositório filtra a tabela por ele', () => {
    const repo = effectiveRepoFilter({ repo: { property: 'Repositório', key: 'midia', label: 'midia' }, showCompleted: false }, 'Repositório')
    const rows = filterTasksByGroup(hideCompletedTasks(TASKS, false), SCHEMA, repo)
    expect(rows.map((item) => item.id)).toEqual(['4'])
  })
})
