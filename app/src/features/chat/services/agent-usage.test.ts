import { describe, expect, it } from 'vitest'
import {
  formatAgentUsageMetric,
  formatAgentUsageNumber,
  formatAgentUsageSource,
  getAccountStatus,
  groupAgentUsageAccounts,
  summarizeAgentUsage,
} from './agent-usage'
import type { AgentUsageAccount, AgentUsageProvider, AgentUsageSample } from './agent-usage'

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

    expect(summarizeAgentUsage(accounts)).toEqual({
      current: 1,
      stale: 1,
      unavailable: 2,
      error: 1,
    })
    expect(getAccountStatus(accounts[4])).toBe('unavailable')
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
        },
      },
    ]

    const groups = groupAgentUsageAccounts(providers, [account('one', 'current')])
    expect(groups.map((group) => group.accounts.length)).toEqual([1, 0])
    expect(JSON.stringify(groups)).not.toContain('sk-live')
  })
})
