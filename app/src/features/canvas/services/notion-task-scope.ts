import type { NotionTask } from '../../shared/types/notion'
import type { RepoCard, RepoGroupFilter } from './notion-repo-board'
import { BUILT_IN_VIEWS, type NotionTaskView } from './notion-task-views'

/**
 * Recorte da tabela do bloco Tarefas Notion que vale para todas as abas: de
 * qual repositório (valor da coluna de agrupamento do Painel) vêm as tarefas
 * e se as concluídas aparecem. Fica gravado por conexão + database.
 */
export type NotionTaskScope = {
  /** Repositório escolhido no seletor (ou no cartão do Painel); `null` = todos. */
  repo: RepoGroupFilter | null
  /** Concluídas escondidas por padrão: a tabela é a lista do que falta fazer. */
  showCompleted: boolean
}

export const DEFAULT_TASK_SCOPE: NotionTaskScope = { repo: null, showCompleted: false }

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function getStorage(): StorageLike | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

function storageKey(connectionId: string, dataSourceId: string): string {
  return `felixo:notion-task-scope:${connectionId}:${dataSourceId}`
}

function isRepoFilter(value: unknown): value is RepoGroupFilter {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.property === 'string' && typeof record.key === 'string' && typeof record.label === 'string'
}

/** Campo inválido volta ao padrão sem derrubar o outro. */
export function readTaskScope(
  connectionId: string,
  dataSourceId: string,
  storage: StorageLike | undefined = getStorage(),
): NotionTaskScope {
  if (!storage || !connectionId || !dataSourceId) return DEFAULT_TASK_SCOPE
  try {
    const raw = storage.getItem(storageKey(connectionId, dataSourceId))
    if (!raw) return DEFAULT_TASK_SCOPE
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return DEFAULT_TASK_SCOPE
    const record = parsed as Record<string, unknown>
    return {
      repo: isRepoFilter(record.repo) ? record.repo : null,
      showCompleted: record.showCompleted === true,
    }
  } catch {
    return DEFAULT_TASK_SCOPE
  }
}

export function saveTaskScope(
  connectionId: string,
  dataSourceId: string,
  scope: NotionTaskScope,
  storage: StorageLike | undefined = getStorage(),
): void {
  if (!storage || !connectionId || !dataSourceId) return
  try {
    storage.setItem(storageKey(connectionId, dataSourceId), JSON.stringify(scope))
  } catch {
    // Preferência de tela; storage indisponível não pode quebrar a tabela.
  }
}

/** Com as concluídas escondidas, "Todas" e "Concluídas" repetiriam "Abertas" ou viriam vazias: sobra só "Abertas". */
export function visibleBuiltInViews(showCompleted: boolean): NotionTaskView[] {
  return showCompleted ? [...BUILT_IN_VIEWS] : BUILT_IN_VIEWS.filter((view) => view.statusFilter === 'open')
}

/** Aba fixa que a tabela abre quando a escolhida não está (mais) na barra. */
export function defaultTableView(showCompleted: boolean): NotionTaskView {
  return visibleBuiltInViews(showCompleted)[0]
}

/** O repositório gravado só vale enquanto o Painel agrupa pela mesma coluna. */
export function effectiveRepoFilter(scope: NotionTaskScope, groupBy: string): RepoGroupFilter | null {
  return scope.repo && groupBy && scope.repo.property === groupBy ? scope.repo : null
}

export function hideCompletedTasks(tasks: NotionTask[], showCompleted: boolean): NotionTask[] {
  return showCompleted ? tasks : tasks.filter((task) => !task.completed)
}

export type RepoChoice = { value: string; label: string; meta?: string }

/**
 * Opções do seletor: "todos" e um item por cartão (mais abertas primeiro, como
 * no Painel), com a contagem que a tabela vai mostrar. O repositório gravado
 * que não tem tarefa na carga atual continua na lista, para não sumir da tela.
 */
export function repoChoices(
  cards: RepoCard[],
  groupBy: string,
  selected: RepoGroupFilter | null,
  showCompleted: boolean,
): RepoChoice[] {
  const allLabel = /reposit/i.test(groupBy) ? 'Todos os repositórios' : `${groupBy}: todos`
  const choices: RepoChoice[] = [
    { value: '', label: allLabel },
    ...cards
      .filter((card) => card.total > 0)
      .map((card) => ({ value: card.key, label: card.label, meta: String(showCompleted ? card.total : card.open) })),
  ]
  if (selected && !choices.some((choice) => choice.value === selected.key)) {
    choices.push({ value: selected.key, label: selected.label, meta: '0' })
  }
  return choices
}
