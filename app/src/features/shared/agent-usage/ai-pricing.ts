/** Valor no preço oficial quando ele é em yuan; o resto da tabela já vem convertido para dólar. */
export type OriginalPrice = {
  currency: 'CNY'
  input?: number | null
  output?: number | null
  cacheRead?: number | null
  cacheWrite5m?: number | null
  cacheWrite1h?: number | null
  monthly?: number | null
}

/** Preço de um modelo por API, em US$ por milhão de tokens; `null` é "sem preço", nunca zero. */
export type AiModelPrice = {
  id: string
  provider: string
  name: string
  input: number | null
  output: number | null
  cacheRead: number | null
  cacheWrite5m: number | null
  cacheWrite1h: number | null
  original?: OriginalPrice
  note?: string
  source: string
  asOf: string
}

export type AiSubscriptionPrice = {
  id: string
  provider: string
  name: string
  monthlyUsd: number | null
  /** `uso`: pré-pago, sem mensalidade (OpenRouter, OpenCode Zen, só API). */
  unit: 'mês' | 'usuário/mês' | 'uso'
  /** Plano de código (agente de programação) que entra na comparação com o seu uso. */
  codingPlan?: boolean
  /** Ids de modelo da tabela a que o plano dá acesso. */
  models: string[]
  original?: OriginalPrice
  note?: string
  source: string
  asOf: string
}

export type AiPricingTable = {
  asOf: string
  currency: 'USD'
  models: AiModelPrice[]
  subscriptions: AiSubscriptionPrice[]
}

/** Real e yuan por dólar. `origin`: ao vivo, a última ao vivo salva, ou a de reserva da tabela. */
export type ExchangeRate = {
  brlPerUsd: number
  cnyPerUsd: number
  date: string
  source: string
  origin: 'ao vivo' | 'cache' | 'reserva'
}

export type AiPricingResult =
  | {
      ok: true
      /** `null` só se a tabela embutida e a online falharem. */
      table: AiPricingTable | null
      origin: 'online' | 'reserva'
      onlineError: string | null
      rate: ExchangeRate | null
      openRouter: { origin: 'online' | 'reserva'; count: number; error: string | null } | null
      fetchedAt: string
    }
  | { ok: false; message: string }

export type ProviderRegion = 'EUA' | 'China' | 'Agregadores e ferramentas'

export const PROVIDERS: Record<string, { label: string; region: ProviderRegion }> = {
  anthropic: { label: 'Anthropic (Claude)', region: 'EUA' },
  openai: { label: 'OpenAI (ChatGPT/Codex)', region: 'EUA' },
  google: { label: 'Google (Gemini/Antigravity)', region: 'EUA' },
  github: { label: 'GitHub Copilot', region: 'EUA' },
  cursor: { label: 'Cursor', region: 'EUA' },
  deepseek: { label: 'DeepSeek', region: 'China' },
  alibaba: { label: 'Alibaba (Qwen/Model Studio)', region: 'China' },
  moonshot: { label: 'Moonshot (Kimi)', region: 'China' },
  zhipu: { label: 'Zhipu / Z.ai (GLM)', region: 'China' },
  minimax: { label: 'MiniMax', region: 'China' },
  bytedance: { label: 'ByteDance (Seed/Doubao/Trae)', region: 'China' },
  baidu: { label: 'Baidu (ERNIE)', region: 'China' },
  tencent: { label: 'Tencent (Hy/Hunyuan)', region: 'China' },
  stepfun: { label: 'StepFun (Step)', region: 'China' },
  iflytek: { label: 'iFlytek (Spark)', region: 'China' },
  '01ai': { label: '01.AI (Yi)', region: 'China' },
  openrouter: { label: 'OpenRouter', region: 'Agregadores e ferramentas' },
  opencode: { label: 'OpenCode (Zen/Go)', region: 'Agregadores e ferramentas' },
  openclaw: { label: 'OpenClaw', region: 'Agregadores e ferramentas' },
}

export const REGIONS: readonly ProviderRegion[] = ['EUA', 'China', 'Agregadores e ferramentas']

export function providerLabel(provider: string) {
  return PROVIDERS[provider]?.label ?? provider
}

export function providerRegion(provider: string): ProviderRegion {
  return PROVIDERS[provider]?.region ?? 'Agregadores e ferramentas'
}

export type PricingFilter = { query: string; region: ProviderRegion | ''; provider: string }

/** Filtra por região, fornecedor e texto (nome, id, fornecedor ou nota), sem diferenciar acento nem caixa. */
export function filterPricing<T extends { id: string; name: string; provider: string; note?: string }>(items: readonly T[], filter: PricingFilter): T[] {
  const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const words = fold(filter.query).split(/\s+/).filter(Boolean)
  return items.filter((item) => {
    if (filter.provider && item.provider !== filter.provider) return false
    if (filter.region && providerRegion(item.provider) !== filter.region) return false
    const haystack = fold(`${item.name} ${item.id} ${providerLabel(item.provider)} ${item.note ?? ''}`)
    return words.every((word) => haystack.includes(word))
  })
}

/** Agrupa por fornecedor, na ordem em que cada um aparece. */
export function groupByProvider<T extends { provider: string }>(items: readonly T[]): Array<[string, T[]]> {
  const groups = new Map<string, T[]>()
  for (const item of items) groups.set(item.provider, [...(groups.get(item.provider) ?? []), item])
  return [...groups]
}

// Casas extras só para centavos fracionados (US$ 0,125); valor de 1 para cima fica com duas.
const number = (value: number, digits: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: Math.abs(value) < 1 ? digits : 2 })

/** "US$ 4,00"; "sem preço" quando não há valor. */
export function formatUsd(usd: number | null, digits = 2): string {
  return usd === null ? 'sem preço' : `US$ ${number(usd, digits)}`
}

/** "R$ 23,13"; `null` sem valor ou sem cotação. */
export function formatBrl(usd: number | null, rate: Pick<ExchangeRate, 'brlPerUsd'> | null, digits = 2): string | null {
  return usd === null || !rate ? null : `R$ ${number(usd * rate.brlPerUsd, digits)}`
}

/** "¥ 6,00"; "sem preço" quando não há valor. */
export function formatCny(cny: number | null | undefined, digits = 2): string {
  return cny === null || cny === undefined ? 'sem preço' : `¥ ${number(cny, digits)}`
}

/** "US$ 4,00 (R$ 23,13)"; "sem preço" quando não há valor. */
export function formatUsdBrl(usd: number | null, rate: Pick<ExchangeRate, 'brlPerUsd'> | null, digits = 2): string {
  const brl = formatBrl(usd, rate, digits)
  return brl ? `${formatUsd(usd, digits)} (${brl})` : formatUsd(usd, digits)
}

const RATE_ORIGIN_LABELS: Record<ExchangeRate['origin'], string> = {
  'ao vivo': 'cotação ao vivo',
  cache: 'última cotação ao vivo salva',
  reserva: 'cotação de reserva da tabela',
}

/** "US$ 1 = R$ 5,7821 e ¥ 6,6661 (cotação ao vivo, Frankfurter, 2026-11-17)". */
export function describeRate(rate: ExchangeRate): string {
  const value = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
  return `US$ 1 = R$ ${value(rate.brlPerUsd)} e ¥ ${value(rate.cnyPerUsd)} (${RATE_ORIGIN_LABELS[rate.origin]}, ${rate.source}, ${rate.date})`
}

/** Para cada modelo, os nomes das assinaturas que dão acesso a ele. */
export function subscriptionsByModel(subscriptions: readonly AiSubscriptionPrice[]): Map<string, string[]> {
  const byModel = new Map<string, string[]>()
  for (const subscription of subscriptions) {
    for (const id of subscription.models) byModel.set(id, [...(byModel.get(id) ?? []), subscription.name])
  }
  return byModel
}

export type SubscriptionComparison = {
  subscription: AiSubscriptionPrice
  /** Quanto o mesmo uso custaria em API menos o preço do plano; positivo = o plano sai mais barato. */
  savingUsd: number | null
  verdict: 'assinatura' | 'api' | 'sem preço'
}

/**
 * Compara o custo do uso em API num mês com o preço de cada plano individual escolhido por `include`.
 * Planos por usuário, pré-pagos e gratuitos ficam de fora: não se comparam com o uso de uma pessoa.
 */
export function compareWithSubscriptions(
  apiMonthlyUsd: number,
  subscriptions: readonly AiSubscriptionPrice[],
  include: (subscription: AiSubscriptionPrice) => boolean,
): SubscriptionComparison[] {
  return subscriptions
    .filter((item) => include(item) && item.unit === 'mês' && item.monthlyUsd !== 0)
    .map((subscription) => {
      if (subscription.monthlyUsd === null) return { subscription, savingUsd: null, verdict: 'sem preço' as const }
      const savingUsd = apiMonthlyUsd - subscription.monthlyUsd
      return { subscription, savingUsd, verdict: savingUsd > 0 ? ('assinatura' as const) : ('api' as const) }
    })
}
