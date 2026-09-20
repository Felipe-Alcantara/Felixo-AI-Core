import type { NotionSchemaProperty } from '../../shared/types/notion'

// Apresentação genérica de uma database do Notion no painel: texto de cada
// célula POR TIPO de propriedade, "não suportado" explícito (nunca vazio para o
// que existe e não sabemos mostrar), colunas padrão quando a database não tem
// papéis de tarefa e a paginação local das linhas. Tudo puro, para ter teste.

export const UNSUPPORTED_LABEL = 'não suportado'

/** Tipos cujo valor a API de consulta não entrega de forma legível. */
const UNSUPPORTED_TYPES = new Set(['button', 'verification', 'place'])

/** Tipos que o backend (`readPropertyValue`) já entrega como texto/lista/número. */
const READABLE_TYPES = new Set([
  'title', 'rich_text', 'select', 'status', 'multi_select', 'checkbox', 'date', 'number',
  'url', 'email', 'phone_number', 'formula', 'people', 'files', 'relation', 'unique_id',
  'created_time', 'last_edited_time', 'created_by', 'last_edited_by', 'rollup',
])

export function isUnsupportedType(type: string | undefined): boolean {
  return Boolean(type) && (UNSUPPORTED_TYPES.has(type as string) || !READABLE_TYPES.has(type as string))
}

function formatLoose(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((item) => formatLoose(item)).filter(Boolean).join(', ')
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['name', 'plain_text', 'title', 'content', 'start', 'url', 'id']) {
      const candidate = record[key]
      if (typeof candidate === 'string' && candidate) return candidate
    }
    return Object.values(record).map((item) => formatLoose(item)).filter(Boolean).join(', ')
  }
  return String(value)
}

/**
 * Texto da célula. Com `type`, decide pelo tipo: relação vira contagem (o título
 * de cada página relacionada custaria uma consulta por linha), tipo sem valor
 * legível vira "não suportado (tipo)". Sem `type` (ordenação, chamadas antigas)
 * cai no formato solto de sempre.
 */
export function formatPropertyValue(value: unknown, type?: string): string {
  if (type && isUnsupportedType(type)) return `${UNSUPPORTED_LABEL} (${type})`
  if (type === 'relation' && Array.isArray(value)) {
    return value.length === 0 ? '' : `${value.length} ${value.length === 1 ? 'relação' : 'relações'}`
  }
  return formatLoose(value)
}

/**
 * A database tem propriedades que dão papel de tarefa (estado, prazo, caixa de
 * marcar)? Sem nenhuma delas, as colunas fixas Estado/Prioridade/Prazo e o botão
 * de concluir só mostrariam "—": a tabela vira genérica, com todas as colunas.
 */
export function hasTaskRoles(schema: Record<string, NotionSchemaProperty>): boolean {
  return Object.values(schema).some((property) =>
    ['status', 'select', 'date', 'checkbox'].includes(property.type),
  )
}

/** Colunas extras quando a pessoa ainda não escolheu nenhuma: todas, se genérica; nenhuma, se de tarefas. */
export function defaultVisibleColumns(schema: Record<string, NotionSchemaProperty>): string[] {
  if (hasTaskRoles(schema)) return []
  return Object.values(schema).filter((property) => property.type !== 'title').map((property) => property.name)
}

/** Linhas montadas de uma vez; o resto entra por "mostrar mais" (2.000 linhas × N colunas pesam no DOM). */
export const ROW_PAGE_SIZE = 200

export function nextRowLimit(current: number, total: number): number {
  return Math.min(total, Math.max(current, ROW_PAGE_SIZE) + ROW_PAGE_SIZE)
}
