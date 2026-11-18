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
  note?: string
  source: string
  asOf: string
}

export type AiSubscriptionPrice = {
  id: string
  provider: string
  name: string
  monthlyUsd: number | null
  unit: 'mês' | 'usuário/mês'
  /** Ids de modelo da tabela a que o plano dá acesso. */
  models: string[]
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

export type UsdBrlRate = { brlPerUsd: number; date: string; source: string }

export type AiPricingResult =
  | {
      ok: true
      /** `null` só se a tabela embutida e a online falharem. */
      table: AiPricingTable | null
      origin: 'online' | 'reserva'
      onlineError: string | null
      rate: UsdBrlRate | null
      fetchedAt: string
    }
  | { ok: false; message: string }

export const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (ChatGPT/Codex)',
  google: 'Google (Gemini/Antigravity)',
  github: 'GitHub Copilot',
  cursor: 'Cursor',
}

// Casas extras só para centavos fracionados (US$ 0,125); valor de 1 para cima fica com duas.
const number = (value: number, digits: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: Math.abs(value) < 1 ? digits : 2 })

/** "US$ 4,00"; "sem preço" quando não há valor. */
export function formatUsd(usd: number | null, digits = 2): string {
  return usd === null ? 'sem preço' : `US$ ${number(usd, digits)}`
}

/** "R$ 23,13"; `null` sem valor ou sem cotação (aí a tela mostra só o dólar). */
export function formatBrl(usd: number | null, rate: UsdBrlRate | null, digits = 2): string | null {
  return usd === null || !rate ? null : `R$ ${number(usd * rate.brlPerUsd, digits)}`
}

/** "US$ 4,00 (R$ 23,13)"; só dólar sem cotação; "sem preço" quando não há valor. */
export function formatUsdBrl(usd: number | null, rate: UsdBrlRate | null, digits = 2): string {
  const brl = formatBrl(usd, rate, digits)
  return brl ? `${formatUsd(usd, digits)} (${brl})` : formatUsd(usd, digits)
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
 * Compara o custo do uso em API num mês com o preço de cada plano individual de um fornecedor.
 * Planos por usuário e gratuitos ficam de fora: não se comparam com o uso de uma pessoa.
 */
export function compareWithSubscriptions(
  apiMonthlyUsd: number,
  subscriptions: readonly AiSubscriptionPrice[],
  provider: string,
): SubscriptionComparison[] {
  return subscriptions
    .filter((item) => item.provider === provider && item.unit === 'mês' && item.monthlyUsd !== 0)
    .map((subscription) => {
      if (subscription.monthlyUsd === null) return { subscription, savingUsd: null, verdict: 'sem preço' as const }
      const savingUsd = apiMonthlyUsd - subscription.monthlyUsd
      return { subscription, savingUsd, verdict: savingUsd > 0 ? ('assinatura' as const) : ('api' as const) }
    })
}
