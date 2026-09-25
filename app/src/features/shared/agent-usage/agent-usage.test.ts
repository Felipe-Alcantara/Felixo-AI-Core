import { describe, expect, it } from 'vitest'
import {
  AGENT_USAGE_STALE_AFTER_MS,
  agentUsagePercent,
  deriveDisplayStatus,
  formatAgentUsageMetric,
  formatAgentUsageNumber,
  formatAgentUsageReset,
  formatAgentUsageResetCreditStatus,
  formatAgentUsageResetCreditType,
  formatAgentUsageSource,
  getAccountStatus,
  getAgentUsageMeasuredAt,
  getAgentUsagePlan,
  getAgentUsageResetCredits,
  groupAgentUsageAccounts,
  summarizeAgentUsage,
} from './agent-usage'
import type {
  AgentUsageAccount,
  AgentUsageMetric,
  AgentUsageProvider,
  AgentUsageSample,
} from './agent-usage'

function sample(
  status: AgentUsageSample['status'],
  metrics: AgentUsageSample['metrics'] = [],
): AgentUsageSample {
  return {
    id: `sample-${status}`,
    accountId: 'account-1',
    status,
    sourceKind: 'assisted-event',
    sourceLabel: 'Fonte oficial de teste',
    sourceCommand: null,
    sourceUrl: 'https://example.com/docs',
    collectedAt: '2026-08-28T12:00:00.000Z',
    metrics,
    observedIdentityKey: null,
    observedIdentityDisplay: null,
    errorMessage: null,
    metadata: {},
  }
}

function account(
  id: string,
  status: AgentUsageSample['status'] | null,
): AgentUsageAccount {
  const currentSample = status ? sample(status) : null
  return {
    id,
    providerId: 'codex',
    label: id,
    identityKey: null,
    identityDisplay: null,
    identitySource: null,
    createdAt: '2026-08-28T12:00:00.000Z',
    updatedAt: '2026-08-28T12:00:00.000Z',
    latestSample: currentSample,
    lastKnownSample: currentSample?.metrics.length ? currentSample : null,
  }
}

describe('agent usage presentation', () => {
  it('keeps zero distinct from an unknown number', () => {
    expect(formatAgentUsageNumber(0, '%')).toBe('0 %')
    expect(formatAgentUsageNumber(null, '%')).toBe('—')
    expect(
      formatAgentUsageMetric({
        key: 'window',
        label: 'Janela',
        used: 0,
        limit: 100,
        remaining: 100,
        unit: '%',
        precision: 'percentage',
        resetAt: null,
      }),
    ).toContain('Usado 0 %')
  })

  it('summarizes current, stale, unavailable and error independently', () => {
    const accounts = [
      account('current', 'current'),
      account('stale', 'stale'),
      account('unavailable', 'unavailable'),
      account('error', 'error'),
      account('empty', null),
    ]
    // As amostras nascem com `collectedAt` fixo (2026-08-28): sem fixar o
    // relógio aqui, `getAccountStatus`/`summarizeAgentUsage` reavaliariam
    // "current" contra o `Date.now()` real e o rebaixariam para "stale" só
    // por a fixture ser antiga — não é isso que este teste quer provar.
    const now = () => Date.parse('2026-08-28T12:05:00.000Z')

    expect(summarizeAgentUsage(accounts, now)).toEqual({
      current: 1,
      stale: 1,
      unavailable: 2,
      error: 1,
    })
    expect(getAccountStatus(accounts[4], now)).toBe('unavailable')
  })

  describe('deriveDisplayStatus', () => {
    it('rebaixa "current" para "stale" quando measuredAt já passou da janela de validade, mesmo sem nova rodada', () => {
      const medida = sample('current')
      medida.metadata = { measuredAt: '2026-08-28T12:00:00.000Z' }

      const logoDepois = () => Date.parse('2026-08-28T12:05:00.000Z')
      const bemDepois = () =>
        Date.parse('2026-08-28T12:00:00.000Z') + AGENT_USAGE_STALE_AFTER_MS + 1

      expect(deriveDisplayStatus(medida, logoDepois)).toBe('current')
      expect(deriveDisplayStatus(medida, bemDepois)).toBe('stale')
    })

    it('nunca promove "stale"/"unavailable"/"error" de volta para "current" só porque o relógio está perto', () => {
      for (const status of ['stale', 'unavailable', 'error'] as const) {
        const medida = sample(status)
        medida.metadata = { measuredAt: '2026-08-28T12:00:00.000Z' }
        expect(deriveDisplayStatus(medida, () => Date.parse('2026-08-28T12:00:01.000Z'))).toBe(
          status,
        )
      }
    })

    it('sem sample nenhum é "unavailable", sem lançar', () => {
      expect(deriveDisplayStatus(null)).toBe('unavailable')
      expect(deriveDisplayStatus(undefined)).toBe('unavailable')
    })

    it('measuredAt hostil/ausente não lança e mantém o status original', () => {
      const medida = sample('current')
      medida.metadata = { measuredAt: 'não é uma data' }
      expect(() => deriveDisplayStatus(medida, () => Date.now())).not.toThrow()
      expect(deriveDisplayStatus(medida, () => Date.now())).toBe('current')

      const semMetadata = sample('current')
      // Sem `measuredAt`, cai no `collectedAt` da amostra — mesma regra do
      // backend (`normalizeDashboardSample`, agent-usage-service.cjs).
      expect(
        deriveDisplayStatus(semMetadata, () => Date.parse('2026-08-28T12:05:00.000Z')),
      ).toBe('current')
      expect(
        deriveDisplayStatus(
          semMetadata,
          () => Date.parse('2026-08-28T12:00:00.000Z') + AGENT_USAGE_STALE_AFTER_MS + 1,
        ),
      ).toBe('stale')
    })
  })

  it('keeps source and collection time beside a number', () => {
    const displayed = formatAgentUsageSource(sample('current'))
    expect(displayed).toContain('Fonte oficial de teste')
    expect(displayed).toContain('28/08/2026')
  })

  it('renders providers with no accounts and does not expose identity secrets', () => {
    const providers: AgentUsageProvider[] = [
      {
        id: 'codex',
        name: 'Codex',
        provider: 'OpenAI',
        command: 'codex',
        detected: true,
        version: 'test',
        usageSource: {
          kind: 'cli-command',
          label: 'codex login status',
          docsUrl: null,
          limitation: 'Não informa quota.',
          capability: 'available',
        },
      },
      {
        id: 'claude',
        name: 'Claude',
        provider: 'Anthropic',
        command: 'claude',
        detected: false,
        version: null,
        usageSource: {
          kind: 'assisted-event',
          label: 'status line',
          docsUrl: null,
          limitation: 'Aguardando evento.',
          capability: 'interactive-only',
        },
      },
    ]

    const groups = groupAgentUsageAccounts(providers, [account('one', 'current')])
    expect(groups.map((group) => group.accounts.length)).toEqual([1, 0])
    expect(JSON.stringify(groups)).not.toContain('sk-live')
  })
})

describe('agentUsagePercent', () => {
  it('mede a barra pela escala publicada pela fonte', () => {
    expect(agentUsagePercent(metric({ used: 27, limit: 100 }))).toBe(27)
    expect(agentUsagePercent(metric({ used: 0, limit: 100 }))).toBe(0)
  })

  it('não desenha barra quando não existe limite conhecido', () => {
    expect(agentUsagePercent(metric({ used: 12, limit: null }))).toBeNull()
    expect(agentUsagePercent(metric({ used: null, limit: 100 }))).toBeNull()
    expect(agentUsagePercent(metric({ used: 5, limit: 0 }))).toBeNull()
  })

  it('não deixa a barra passar do fim quando a fonte reporta acima do limite', () => {
    expect(agentUsagePercent(metric({ used: 140, limit: 100 }))).toBe(100)
  })
})

describe('formatAgentUsageReset', () => {
  const now = new Date('2026-08-28T12:00:00.000Z')

  it('conta o tempo que falta em minutos, horas e dias', () => {
    expect(formatAgentUsageReset('2026-08-28T12:40:00.000Z', now)).toBe('Reseta em 40 min')
    expect(formatAgentUsageReset('2026-08-28T13:20:00.000Z', now)).toBe('Reseta em 1 h 20 min')
    expect(formatAgentUsageReset('2026-08-28T17:00:00.000Z', now)).toBe('Reseta em 5 h')
    expect(formatAgentUsageReset('2026-09-04T15:00:00.000Z', now)).toBe('Reseta em 7 d 3 h')
  })

  it('avisa que a janela já virou em vez de contar tempo negativo', () => {
    expect(formatAgentUsageReset('2026-08-28T09:00:00.000Z', now)).toMatch(
      /^Janela já renovada às /,
    )
  })

  it('devolve nulo quando a fonte não informou reset', () => {
    expect(formatAgentUsageReset(null, now)).toBeNull()
    expect(formatAgentUsageReset('não é data', now)).toBeNull()
  })
})

describe('metadados da amostra', () => {
  it('separa o horário da medição do horário da leitura', () => {
    const measured = sample('stale', [])
    measured.metadata = { measuredAt: '2026-08-28T09:30:00.000Z' }

    expect(getAgentUsageMeasuredAt(measured)).toBe('2026-08-28T09:30:00.000Z')
    expect(getAgentUsageMeasuredAt(sample('current', []))).toBeNull()
  })

  it('lê o plano só quando a CLI informou', () => {
    const withPlan = sample('current', [])
    withPlan.metadata = { plan: 'plus' }

    expect(getAgentUsagePlan(withPlan)).toBe('plus')
    expect(getAgentUsagePlan(sample('current', []))).toBeNull()
    expect(getAgentUsagePlan(null)).toBeNull()
  })

  it('separa a contagem de resets dos detalhes individuais por conta', () => {
    const withCredits = sample('unavailable')
    withCredits.metadata = {
      statusDetails: {
        usageCredits: {
          availableCount: 3,
          credits: [
            {
              id: 'credit-1',
              resetType: 'codexRateLimits',
              title: 'Full reset',
              description: 'Crédito de teste',
              status: 'available',
              grantedAt: '2026-09-11T10:00:00.000Z',
              expiresAt: '2026-10-11T10:00:00.000Z',
            },
          ],
        },
      },
    }

    expect(getAgentUsageResetCredits(withCredits)).toEqual({
      availableCount: 3,
      credits: [
        {
          id: 'credit-1',
          resetType: 'codexRateLimits',
          title: 'Full reset',
          description: 'Crédito de teste',
          status: 'available',
          grantedAt: '2026-09-11T10:00:00.000Z',
          expiresAt: '2026-10-11T10:00:00.000Z',
        },
      ],
    })
    expect(formatAgentUsageResetCreditStatus('available')).toBe('Disponível')
    expect(formatAgentUsageResetCreditType('codexRateLimits')).toBe('Limites do Codex')
    expect(getAgentUsageResetCredits(sample('current'))).toBeNull()
  })
})

function metric(
  values: Partial<AgentUsageMetric>,
): AgentUsageMetric {
  return {
    key: 'primary',
    label: 'Últimas 5 h',
    used: null,
    limit: null,
    remaining: null,
    unit: '%',
    precision: 'reported',
    resetAt: null,
    ...values,
  }
}
