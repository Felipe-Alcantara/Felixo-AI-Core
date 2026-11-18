import { describe, expect, it } from 'vitest'
import { formatCostUsd, groupClaudeCost, type ClaudeCostRow } from './claude-cost'

const row = (extra: Partial<ClaudeCostRow>): ClaudeCostRow => ({
  day: '2026-03-02', project: 'a', model: 'm1', messages: 1,
  input: 10, output: 5, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, costUsd: 1, ...extra,
})

describe('groupClaudeCost', () => {
  const rows = [row({}), row({ model: 'm2', costUsd: null }), row({ project: 'b', day: '2026-03-03', costUsd: 5 })]

  it('soma por projeto, maior custo primeiro, e marca o custo parcial', () => {
    const groups = groupClaudeCost(rows, 'project')
    expect(groups.map((g) => [g.key, g.costUsd, g.partial, g.tokens])).toEqual([
      ['b', 5, false, 15],
      ['a', 1, true, 30],
    ])
  })

  it('por dia, o mais recente primeiro; sem nenhum preço o custo é nulo', () => {
    expect(groupClaudeCost(rows, 'day').map((g) => g.key)).toEqual(['2026-03-03', '2026-03-02'])
    expect(groupClaudeCost([row({ costUsd: null })], 'model')[0].costUsd).toBeNull()
  })
})

describe('formatCostUsd', () => {
  it('formata em dólar e avisa quando falta preço', () => {
    expect(formatCostUsd(1744.06)).toBe('US$ 1.744,06')
    expect(formatCostUsd(null)).toBe('sem preço')
  })
})
