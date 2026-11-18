import { describe, expect, it } from 'vitest'
import {
  compareWithSubscriptions,
  describeRate,
  filterPricing,
  formatBrl,
  formatCny,
  formatUsdBrl,
  groupByProvider,
  subscriptionsByModel,
  type AiSubscriptionPrice,
} from './ai-pricing'

const plan = (id: string, monthlyUsd: number | null, extra: Partial<AiSubscriptionPrice> = {}): AiSubscriptionPrice => ({
  id,
  provider: 'anthropic',
  name: id,
  monthlyUsd,
  unit: 'mês',
  models: [],
  source: 'https://exemplo.com',
  asOf: '2026-11-18',
  ...extra,
})

describe('ai-pricing', () => {
  it('mostra dólar e real, só dólar sem cotação e "sem preço" sem valor', () => {
    const rate = { brlPerUsd: 5.5, cnyPerUsd: 7, date: '2026-11-17', source: 'x', origin: 'ao vivo' as const }
    expect(formatUsdBrl(4, rate)).toBe('US$ 4,00 (R$ 22,00)')
    expect(formatBrl(4, null)).toBeNull()
    expect(formatUsdBrl(4, null)).toBe('US$ 4,00')
    expect(formatUsdBrl(null, rate)).toBe('sem preço')
    expect(formatUsdBrl(0, null)).toBe('US$ 0,00')
    expect(formatUsdBrl(0.125, rate, 3)).toBe('US$ 0,125 (R$ 0,688)')
    expect(formatUsdBrl(8, rate, 3)).toBe('US$ 8,00 (R$ 44,00)')
    expect(formatCny(6)).toBe('¥ 6,00')
    expect(formatCny(null)).toBe('sem preço')
  })

  it('diz de qual cotação veio e a data dela', () => {
    const rate = { brlPerUsd: 5.7821, cnyPerUsd: 6.6661, date: '2026-11-17', source: 'Frankfurter', origin: 'ao vivo' as const }
    expect(describeRate(rate)).toBe('US$ 1 = R$ 5,7821 e ¥ 6,6661 (cotação ao vivo, Frankfurter, 2026-11-17)')
    expect(describeRate({ ...rate, origin: 'cache' })).toContain('última cotação ao vivo salva')
    expect(describeRate({ ...rate, origin: 'reserva' })).toContain('cotação de reserva da tabela')
  })

  it('filtra por região, fornecedor e texto sem acento, e agrupa por fornecedor', () => {
    const items = [
      plan('glm-coding-lite', 18, { provider: 'zhipu', name: 'GLM Coding Plan Lite' }),
      plan('kimi-plus', 19, { provider: 'moonshot', name: 'Kimi Plus', note: 'Inclui código' }),
      plan('claude-pro', 20),
    ]
    const all = { query: '', region: '' as const, provider: '' }
    expect(filterPricing(items, { ...all, region: 'China' }).map((i) => i.id)).toEqual(['glm-coding-lite', 'kimi-plus'])
    expect(filterPricing(items, { ...all, provider: 'anthropic' }).map((i) => i.id)).toEqual(['claude-pro'])
    expect(filterPricing(items, { ...all, query: 'CODIGO' }).map((i) => i.id)).toEqual(['kimi-plus'])
    expect(filterPricing(items, { ...all, query: 'moonshot plus' }).map((i) => i.id)).toEqual(['kimi-plus'])
    expect(groupByProvider(items).map(([provider, list]) => [provider, list.length])).toEqual([
      ['zhipu', 1],
      ['moonshot', 1],
      ['anthropic', 1],
    ])
  })

  it('inverte a lista: que assinaturas dão acesso a cada modelo', () => {
    const map = subscriptionsByModel([plan('Pro', 20, { models: ['opus'] }), plan('Max', 100, { models: ['opus', 'fable'] })])
    expect(map.get('opus')).toEqual(['Pro', 'Max'])
    expect(map.get('fable')).toEqual(['Max'])
  })

  it('compara o uso em API com cada plano individual do fornecedor', () => {
    const plans = [
      plan('free', 0),
      plan('pro', 20),
      plan('max', 100),
      plan('enterprise', null),
      plan('team', 25, { unit: 'usuário/mês' }),
      plan('plus', 20, { provider: 'openai' }),
      plan('openrouter', null, { unit: 'uso' }),
    ]
    const rows = compareWithSubscriptions(60, plans, (item) => item.provider === 'anthropic')
    expect(rows.map((row) => [row.subscription.id, row.savingUsd, row.verdict])).toEqual([
      ['pro', 40, 'assinatura'],
      ['max', -40, 'api'],
      ['enterprise', null, 'sem preço'],
    ])
  })
})
