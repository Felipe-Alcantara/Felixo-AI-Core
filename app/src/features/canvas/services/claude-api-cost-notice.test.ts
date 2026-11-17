import { describe, expect, it } from 'vitest'
import { createClaudeApiCostNotice } from './claude-api-cost-notice'
import { COST_CONSENT_STORAGE_KEY, createCostConsent } from './usage-cost-consent'
import { formatUsd } from './claude-api-conversation'

function setup(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
  return { data, notice: createClaudeApiCostNotice(createCostConsent(() => storage)), storage }
}

describe('aviso de custo do bloco Claude API', () => {
  it('avisa na primeira abertura de cada conta', () => {
    const { notice } = setup()
    expect(notice.needed('no1', 'conta-a')).toBe(true)
    expect(notice.needed('no1', 'conta-b')).toBe(true)
  })

  it('ler o aviso vale enquanto o bloco está aberto, sem perguntar de novo por mensagem', () => {
    const { notice } = setup()
    notice.acknowledge('no1', 'conta-a', false)
    expect(notice.needed('no1', 'conta-a')).toBe(false)
    expect(notice.needed('no2', 'conta-a')).toBe(true)
  })

  it('"não perguntar de novo" fica gravado e vale por conta, em qualquer bloco, depois de reabrir', () => {
    const { notice, data, storage } = setup()
    notice.acknowledge('no1', 'conta-a', true)
    expect(data.get(COST_CONSENT_STORAGE_KEY)).toContain('claude-api:conta-a')
    const reaberto = createClaudeApiCostNotice(createCostConsent(() => storage))
    expect(reaberto.needed('no9', 'conta-a')).toBe(false)
    expect(reaberto.needed('no9', 'conta-b')).toBe(true)
  })

  it('o gasto da conversa aparece sempre, mesmo zerado', () => {
    expect(formatUsd(0)).toBe('US$ 0,00')
    expect(formatUsd(0.0042)).toBe('US$ 0,0042')
  })
})
