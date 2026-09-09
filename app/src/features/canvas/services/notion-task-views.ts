import type { NotionSchemaProperty, NotionTask } from '../../shared/types/notion'

/** Tipos de propriedade Notion que aceitam um conjunto fechado de valores e por isso servem de filtro. */
const FILTERABLE_PROPERTY_TYPES = ['select', 'multi_select', 'status'] as const

export type NotionStatusScope = 'all' | 'open' | 'done'

export type NotionPropertyFilter = {
  /** Nome da propriedade no schema da database (ex.: "Repositório"). */
  property: string
  /** Tarefa entra na view se qualquer um destes valores estiver presente na propriedade. */
  values: string[]
}

export type NotionTaskView = {
  id: string
  name: string
  statusFilter: NotionStatusScope
  propertyFilters: NotionPropertyFilter[]
}

export type FilterableProperty = {
  name: string
  type: string
  options: string[]
}

export const BUILT_IN_VIEWS: readonly NotionTaskView[] = [
  { id: 'all', name: 'Todas', statusFilter: 'all', propertyFilters: [] },
  { id: 'open', name: 'Abertas', statusFilter: 'open', propertyFilters: [] },
  { id: 'done', name: 'Concluídas', statusFilter: 'done', propertyFilters: [] },
]

export function isBuiltInView(viewId: string): boolean {
  return BUILT_IN_VIEWS.some((view) => view.id === viewId)
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function getStorage(): StorageLike | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

function storageKey(connectionId: string, dataSourceId: string): string {
  return `felixo:notion-task-views:${connectionId}:${dataSourceId}`
}

/** Visualizações personalizadas guardadas por conexão + database, como as tabelas filtradas do Notion. */
export function readCustomViews(
  connectionId: string,
  dataSourceId: string,
  storage: StorageLike | undefined = getStorage(),
): NotionTaskView[] {
  if (!storage || !connectionId || !dataSourceId) return []
  try {
    const raw = storage.getItem(storageKey(connectionId, dataSourceId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidView)
  } catch {
    return []
  }
}

export function saveCustomViews(
  connectionId: string,
  dataSourceId: string,
  views: NotionTaskView[],
  storage: StorageLike | undefined = getStorage(),
): void {
  if (!storage || !connectionId || !dataSourceId) return
  try {
    storage.setItem(storageKey(connectionId, dataSourceId), JSON.stringify(views))
  } catch {
    // Views personalizadas são um atalho local; storage indisponível não pode quebrar o app.
  }
}

function isValidView(value: unknown): value is NotionTaskView {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    (record.statusFilter === 'all' || record.statusFilter === 'open' || record.statusFilter === 'done') &&
    Array.isArray(record.propertyFilters) &&
    record.propertyFilters.every(
      (filter) =>
        filter &&
        typeof filter === 'object' &&
        typeof (filter as { property?: unknown }).property === 'string' &&
        Array.isArray((filter as { values?: unknown }).values),
    )
  )
}

export function createViewId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Propriedades da database que têm um conjunto fechado de opções e por isso podem virar filtro de view. */
export function listFilterableProperties(schema: Record<string, NotionSchemaProperty>): FilterableProperty[] {
  return Object.values(schema)
    .filter((property) => (FILTERABLE_PROPERTY_TYPES as readonly string[]).includes(property.type))
    .map((property) => ({
      name: property.name,
      type: property.type,
      options: readPropertyOptions(property),
    }))
    .filter((property) => property.options.length > 0)
}

function readPropertyOptions(property: NotionSchemaProperty): string[] {
  const config = property[property.type]
  if (!config || typeof config !== 'object') return []
  const items = (config as { options?: unknown[] }).options
  if (!Array.isArray(items)) return []
  return items
    .map((item) => (item && typeof item === 'object' ? (item as { name?: unknown }).name : undefined))
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
}

/** Valores efetivos de uma propriedade numa tarefa (select vira 1 item, multi_select vira N). */
function extractPropertyValues(value: unknown): string[] {
  if (value === null || value === undefined) return []
  if (typeof value === 'string') return value ? [value] : []
  if (Array.isArray(value)) return value.flatMap(extractPropertyValues)
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.name === 'string') return [record.name]
    if (typeof record.plain_text === 'string') return [record.plain_text]
  }
  return []
}

export function taskMatchesView(task: NotionTask, view: NotionTaskView): boolean {
  if (view.statusFilter === 'open' && task.completed) return false
  if (view.statusFilter === 'done' && !task.completed) return false
  return view.propertyFilters.every((filter) => {
    if (filter.values.length === 0) return true
    const taskValues = extractPropertyValues(task.fields?.[filter.property])
    return taskValues.some((value) => filter.values.includes(value))
  })
}

export function filterTasksByView(tasks: NotionTask[], view: NotionTaskView): NotionTask[] {
  return tasks.filter((task) => taskMatchesView(task, view))
}
