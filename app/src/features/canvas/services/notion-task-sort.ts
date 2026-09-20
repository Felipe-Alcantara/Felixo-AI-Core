import type { NotionSchemaProperty, NotionTask } from '../../shared/types/notion'

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

/**
 * A ordem visual das opções de `select`/`status` — a mesma que o app do
 * Notion mostra, não a ordem alfabética. Para `status` a ordem verdadeira
 * está nos `groups` (cada grupo — "A fazer"/"Em andamento"/"Concluído" — traz
 * `option_ids` na ordem certa); o array `options` do topo é só a lista
 * completa, sem garantia de que a ordem dele bata com a visual. `select` não
 * tem grupo — `options` já é a ordem.
 */
export function schemaOptionOrder(property: NotionSchemaProperty | undefined): string[] {
  if (!property) return []
  if (property.type === 'status') {
    const config = property.status as { options?: unknown; groups?: unknown } | undefined
    const options = Array.isArray(config?.options) ? (config.options as Array<{ id?: unknown; name?: unknown }>) : []
    const groups = Array.isArray(config?.groups)
      ? (config.groups as Array<{ option_ids?: unknown }>)
      : []
    if (groups.length > 0) {
      const nameById = new Map(options.map((option) => [option.id, option.name]))
      return groups
        .flatMap((group) => (Array.isArray(group.option_ids) ? group.option_ids : []))
        .map((id) => nameById.get(id))
        .filter((name): name is string => typeof name === 'string' && name.length > 0)
    }
    return options.map((option) => option.name).filter((name): name is string => typeof name === 'string' && name.length > 0)
  }

  const config = property[property.type as string]
  if (!config || typeof config !== 'object') return []
  const options = (config as { options?: unknown }).options
  if (!Array.isArray(options)) return []
  return options
    .map((option) => (option && typeof option === 'object' ? (option as { name?: unknown }).name : undefined))
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
}

/** Posição de uma opção na ordem do schema, ou `null` quando o schema não tem a propriedade ou a opção não está nela (ex.: valor legado/removido). */
function optionIndex(schema: Record<string, NotionSchemaProperty>, propertyName: string, optionName: string): number | null {
  if (!optionName) return null
  const order = schemaOptionOrder(schema[propertyName])
  const index = order.indexOf(optionName)
  return index === -1 ? null : index
}

/**
 * `task.status`/`task.priority` (colunas fixas "Estado"/"Prioridade") vêm de
 * QUALQUER propriedade do schema que bateu com a heurística do backend
 * (`notion-client.cjs: normalizePage` — primeiro `status`/`select`
 * encontrado para status; a que tem "prior"/"urg" no nome para prioridade).
 * Pra ordenar essas colunas pela ordem do schema (não alfabética) é preciso
 * achar a MESMA propriedade de novo aqui, pelo mesmo critério.
 */
const STATUS_NAME_PATTERN = /estado|status|etapa|situa[cç][aã]o|fase/i

/**
 * Mesma regra de `pickStatusPropertyName` (`notion-client.cjs`), que decide o
 * `task.status` no backend: `status` com nome de estado; `select` com esse nome;
 * o primeiro `status`; o primeiro `select`. Há um teste de paridade entre os dois.
 */
export function findStatusPropertyName(schema: Record<string, NotionSchemaProperty>): string | undefined {
  const defs = Object.values(schema).filter((property) => property.type === 'status' || property.type === 'select')
  const named = (type: string) => defs.find((property) => property.type === type && STATUS_NAME_PATTERN.test(property.name || ''))
  return (named('status') || named('select') || defs.find((property) => property.type === 'status') || defs[0])?.name
}

function findPriorityPropertyName(schema: Record<string, NotionSchemaProperty>): string | undefined {
  return Object.values(schema).find((property) => {
    if (property.type !== 'select' && property.type !== 'status') return false
    const lowerName = property.name.toLocaleLowerCase()
    return lowerName.includes('prior') || lowerName.includes('urg')
  })?.name
}

type SortKey = { kind: 'number'; value: number } | { kind: 'string'; value: string } | { kind: 'empty' }

function textKey(value: string): SortKey {
  return value ? { kind: 'string', value } : { kind: 'empty' }
}

function numberKey(value: number): SortKey {
  return Number.isFinite(value) ? { kind: 'number', value } : { kind: 'empty' }
}

/**
 * Uma chave por tarefa+coluna, calculada uma vez (ver `sortTasks`) — nunca
 * dentro do comparador, que é chamado O(n log n) vezes. Com 792 linhas isso
 * é a diferença entre ~792 chamadas de `formatValue` e ~15.000.
 */
function buildSortKey(
  task: NotionTask,
  column: string,
  schema: Record<string, NotionSchemaProperty>,
  formatValue: (value: unknown) => string,
): SortKey {
  if (column === 'title') return textKey(task.title || '')

  if (column === 'status') {
    const propertyName = findStatusPropertyName(schema)
    const index = propertyName ? optionIndex(schema, propertyName, task.status) : null
    return index !== null ? numberKey(index) : textKey(task.status || '')
  }

  if (column === 'priority') {
    const propertyName = findPriorityPropertyName(schema)
    const index = propertyName ? optionIndex(schema, propertyName, task.priority) : null
    return index !== null ? numberKey(index) : textKey(task.priority || '')
  }

  // ISO (`readPropertyValue` grava `raw.start` direto) — já ordena certo como string.
  if (column === 'dueDate') return textKey(task.dueDate || '')

  const property = schema[column]
  const raw = task.fields?.[column]

  if (property?.type === 'number') {
    return typeof raw === 'number' ? numberKey(raw) : { kind: 'empty' }
  }

  if (property?.type === 'checkbox') {
    return numberKey(raw === true ? 1 : 0)
  }

  if (property?.type === 'select' || property?.type === 'status') {
    const index = typeof raw === 'string' ? optionIndex(schema, column, raw) : null
    if (index !== null) return numberKey(index)
    return textKey(typeof raw === 'string' ? raw : '')
  }

  if (property?.type === 'multi_select' && Array.isArray(raw)) {
    const indices = raw
      .map((name) => (typeof name === 'string' ? optionIndex(schema, column, name) : null))
      .filter((index): index is number => index !== null)
    if (indices.length > 0) return numberKey(Math.min(...indices))
  }

  return textKey(formatValue(raw))
}

function compareKeys(left: SortKey, right: SortKey, direction: SortDirection): number {
  // Vazio sempre por último, nas duas direções — uma tarefa sem
  // prazo/prioridade não deveria "vencer" as com valor só porque ordenação
  // decrescente inverteria uma string vazia pra frente.
  if (left.kind === 'empty' && right.kind === 'empty') return 0
  if (left.kind === 'empty') return 1
  if (right.kind === 'empty') return -1

  const factor = direction === 'asc' ? 1 : -1
  if (left.kind === 'number' && right.kind === 'number') return factor * (left.value - right.value)

  const leftText = left.kind === 'number' ? String(left.value) : left.value
  const rightText = right.kind === 'number' ? String(right.value) : right.value
  return factor * leftText.localeCompare(rightText, 'pt-BR', { numeric: true, sensitivity: 'base' })
}

/**
 * Ordena uma cópia da lista (nunca muta `tasks`), respeitando a ordem do
 * schema pra `status`/`select`/`multi_select`/`checkbox`/`number` — a mesma
 * ordem que o app do Notion usa, não ordem alfabética de texto. `schema` é
 * opcional só pra não quebrar quem ainda não tinha acesso a ele; sem schema,
 * cai de volta pro texto formatado (comportamento anterior).
 */
export function sortTasks(
  tasks: NotionTask[],
  sort: SortState | null,
  formatValue: (value: unknown) => string,
  schema: Record<string, NotionSchemaProperty> = {},
): NotionTask[] {
  if (!sort) return tasks
  const { column, direction } = sort
  const keyed = tasks.map((task) => ({ task, key: buildSortKey(task, column, schema, formatValue) }))
  keyed.sort((a, b) => compareKeys(a.key, b.key, direction))
  return keyed.map((entry) => entry.task)
}
