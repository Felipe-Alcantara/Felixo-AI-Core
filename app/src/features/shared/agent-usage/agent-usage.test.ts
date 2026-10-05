import { describe, expect, it } from 'vitest'
import {
  getAgentUsageLastFailureNotice,
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
  shouldRunScheduledAgentUsageRefresh,
  summarizeAgentUsage,
  summarizeProviderAccounts,
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

  describe('shouldRunScheduledAgentUsageRefresh', () => {
    it('não roda sem intervalo escolhido (0 é "só ao abrir/atualizar")', () => {
      expect(
        shouldRunScheduledAgentUsageRefresh({
          autoRefreshMinutes: 0,
          documentHidden: false,
          performanceMode: false,
        }),
      ).toBe(false)
      expect(
        shouldRunScheduledAgentUsageRefresh({
          autoRefreshMinutes: -5,
          documentHidden: false,
          performanceMode: false,
        }),
      ).toBe(false)
    })

    it('não roda com a aba/janela oculta, mesmo com intervalo escolhido — é o gasto que a task pede pra cortar', () => {
      expect(
        shouldRunScheduledAgentUsageRefresh({
          autoRefreshMinutes: 5,
          documentHidden: true,
          performanceMode: false,
        }),
      ).toBe(false)
    })

    it('não roda com o Modo Performance ligado', () => {
      expect(
        shouldRunScheduledAgentUsageRefresh({
          autoRefreshMinutes: 5,
          documentHidden: false,
          performanceMode: true,
        }),
      ).toBe(false)
    })

    it('roda quando há intervalo escolhido, a aba está visível e o Modo Performance está desligado', () => {
      expect(
        shouldRunScheduledAgentUsageRefresh({
          autoRefreshMinutes: 5,
          documentHidden: false,
          performanceMode: false,
        }),
      ).toBe(true)
    })
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

describe('aviso da última falha no card da conta', () => {
  const amostra = (status: AgentUsageSample['status'], errorMessage: string | null, comNumero: boolean) =>
    ({
      id: `${status}-${String(comNumero)}`,
      status,
      errorMessage,
      collectedAt: '2026-10-05T08:00:00.000Z',
      metrics: comNumero
        ? [{ key: 'rate_limits.seven_day', label: 'Janela de 7 dias', used: 40, limit: 100, remaining: 60, unit: '%', precision: 'percentage', resetAt: null }]
        : [],
    }) as unknown as AgentUsageSample

  it('mostra o motivo quando a rodada falhou e o card exibe o último valor conhecido', () => {
    const falha = amostra('error', 'Claude Code CLI: A consulta não respondeu em 90 s.', false)
    const antigo = amostra('current', null, true)
    expect(getAgentUsageLastFailureNotice({ latestSample: falha }, antigo)).toEqual({
      message: 'Claude Code CLI: A consulta não respondeu em 90 s.',
      at: '2026-10-05T08:00:00.000Z',
    })
  })

  it('sem número na tela não há aviso a mais: o próprio card já mostra o erro', () => {
    const falha = amostra('error', 'falhou', false)
    expect(getAgentUsageLastFailureNotice({ latestSample: falha }, falha)).toBeNull()
  })

  it('rodada atual sem erro não gera aviso', () => {
    const atual = amostra('current', null, true)
    expect(getAgentUsageLastFailureNotice({ latestSample: atual }, atual)).toBeNull()
  })
})

describe('summarizeProviderAccounts', () => {
  const NOW = () => Date.parse('2026-08-28T12:05:00.000Z')
  const window5h = (remaining: number) =>
    metric({ key: 'rate_limits.primary', label: 'Últimas 5 h', used: 100 - remaining, limit: 100, remaining, resetAt: '2026-08-28T15:00:00.000Z' })
  const weekly = (remaining: number) =>
    metric({ key: 'rate_limits.secondary', label: 'Últimos 7 dias', used: 100 - remaining, limit: 100, remaining })
  const reserve = metric({
    key: 'rate_limits.base_model_inference.primary',
    label: 'Últimos 7 dias · gpt-reserve (gpt-5.6-luna)',
    used: 100,
    limit: 100,
    remaining: 0,
    scope: 'model',
  })
  const credits = metric({ key: 'credits', label: 'Créditos avulsos', unit: null, remaining: 4.5 })

  function codexAccount(id: string, metrics: AgentUsageMetric[], metadata: AgentUsageSample['metadata'] = {}) {
    const base = account(id, 'current')
    const latest = { ...sample('current', metrics), accountId: id, metadata }
    return { ...base, latestSample: latest, lastKnownSample: latest }
  }

  function group(accounts: AgentUsageAccount[]) {
    const provider: AgentUsageProvider = {
      id: 'codex',
      name: 'Codex CLI',
      provider: 'OpenAI',
      command: 'codex',
      detected: true,
      version: '0.156.1',
      usageSource: { kind: 'live-query', label: 'Codex', docsUrl: null, limitation: '', capability: 'available' },
    }
    return groupAgentUsageAccounts([provider], accounts)[0]
  }

  it('uma linha por conta e uma coluna por janela da conta, sem a reserva de um modelo nem saldos', () => {
    const summary = summarizeProviderAccounts(
      group([
        codexAccount('conta-a', [window5h(80), weekly(40), reserve, credits], { plan: 'plus' }),
        codexAccount('conta-b', [window5h(10)]),
      ]),
      NOW,
    )

    expect(summary.columns).toEqual([
      { key: 'rate_limits.primary', label: 'Últimas 5 h' },
      { key: 'rate_limits.secondary', label: 'Últimos 7 dias' },
    ])
    expect(summary.rows.map((row) => row.account.id)).toEqual(['conta-a', 'conta-b'])
    expect(summary.rows[0].plan).toBe('plus')
    expect(summary.rows[0].cells['rate_limits.primary']).toEqual({
      remaining: 80,
      usedPercent: 20,
      resetAt: '2026-08-28T15:00:00.000Z',
    })
    // A conta B não publicou a janela semanal: célula vazia, nunca zero.
    expect(summary.rows[1].cells['rate_limits.secondary']).toBeNull()
    expect(summary.rows[1].status).toBe('current')
  })

  it('traz o aviso de bloqueio publicado nos detalhes do /status', () => {
    const summary = summarizeProviderAccounts(
      group([
        codexAccount('conta-a', [window5h(0)], {
          statusDetails: { blockingWarning: 'O serviço bloqueou o uso comum desta conta.' },
        }),
      ]),
      NOW,
    )

    expect(summary.rows[0].warning).toBe('O serviço bloqueou o uso comum desta conta.')
  })

  it('provedor sem conta não tem colunas nem linhas', () => {
    expect(summarizeProviderAccounts(group([]), NOW)).toEqual({ columns: [], rows: [] })
  })

  it('conta com a rodada atual sem número usa o último valor conhecido, com o status da rodada atual', () => {
    const known = { ...sample('current', [window5h(55)]), accountId: 'conta-a' }
    const failed = { ...sample('error'), accountId: 'conta-a' }
    const conta = { ...account('conta-a', null), latestSample: failed, lastKnownSample: known }

    const summary = summarizeProviderAccounts(group([conta]), NOW)

    expect(summary.rows[0].cells['rate_limits.primary']?.remaining).toBe(55)
    expect(summary.rows[0].status).toBe('error')
  })
})
