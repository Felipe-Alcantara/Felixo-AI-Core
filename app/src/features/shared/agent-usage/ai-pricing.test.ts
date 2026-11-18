import { describe, expect, it } from 'vitest'
import { compareWithSubscriptions, formatBrl, formatUsdBrl, subscriptionsByModel, type AiSubscriptionPrice } from './ai-pricing'

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
    const rate = { brlPerUsd: 5.5, date: '2026-11-17', source: 'x' }
    expect(formatUsdBrl(4, rate)).toBe('US$ 4,00 (R$ 22,00)')
    expect(formatBrl(4, null)).toBeNull()
    expect(formatUsdBrl(4, null)).toBe('US$ 4,00')
    expect(formatUsdBrl(null, rate)).toBe('sem preço')
    expect(formatUsdBrl(0, null)).toBe('US$ 0,00')
    expect(formatUsdBrl(0.125, rate, 3)).toBe('US$ 0,125 (R$ 0,688)')
    expect(formatUsdBrl(8, rate, 3)).toBe('US$ 8,00 (R$ 44,00)')
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
    ]
    const rows = compareWithSubscriptions(60, plans, 'anthropic')
    expect(rows.map((row) => [row.subscription.id, row.savingUsd, row.verdict])).toEqual([
      ['pro', 40, 'assinatura'],
      ['max', -40, 'api'],
      ['enterprise', null, 'sem preço'],
    ])
  })
})
