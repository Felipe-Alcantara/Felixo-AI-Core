import type { NotionSchemaProperty, NotionTask } from '../../shared/types/notion'
import type { NotionTaskView } from './notion-task-views'

/**
 * Painel de repositórios do bloco Tarefas Notion: um cartão por valor de uma
 * coluna das tarefas (ex.: "Repositório"), com o placar de abertas/concluídas,
 * enriquecido com a linha correspondente de uma database ligada (ex.: GITHUB:
 * link, linguagem, arquivado). Tudo aqui é puro — a tela só desenha o resultado.
 */

/** A aba Painel ocupa o lugar de uma visualização; carrega sempre todos os estados. */
export const REPO_BOARD_VIEW: NotionTaskView = { id: 'painel', name: 'Painel', statusFilter: 'all', propertyFilters: [] }

/** Chave do cartão que junta as tarefas sem a coluna de agrupamento preenchida. */
export const NO_GROUP_KEY = '__sem-valor__'

const GROUPABLE_TYPES = ['select', 'multi_select', 'status', 'relation'] as const
const TAG_TYPES = ['select', 'multi_select', 'status'] as const

const REPOSITORY_NAME = /reposit/i
const PROJECT_NAME = /projeto|project/i
const TAG_NAME = /linguagem|language|stack|tecnolog|status|estado|situa/i
const LINK_NAME = /github|reposit/i
const ARCHIVED_NAME = /arquiv|archiv/i
const FORK_NAME = /^fork$/i

/** Um só collator: `localeCompare(x, 'pt-BR')` monta um a cada comparação. */
const collator = new Intl.Collator('pt-BR')

export type RepoBoardSettings = {
  /** Coluna das tarefas que vira cartão; `null` = automático. */
  groupBy: string | null
  /** Coluna de ligação que aponta a database de detalhes; `null` = automático, `''` = nenhuma. */
  detailsVia: string | null
  /** Colunas da database de detalhes que viram etiqueta; `null` = automático. */
  tagProperties: string[] | null
  /** Mostra também as linhas da database de detalhes que não têm nenhuma tarefa. */
  showEmpty: boolean
  /** O Painel era a aba aberta da última vez. */
  open: boolean
}

export const DEFAULT_REPO_BOARD_SETTINGS: RepoBoardSettings = {
  groupBy: null,
  detailsVia: null,
  tagProperties: null,
  showEmpty: false,
  open: false,
}

/** A database de detalhes já carregada: linhas normalizadas como tarefas, mais o schema dela. */
export type RepoBoardDetails = {
  rows: NotionTask[]
  schema: Record<string, NotionSchemaProperty>
}

export type RepoCard = {
  /** Valor do grupo (nome da opção ou ID da página ligada), `NO_GROUP_KEY`, ou `detalhe:<id>` sem tarefas. */
  key: string
  label: string
  total: number
  open: number
  done: number
  /** 0–100, arredondado. */
  percent: number
  tags: string[]
  link: string | null
  archived: boolean
  /** Cartão sem tarefas não abre a tabela: não haveria nada para mostrar. */
  clickable: boolean
}

export type RepoGroupFilter = {
  property: string
  key: string
  label: string
}

export type BuildRepoCardsInput = {
  tasks: NotionTask[]
  schema: Record<string, NotionSchemaProperty>
  groupBy: string
  detailsVia: string
  details: RepoBoardDetails | null
  tagProperties: string[]
  showEmpty: boolean
  search: string
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
  return `felixo:notion-repo-board:${connectionId}:${dataSourceId}`
}

/** Preferências do Painel por conexão + database; campo inválido volta ao padrão sem derrubar os outros. */
export function readRepoBoardSettings(
  connectionId: string,
  dataSourceId: string,
  storage: StorageLike | undefined = getStorage(),
): RepoBoardSettings {
  if (!storage || !connectionId || !dataSourceId) return DEFAULT_REPO_BOARD_SETTINGS
  try {
    const raw = storage.getItem(storageKey(connectionId, dataSourceId))
    if (!raw) return DEFAULT_REPO_BOARD_SETTINGS
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return DEFAULT_REPO_BOARD_SETTINGS
    const record = parsed as Record<string, unknown>
    return {
      groupBy: typeof record.groupBy === 'string' ? record.groupBy : null,
      detailsVia: typeof record.detailsVia === 'string' ? record.detailsVia : null,
      tagProperties:
        Array.isArray(record.tagProperties) && record.tagProperties.every((item) => typeof item === 'string')
          ? (record.tagProperties as string[])
          : null,
      showEmpty: record.showEmpty === true,
      open: record.open === true,
    }
  } catch {
    return DEFAULT_REPO_BOARD_SETTINGS
  }
}

export function saveRepoBoardSettings(
  connectionId: string,
  dataSourceId: string,
  settings: RepoBoardSettings,
  storage: StorageLike | undefined = getStorage(),
): void {
  if (!storage || !connectionId || !dataSourceId) return
  try {
    storage.setItem(storageKey(connectionId, dataSourceId), JSON.stringify(settings))
  } catch {
    // Preferência de tela; storage indisponível não pode quebrar o painel.
  }
}

/**
 * Aba com que a database abre: o Painel, se era a aba aberta da última vez
 * nesta conexão + database. Vale ao montar o bloco (que já nasce com a escolha
 * gravada) e ao trocar de database.
 */
export function openingViewId(
  connectionId: string,
  dataSourceId: string,
  fallbackViewId: string,
  storage: StorageLike | undefined = getStorage(),
): string {
  return readRepoBoardSettings(connectionId, dataSourceId, storage).open ? REPO_BOARD_VIEW.id : fallbackViewId
}

function propertiesOfType(schema: Record<string, NotionSchemaProperty>, types: readonly string[]): string[] {
  return Object.values(schema)
    .filter((property) => types.includes(property.type))
    .map((property) => property.name)
}

/** Colunas que podem virar cartão: escolha, múltipla escolha, status ou ligação. */
export function listGroupableProperties(schema: Record<string, NotionSchemaProperty>): string[] {
  return propertiesOfType(schema, GROUPABLE_TYPES)
}

export function listRelationProperties(schema: Record<string, NotionSchemaProperty>): string[] {
  return propertiesOfType(schema, ['relation'])
}

/** Colunas da database de detalhes que podem virar etiqueta no cartão. */
export function listTagCandidates(detailsSchema: Record<string, NotionSchemaProperty>): string[] {
  return propertiesOfType(detailsSchema, TAG_TYPES)
}

export function resolveGroupBy(schema: Record<string, NotionSchemaProperty>, settings: RepoBoardSettings): string {
  const candidates = listGroupableProperties(schema)
  if (settings.groupBy && candidates.includes(settings.groupBy)) return settings.groupBy
  return candidates.find((name) => REPOSITORY_NAME.test(name)) || candidates.find((name) => PROJECT_NAME.test(name)) || ''
}

/**
 * Ligação que aponta a database de detalhes. Agrupando por uma ligação, é ela
 * mesma: o nome do cartão só existe na página ligada.
 */
export function resolveDetailsVia(
  schema: Record<string, NotionSchemaProperty>,
  settings: RepoBoardSettings,
  groupBy: string,
): string {
  const relations = listRelationProperties(schema)
  if (relations.includes(groupBy)) return groupBy
  if (settings.detailsVia === '') return ''
  if (settings.detailsVia && relations.includes(settings.detailsVia)) return settings.detailsVia
  return relations.find((name) => PROJECT_NAME.test(name) || REPOSITORY_NAME.test(name)) || ''
}

/** Alvo de uma coluna de ligação, como a API de data sources descreve (`data_source_id`, com `database_id` de reserva). */
export function relationTarget(
  schema: Record<string, NotionSchemaProperty>,
  name: string,
): { dataSourceId: string | null; databaseId: string | null } | null {
  const property = schema[name]
  if (!property || property.type !== 'relation') return null
  const config = property.relation
  if (!config || typeof config !== 'object') return null
  const record = config as Record<string, unknown>
  const dataSourceId = typeof record.data_source_id === 'string' && record.data_source_id ? record.data_source_id : null
  const databaseId = typeof record.database_id === 'string' && record.database_id ? record.database_id : null
  return dataSourceId || databaseId ? { dataSourceId, databaseId } : null
}

export function resolveTagProperties(
  detailsSchema: Record<string, NotionSchemaProperty>,
  settings: RepoBoardSettings,
): string[] {
  const candidates = listTagCandidates(detailsSchema)
  if (settings.tagProperties) return settings.tagProperties.filter((name) => candidates.includes(name))
  return candidates.filter((name) => TAG_NAME.test(name))
}

/** Nome comparável: sem acento, minúsculo, e `-`, `_`, espaço e ponto equivalentes. */
function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replace(/[\s_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function lastSegment(value: string): string {
  const parts = value.split('/').filter(Boolean)
  return parts.at(-1) || ''
}

function urlLastSegment(value: string): string {
  try {
    return lastSegment(new URL(value).pathname)
  } catch {
    return ''
  }
}

function stringValues(value: unknown): string[] {
  if (typeof value === 'string') return value ? [value] : []
  if (Array.isArray(value)) return value.flatMap(stringValues)
  return []
}

/** Chaves de grupo de uma tarefa: o valor da escolha, cada valor da múltipla escolha ou cada página ligada. */
function groupKeysOf(task: NotionTask, groupBy: string): string[] {
  const keys = [...new Set(stringValues(task.fields?.[groupBy]))]
  return keys.length > 0 ? keys : [NO_GROUP_KEY]
}

function pickLinkProperty(detailsSchema: Record<string, NotionSchemaProperty>): string | null {
  const urls = propertiesOfType(detailsSchema, ['url'])
  return urls.find((name) => LINK_NAME.test(name)) || urls.find((name) => name.toLocaleLowerCase() === 'url') || urls[0] || null
}

function pickCheckbox(detailsSchema: Record<string, NotionSchemaProperty>, pattern: RegExp): string | null {
  return propertiesOfType(detailsSchema, ['checkbox']).find((name) => pattern.test(name)) || null
}

type DetailsReader = {
  byId: Map<string, NotionTask>
  linkOf: (row: NotionTask) => string | null
  isArchived: (row: NotionTask) => boolean
  isFork: (row: NotionTask) => boolean
  tagsOf: (row: NotionTask) => string[]
  /** Linhas por nome comparável: o trecho depois de `dono/` no título e o fim do caminho do link. */
  rowsByName: Map<string, NotionTask[]>
}

function createDetailsReader(details: RepoBoardDetails, tagProperties: string[]): DetailsReader {
  const linkProperty = pickLinkProperty(details.schema)
  const archivedProperty = pickCheckbox(details.schema, ARCHIVED_NAME)
  const forkProperty = pickCheckbox(details.schema, FORK_NAME)
  const linkOf = (row: NotionTask) => {
    const value = linkProperty ? row.fields?.[linkProperty] : null
    return typeof value === 'string' && value ? value : null
  }
  const isArchived = (row: NotionTask) => Boolean(archivedProperty && row.fields?.[archivedProperty] === true)
  const rowsByName = new Map<string, NotionTask[]>()
  for (const row of details.rows) {
    const link = linkOf(row)
    const names = new Set([lastSegment(row.title), link ? urlLastSegment(link) : ''].filter(Boolean).map(normalizeName))
    for (const name of names) {
      const list = rowsByName.get(name)
      if (list) list.push(row)
      else rowsByName.set(name, [row])
    }
  }
  return {
    byId: new Map(details.rows.map((row) => [row.id, row])),
    linkOf,
    isArchived,
    isFork: (row) => Boolean(forkProperty && row.fields?.[forkProperty] === true),
    tagsOf: (row) => {
      const tags = tagProperties.flatMap((name) => stringValues(row.fields?.[name]))
      return isArchived(row) ? [...tags, 'Arquivado'] : tags
    },
    rowsByName,
  }
}

/**
 * Linha de detalhes de um grupo que não é ligação: casa pelo nome. Com mais de
 * um candidato (o mesmo repositório em duas contas), vence o mais ligado pelas
 * tarefas do grupo, depois o que não é fork, depois o título.
 */
function matchDetailsRow(
  label: string,
  groupTasks: NotionTask[],
  detailsVia: string,
  reader: DetailsReader,
): NotionTask | null {
  const candidates = reader.rowsByName.get(normalizeName(label)) || []
  if (candidates.length <= 1) return candidates[0] || null
  const evidence = (row: NotionTask) =>
    detailsVia ? groupTasks.filter((task) => stringValues(task.fields?.[detailsVia]).includes(row.id)).length : 0
  return [...candidates].sort(
    (left, right) =>
      evidence(right) - evidence(left) ||
      Number(reader.isFork(left)) - Number(reader.isFork(right)) ||
      collator.compare(left.title, right.title),
  )[0]
}

/**
 * Percentual feito do cartão. Multiplica antes de dividir: `(done / total) * 100`
 * dá 57,4999… para 253/440 e o meio arredondava para baixo, enquanto 1/8 subia.
 * 100% fica só para "tudo feito" e 0% só para "nada feito" — "100% · 1 aberta"
 * se desmentiria na mesma linha.
 */
export function progressPercent(done: number, total: number): number {
  if (total <= 0) return 0
  const percent = Math.round((done * 100) / total)
  if (done >= total) return 100
  if (done <= 0) return 0
  return Math.min(99, Math.max(1, percent))
}

function card(key: string, label: string, groupTasks: NotionTask[], row: NotionTask | null, reader: DetailsReader | null): RepoCard {
  const done = groupTasks.filter((task) => task.completed).length
  const total = groupTasks.length
  return {
    key,
    label,
    total,
    open: total - done,
    done,
    percent: progressPercent(done, total),
    tags: row && reader ? reader.tagsOf(row) : [],
    link: row && reader ? reader.linkOf(row) : null,
    archived: Boolean(row && reader?.isArchived(row)),
    clickable: total > 0,
  }
}

/** Monta os cartões: os com tarefas (mais abertas primeiro), os sem tarefas pedidos e "Sem <coluna>" no fim. */
export function buildRepoCards(input: BuildRepoCardsInput): RepoCard[] {
  const { tasks, schema, groupBy, detailsVia, details, tagProperties, showEmpty, search } = input
  if (!groupBy || !schema[groupBy]) return []
  const groupIsRelation = schema[groupBy].type === 'relation'
  const reader = details ? createDetailsReader(details, tagProperties) : null

  const groups = new Map<string, NotionTask[]>()
  for (const task of tasks) {
    for (const key of groupKeysOf(task, groupBy)) {
      const list = groups.get(key)
      if (list) list.push(task)
      else groups.set(key, [task])
    }
  }

  const matchedRowIds = new Set<string>()
  const taskCards: RepoCard[] = []
  let noGroupCard: RepoCard | null = null
  for (const [key, groupTasks] of groups) {
    if (key === NO_GROUP_KEY) {
      noGroupCard = card(key, `Sem ${groupBy}`, groupTasks, null, null)
      continue
    }
    const row = groupIsRelation
      ? reader?.byId.get(key) || null
      : reader ? matchDetailsRow(key, groupTasks, detailsVia, reader) : null
    if (row) matchedRowIds.add(row.id)
    // Sem a linha (detalhes fora do ar ou página fora da database), um trecho do ID distingue um cartão do outro.
    const label = groupIsRelation ? row?.title || `Página ligada ${key.replace(/-/g, '').slice(0, 8)}` : key
    taskCards.push(card(key, label, groupTasks, row, reader))
  }

  taskCards.sort(
    (left, right) => right.open - left.open || right.total - left.total || collator.compare(left.label, right.label),
  )

  const emptyCards: RepoCard[] =
    showEmpty && details && reader
      ? details.rows
          .filter((row) => !matchedRowIds.has(row.id) && !reader.isArchived(row) && !reader.isFork(row))
          .map((row) => card(`detalhe:${row.id}`, groupIsRelation ? row.title : lastSegment(row.title) || row.title, [], row, reader))
          .sort((left, right) => collator.compare(left.label, right.label))
      : []

  return filterRepoCards([...taskCards, ...emptyCards, ...(noGroupCard ? [noGroupCard] : [])], search)
}

/** Busca do Painel: pelo nome do cartão, sem acento e sem diferença de maiúscula. Barata — a tela a aplica fora do memo do placar. */
export function filterRepoCards(cards: RepoCard[], search: string): RepoCard[] {
  const needle = normalizeName(search)
  return needle ? cards.filter((item) => normalizeName(item.label).includes(needle)) : cards
}

/** Tarefas do cartão clicado; `NO_GROUP_KEY` traz as que estão sem a coluna preenchida. */
export function filterTasksByGroup(
  tasks: NotionTask[],
  schema: Record<string, NotionSchemaProperty>,
  filter: RepoGroupFilter | null,
): NotionTask[] {
  if (!filter || !schema[filter.property]) return tasks
  return tasks.filter((task) => groupKeysOf(task, filter.property).includes(filter.key))
}
