/** Uma linha do histórico de custo do Claude: um dia, um projeto, um modelo. */
export type ClaudeCostRow = {
  day: string
  project: string
  model: string
  messages: number
  input: number
  output: number
  cacheRead: number
  cacheWrite5m: number
  cacheWrite1h: number
  /** `null` quando o modelo não tem preço no arquivo de preços. */
  costUsd: number | null
}

export type ClaudeCostHistoryResult =
  | {
      ok: true
      rows: ClaudeCostRow[]
      unpricedModels: string[]
      pricing: { source: string; asOf: string; currency: 'USD' } | null
      filesRead: number
      truncated: boolean
    }
  | { ok: false; message: string }

export type ClaudeCostGroup = {
  key: string
  messages: number
  tokens: number
  /** Soma só dos modelos com preço; `null` se nenhum tem. */
  costUsd: number | null
  /** Alguma linha do grupo ficou sem preço: o custo é parcial. */
  partial: boolean
}

export type ClaudeCostDimension = 'day' | 'project' | 'model'

/** Agrupa por dia, projeto ou modelo; o maior custo (depois o maior volume de tokens) primeiro. */
export function groupClaudeCost(rows: readonly ClaudeCostRow[], by: ClaudeCostDimension): ClaudeCostGroup[] {
  const groups = new Map<string, ClaudeCostGroup>()
  for (const row of rows) {
    const key = row[by]
    const group = groups.get(key) ?? { key, messages: 0, tokens: 0, costUsd: null, partial: false }
    group.messages += row.messages
    group.tokens += row.input + row.output + row.cacheRead + row.cacheWrite5m + row.cacheWrite1h
    if (row.costUsd === null) group.partial = true
    else group.costUsd = (group.costUsd ?? 0) + row.costUsd
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) =>
    by === 'day' ? b.key.localeCompare(a.key) : (b.costUsd ?? 0) - (a.costUsd ?? 0) || b.tokens - a.tokens,
  )
}

export function formatCostUsd(value: number | null): string {
  if (value === null) return 'sem preço'
  return `US$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
