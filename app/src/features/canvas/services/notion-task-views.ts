import type { NotionSchemaProperty, NotionTask } from '../../shared/types/notion'
import { schemaOptionOrder } from './notion-task-sort'

/** Tipos de propriedade Notion que aceitam um conjunto fechado de valores e por isso servem de filtro. */
const FILTERABLE_PROPERTY_TYPES = ['select', 'multi_select', 'status'] as const

export type NotionStatusScope = 'all' | 'open' | 'done'

/**
 * Valor que, dentro de `NotionPropertyFilter.values`, quer dizer "a propriedade
 * está vazia". O Notion não tem uma opção para isso: uma tarefa sem Repositório
 * não tem valor nenhum, e sem este marcador não havia como escolhê-la — qualquer
 * filtro com valores a escondia. Fica gravado nas visualizações salvas, então o
 * texto não muda.
 */
export const NO_VALUE_FILTER = '__sem-valor__'

export type NotionPropertyFilter = {
  /** Nome da propriedade no schema da database (ex.: "Repositório"). */
  property: string
  /** Tarefa entra na view se qualquer um destes valores estiver presente na propriedade (ou `NO_VALUE_FILTER` e ela estiver vazia). */
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
      // A ordem visual do Notion (ver schemaOptionOrder), não a ordem
      // arbitrária do array `options` da API — importa pra `status`, que
      // tem grupo, e é exatamente a mesma ordem que a ordenação usa.
      options: schemaOptionOrder(property),
    }))
    .filter((property) => property.options.length > 0)
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
    // Sem valor nenhum, a tarefa só entra se o filtro pediu "sem valor" de propósito.
    if (taskValues.length === 0) return filter.values.includes(NO_VALUE_FILTER)
    return taskValues.some((value) => filter.values.includes(value))
  })
}

export type FilterValueChoice = { value: string; label: string }

/** "Sem Repositório": o mesmo rótulo do cartão das tarefas sem valor no Painel. */
export function noValueLabel(property: string): string {
  return `Sem ${property}`
}

/**
 * Escolhas de valor do editor de visualização: "Sem <propriedade>" primeiro,
 * depois as opções do schema. `status` fica sem a escolha, porque no Notion ele
 * sempre tem valor; só `select` e `multi_select` podem estar vazios.
 */
export function filterValueChoices(property: FilterableProperty): FilterValueChoice[] {
  const options = property.options.map((option) => ({ value: option, label: option }))
  return property.type === 'status'
    ? options
    : [{ value: NO_VALUE_FILTER, label: noValueLabel(property.name) }, ...options]
}

/** Texto legível dos valores de um filtro (dica da aba), sem mostrar o marcador interno. */
export function describeFilterValues(property: string, values: string[]): string {
  return values.map((value) => (value === NO_VALUE_FILTER ? noValueLabel(property) : value)).join(', ')
}

export function filterTasksByView(tasks: NotionTask[], view: NotionTaskView): NotionTask[] {
  return tasks.filter((task) => taskMatchesView(task, view))
}

export type RepoViewCandidate = { value: string; label: string }

export type RepoViewPlan = {
  /** Visualizações a criar, na ordem dos repositórios recebidos. */
  create: NotionTaskView[]
  /** Quantos repositórios já tinham a própria visualização e ficaram de fora. */
  existing: number
}

/** "repositório" (ou o nome da coluna, em minúsculas): como a ação "uma por ..." chama o agrupamento do Painel. */
export function repoViewsLabel(groupBy: string): string {
  return /reposit/i.test(groupBy) ? 'repositório' : groupBy.toLowerCase()
}

/** A visualização do repositório é a que filtra só por ele e por mais nada: renomear ou mudar o estado não a descaracteriza. */
function isViewOfRepo(view: NotionTaskView, property: string, value: string): boolean {
  if (view.propertyFilters.length !== 1) return false
  const [filter] = view.propertyFilters
  return filter.property === property && filter.values.length === 1 && filter.values[0] === value
}

function normalizedViewName(name: string): string {
  return name.trim().toLocaleLowerCase('pt-BR')
}

/**
 * Plano de "uma visualização para cada repositório": uma por valor da coluna de
 * agrupamento, só com o filtro dele. Quem já tem a sua (em `existing`, as fixas
 * e as próprias) fica de fora, então repetir a ação não duplica nada. O valor
 * vazio, o marcador "sem valor" e as repetições da lista não viram aba. O nome é
 * o do repositório; se outra aba já usa o nome, ganha a coluna entre parênteses
 * (e um número, no caso extremo) para as abas não ficarem iguais na barra.
 */
export function planRepoViews(input: {
  property: string
  repos: RepoViewCandidate[]
  existing: NotionTaskView[]
  statusFilter: NotionStatusScope
  newId?: () => string
}): RepoViewPlan {
  const { property, repos, existing, statusFilter, newId = createViewId } = input
  const plan: RepoViewPlan = { create: [], existing: 0 }
  if (!property) return plan

  const usedNames = new Set(existing.map((view) => normalizedViewName(view.name)))
  const seen = new Set<string>()
  for (const repo of repos) {
    if (!repo.value || repo.value === NO_VALUE_FILTER || seen.has(repo.value)) continue
    seen.add(repo.value)
    if (existing.some((view) => isViewOfRepo(view, property, repo.value))) {
      plan.existing += 1
      continue
    }
    let name = repo.label
    for (let attempt = 1; usedNames.has(normalizedViewName(name)); attempt += 1) {
      name = attempt === 1 ? `${repo.label} (${property})` : `${repo.label} (${property}) ${attempt}`
    }
    usedNames.add(normalizedViewName(name))
    plan.create.push({ id: newId(), name, statusFilter, propertyFilters: [{ property, values: [repo.value] }] })
  }
  return plan
}
