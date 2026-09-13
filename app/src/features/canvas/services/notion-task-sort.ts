import type { NotionTask } from '../../shared/types/notion'

// Ordenação da tabela de tarefas do painel Notion: por coluna fixa (Tarefa,
// Estado, Prioridade, Prazo) ou por qualquer coluna dinâmica de propriedade
// (mesmo nome usado em `visibleColumns`). Persistida por conexão + database,
// no mesmo padrão de `notion-table-columns.ts`.

export type SortDirection = 'asc' | 'desc'

export type SortState = {
  /** 'title' | 'status' | 'priority' | 'dueDate' ou o nome de uma propriedade dinâmica. */
  column: string
  direction: SortDirection
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function getStorage(): StorageLike | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

function storageKey(connectionId: string, dataSourceId: string): string {
  return `felixo:notion-task-sort:${connectionId}:${dataSourceId}`
}

export function readSortState(
  connectionId: string,
  dataSourceId: string,
  storage: StorageLike | undefined = getStorage(),
): SortState | null {
  if (!storage || !connectionId || !dataSourceId) return null
  try {
    const raw = storage.getItem(storageKey(connectionId, dataSourceId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isValidSortState(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveSortState(
  connectionId: string,
  dataSourceId: string,
  sort: SortState | null,
  storage: StorageLike | undefined = getStorage(),
): void {
  if (!storage || !connectionId || !dataSourceId) return
  try {
    const key = storageKey(connectionId, dataSourceId)
    if (sort) storage.setItem(key, JSON.stringify(sort))
    else storage.removeItem(key)
  } catch {
    // Ordenação é um atalho local; storage indisponível não pode quebrar o app.
  }
}

function isValidSortState(value: unknown): value is SortState {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.column === 'string' && (record.direction === 'asc' || record.direction === 'desc')
}

/**
 * Clique num cabeçalho: primeiro clique ordena crescente, segundo clique na
 * mesma coluna inverte pra decrescente, terceiro clique remove a ordenação
 * (volta pra ordem natural do Notion) — o mesmo ciclo de três estados que
 * tabelas como a do Notion e a do GitHub usam.
 */
export function nextSortState(current: SortState | null, column: string): SortState | null {
  if (!current || current.column !== column) return { column, direction: 'asc' }
  if (current.direction === 'asc') return { column, direction: 'desc' }
  return null
}

function sortValue(task: NotionTask, column: string, formatValue: (value: unknown) => string): string {
  if (column === 'title') return task.title || ''
  if (column === 'status') return task.completed ? 'Concluída' : task.status || ''
  if (column === 'priority') return task.priority || ''
  if (column === 'dueDate') return task.dueDate || ''
  return formatValue(task.fields?.[column])
}

/**
 * Ordena uma cópia da lista (nunca muta `tasks`). Vazio sempre fica por
 * último, nas duas direções — uma tarefa sem prazo/prioridade não deveria
 * "vencer" as com prazo só porque string vazia ordena primeiro.
 */
export function sortTasks(
  tasks: NotionTask[],
  sort: SortState | null,
  formatValue: (value: unknown) => string,
): NotionTask[] {
  if (!sort) return tasks
  const { column, direction } = sort
  const factor = direction === 'asc' ? 1 : -1
  return [...tasks].sort((a, b) => {
    const left = sortValue(a, column, formatValue)
    const right = sortValue(b, column, formatValue)
    if (!left && !right) return 0
    if (!left) return 1
    if (!right) return -1
    return factor * left.localeCompare(right, 'pt-BR', { numeric: true, sensitivity: 'base' })
  })
}
