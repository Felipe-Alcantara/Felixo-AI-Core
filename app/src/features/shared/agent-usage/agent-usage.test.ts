import { describe, expect, it } from 'vitest'
import {
  getAgentUsageLastFailureNotice,
  AGENT_USAGE_OPEN_REUSE_MS,
  AGENT_USAGE_STALE_AFTER_MS,
  agentUsagePercent,
  describeDisplayedAgentUsage,
  deriveDisplayStatus,
  formatAgentUsageAge,
  formatAgentUsageMetric,
  formatAgentUsageNumber,
  formatAgentUsageReset,
  formatAgentUsageResetCreditStatus,
  formatAgentUsageResetCreditType,
  formatAgentUsageSource,
  getAccountStatus,
  getAgentUsageLoginTerminal,
  getAgentUsageMeasuredAt,
  getAgentUsagePlan,
  getAgentUsageResetCredits,
  groupAgentUsageAccounts,
  shouldRefreshAgentUsageOnOpen,
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
    ownLogin: false,
    availability: { state: 'available', message: null },
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

  describe('shouldRefreshAgentUsageOnOpen', () => {
    const now = Date.parse('2026-10-15T14:00:00.000Z')

    it('reaproveita uma coleta completa de menos de 5 min: o painel abre sem reconsultar', () => {
      expect(AGENT_USAGE_OPEN_REUSE_MS).toBe(5 * 60_000)
      expect(shouldRefreshAgentUsageOnOpen('2026-10-15T13:59:00.000Z', now)).toBe(false)
      expect(shouldRefreshAgentUsageOnOpen('2026-10-15T13:55:00.001Z', now)).toBe(false)
    })

    it('reconsulta a partir de 5 min', () => {
      expect(shouldRefreshAgentUsageOnOpen('2026-10-15T13:55:00.000Z', now)).toBe(true)
      expect(shouldRefreshAgentUsageOnOpen('2026-10-15T12:00:00.000Z', now)).toBe(true)
    })

    it('reconsulta sem coleta nesta execução do app ou com data ilegível', () => {
      expect(shouldRefreshAgentUsageOnOpen(null, now)).toBe(true)
      expect(shouldRefreshAgentUsageOnOpen(undefined, now)).toBe(true)
      expect(shouldRefreshAgentUsageOnOpen('ontem', now)).toBe(true)
    })

    it('reconsulta quando a coleta parece vir do futuro (relógio do sistema voltou)', () => {
      expect(shouldRefreshAgentUsageOnOpen('2026-10-15T14:01:00.000Z', now)).toBe(true)
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
    // A célula vem do último valor conhecido e a linha diz isso: não parece leitura nova.
    expect(summary.rows[0].lastKnown).toBe(true)
    expect(summary.rows[0].notice).toMatch(/^Último valor conhecido/)
  })

  it('conta que respondeu na rodada atual não leva aviso nem marca de valor antigo', () => {
    const summary = summarizeProviderAccounts(group([codexAccount('conta-a', [window5h(40)])]), NOW)

    expect(summary.rows[0].lastKnown).toBe(false)
    expect(summary.rows[0].notice).toBeNull()
  })
})

describe('formatAgentUsageAge', () => {
  const AGORA = Date.parse('2026-10-26T12:00:00.000Z')
  const atras = (ms: number) => new Date(AGORA - ms).toISOString()

  it.each([
    [30_000, 'agora há pouco'],
    [60_000, 'há 1 min'],
    [59 * 60_000, 'há 59 min'],
    [60 * 60_000, 'há 1 h'],
    [23 * 3_600_000 + 59 * 60_000, 'há 23 h'],
    [24 * 3_600_000, 'há 1 d'],
    [3 * 24 * 3_600_000, 'há 3 d'],
    [-5 * 60_000, 'agora há pouco'], // relógio do futuro: nunca "há -5 min"
  ])('%i ms atrás vira "%s"', (ms, esperado) => {
    expect(formatAgentUsageAge(atras(ms), AGORA)).toBe(esperado)
  })

  it('data ausente ou ilegível não vira idade inventada', () => {
    expect(formatAgentUsageAge(null, AGORA)).toBeNull()
    expect(formatAgentUsageAge(undefined, AGORA)).toBeNull()
    expect(formatAgentUsageAge('ontem à tarde', AGORA)).toBeNull()
  })
})

describe('o que o card da conta mostra quando a rodada atual não trouxe número', () => {
  const AGORA = Date.parse('2026-10-26T12:00:00.000Z')
  const atras = (min: number) => new Date(AGORA - min * 60_000).toISOString()
  const janela = metric({ key: 'rate_limits.seven_day', label: 'Janela de 7 dias', used: 40, limit: 100, remaining: 60 })
  const leitura = (id: string, minutos: number, metadata: AgentUsageSample['metadata'] = {}): AgentUsageSample => ({
    ...sample('current', [janela]),
    id,
    collectedAt: atras(minutos),
    metadata,
  })
  const falha = (
    status: 'error' | 'unavailable' | 'stale',
    errorMessage: string | null,
    metadata: AgentUsageSample['metadata'] = {},
  ): AgentUsageSample => ({ ...sample(status), id: `falha-${status}`, collectedAt: atras(1), errorMessage, metadata })
  const conta = (
    latestSample: AgentUsageSample | null,
    lastKnownSample: AgentUsageSample | null,
    availability: AgentUsageAccount['availability'] = { state: 'available', message: null },
  ): AgentUsageAccount => ({ ...account('conta-a', null), latestSample, lastKnownSample, availability })

  it('leitura nova: o que está na tela é a última leitura, sem aviso', () => {
    const nova = leitura('nova', 1)
    const display = describeDisplayedAgentUsage(conta(nova, nova), AGORA)

    expect(display).toEqual({ sample: nova, isLastKnown: false, notice: null, failedAt: null })
  })

  it('rede fora com número antigo na tela: marca como último valor conhecido, com a idade e o motivo da rodada', () => {
    const antiga = leitura('antiga', 5)
    const rede = falha('error', 'Codex: getaddrinfo ENOTFOUND chatgpt.com')
    const display = describeDisplayedAgentUsage(
      conta(rede, antiga, { state: 'network-disabled', message: 'Sem rede, ou rede bloqueada.' }),
      AGORA,
    )

    expect(display.sample).toBe(antiga)
    expect(display.isLastKnown).toBe(true)
    expect(display.notice).toBe('Último valor conhecido, lido há 5 min. Sem rede, ou rede bloqueada.')
    expect(display.failedAt).toBe(rede.collectedAt)
    // O texto cru do erro (que pode ter host, caminho...) não vai para o aviso.
    expect(display.notice).not.toMatch(/ENOTFOUND/)
  })

  it('o número que a CLI mediu em outro momento vira "medido há…", não "lido há…"', () => {
    const antiga = leitura('antiga', 1, { measuredAt: atras(180) })
    const display = describeDisplayedAgentUsage(
      conta(falha('error', null), antiga, { state: 'timeout', message: 'A consulta passou do tempo limite.' }),
      AGORA,
    )

    expect(display.notice).toBe('Último valor conhecido, medido há 3 h. A consulta passou do tempo limite.')
  })

  it('sessão ausente com número antigo: o aviso diz que falta entrar, e o número continua sendo o antigo', () => {
    const antiga = leitura('antiga', 20)
    const display = describeDisplayedAgentUsage(
      conta(falha('unavailable', 'sem sessão'), antiga, { state: 'auth-required', message: 'Esta conta não está logada.' }),
      AGORA,
    )

    expect(display.isLastKnown).toBe(true)
    expect(display.notice).toBe('Último valor conhecido, lido há 20 min. Esta conta não está logada.')
  })

  it('falha genérica (query-failed): a mensagem da própria rodada diz mais que o texto fixo e é a que aparece', () => {
    const display = describeDisplayedAgentUsage(
      conta(falha('error', 'Claude: o /status não retornou os limites.'), leitura('antiga', 5), {
        state: 'query-failed',
        message: 'A consulta da CLI falhou nesta rodada.',
      }),
      AGORA,
    )

    expect(display.notice).toBe('Último valor conhecido, lido há 5 min. Claude: o /status não retornou os limites.')
  })

  it('erro sem razão classificada: o motivo é a mensagem da própria rodada (comportamento anterior)', () => {
    const antiga = leitura('antiga', 2)
    const display = describeDisplayedAgentUsage(
      conta(falha('error', 'A CLI informou outra conta; nenhuma métrica foi copiada.'), antiga),
      AGORA,
    )

    expect(display.notice).toBe(
      'Último valor conhecido, lido há 2 min. A CLI informou outra conta; nenhuma métrica foi copiada.',
    )
  })

  it('rodada atual desatualizada sem número, e sem falha: só avisa que é o último valor conhecido', () => {
    const display = describeDisplayedAgentUsage(conta(falha('stale', 'limitação da fonte'), leitura('antiga', 40)), AGORA)

    expect(display.isLastKnown).toBe(true)
    expect(display.notice).toBe('Último valor conhecido, lido há 40 min.')
    expect(display.failedAt).toBeNull()
  })

  it('sem nenhum número guardado: o aviso é só o motivo, e nada é marcado como valor antigo', () => {
    const rede = falha('error', null)
    const display = describeDisplayedAgentUsage(
      conta(rede, null, { state: 'network-disabled', message: 'Sem rede, ou rede bloqueada.' }),
      AGORA,
    )

    expect(display.sample).toBe(rede)
    expect(display.isLastKnown).toBe(false)
    expect(display.notice).toBe('Sem rede, ou rede bloqueada.')
  })

  it('limitação da fonte (Gemini) não vira aviso de falha: o card já mostra a limitação', () => {
    const indisponivel = falha('unavailable', 'A quota só sai do /stats model.')
    const display = describeDisplayedAgentUsage(
      conta(indisponivel, null, { state: 'interactive-only', message: 'A quota só sai do /stats model.' }),
      AGORA,
    )

    expect(display.notice).toBeNull()
    expect(display.isLastKnown).toBe(false)
  })

  it('conta nunca consultada não tem aviso', () => {
    expect(describeDisplayedAgentUsage(conta(null, null), AGORA)).toEqual({
      sample: null,
      isLastKnown: false,
      notice: null,
      failedAt: null,
    })
  })
})

describe('getAgentUsageLoginTerminal', () => {
  const semSessao = (overrides: Partial<AgentUsageAccount>): AgentUsageAccount => ({
    ...account('conta-a', null),
    availability: { state: 'auth-required', message: 'Esta conta não está logada.' },
    ...overrides,
  })

  it('Claude com pasta de login própria: abre `claude auth login` na conta, sem contexto do canvas', () => {
    expect(
      getAgentUsageLoginTerminal(semSessao({ providerId: 'claude', ownLogin: true, identityDisplay: 'ana@example.com' })),
    ).toEqual({
      command: 'claude',
      args: ['auth', 'login'],
      accountId: 'conta-a',
      providerId: 'claude',
      label: 'Entrar · ana@example.com',
      // `launcher` é o modo opaco: o `initialText` do canvas não é digitado dentro do fluxo de login.
      launchMode: 'launcher',
    })
  })

  it('Codex usa `codex login`', () => {
    expect(getAgentUsageLoginTerminal(semSessao({ providerId: 'codex', ownLogin: true }))?.args).toEqual(['login'])
  })

  it('a conta do login do sistema abre sem accountId (o main só aceita contas do cofre de perfis)', () => {
    const terminal = getAgentUsageLoginTerminal(semSessao({ providerId: 'claude', ownLogin: false }))

    expect(terminal).not.toBeNull()
    expect(terminal).not.toHaveProperty('accountId')
  })

  it('só oferece o terminal quando a razão é sessão ausente', () => {
    for (const state of ['available', 'network-disabled', 'cli-missing', 'timeout', 'query-failed', 'interactive-only', 'unsupported'] as const) {
      expect(
        getAgentUsageLoginTerminal(semSessao({ providerId: 'claude', availability: { state, message: 'x' } })),
        state,
      ).toBeNull()
    }
  })

  it('provedor sem comando de login conhecido não ganha botão (nem por nome herdado do Object)', () => {
    for (const providerId of ['gemini', 'openia', 'constructor', '__proto__', 'toString']) {
      expect(getAgentUsageLoginTerminal(semSessao({ providerId })), providerId).toBeNull()
    }
  })
})
