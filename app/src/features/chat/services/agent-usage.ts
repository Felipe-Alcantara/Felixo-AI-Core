export type AgentUsageMetric = {
  key: string
  label: string
  used: number | null
  limit: number | null
  remaining: number | null
  unit: string | null
  precision: string
  resetAt: string | null
}

export type AgentUsageSample = {
  id: string
  accountId: string
  status: 'current' | 'stale' | 'unavailable' | 'error'
  sourceKind:
    | 'cli-command'
    | 'assisted-event'
    | 'local-execution'
    | 'manual'
    | 'unsupported'
  sourceLabel: string
  sourceCommand: string | null
  sourceUrl: string | null
  collectedAt: string
  metrics: AgentUsageMetric[]
  observedIdentityKey: string | null
  observedIdentityDisplay: string | null
  errorMessage: string | null
  metadata: Record<string, string | number | boolean>
}

export type AgentUsageProvider = {
  id: string
  name: string
  provider: string
  command: string
  detected: boolean
  version: string | null
  usageSource: {
    kind: AgentUsageSample['sourceKind']
    label: string
    docsUrl: string | null
    limitation: string
  }
}

export type AgentUsageAccount = {
  id: string
  providerId: string
  label: string
  identityKey: string | null
  identityDisplay: string | null
  identitySource: 'cli' | 'manual' | null
  createdAt: string
  updatedAt: string
  latestSample: AgentUsageSample | null
  lastKnownSample: AgentUsageSample | null
}

export type AgentUsageDashboard = {
  ok: boolean
  providers?: AgentUsageProvider[]
  accounts?: AgentUsageAccount[]
  refreshedAt?: string | null
  message?: string
}

export type AgentUsageMutationResult = AgentUsageDashboard & {
  account?: AgentUsageAccount
  removed?: boolean
  dashboard?: AgentUsageDashboard
}

export type AgentUsageStatus = AgentUsageSample['status']

export const AGENT_USAGE_STATUS_LABELS: Record<AgentUsageStatus, string> = {
  current: 'Atualizado',
  stale: 'Desatualizado',
  unavailable: 'Indisponível',
  error: 'Erro',
}

export const AGENT_USAGE_STATUS_CLASSES: Record<AgentUsageStatus, string> = {
  current: 'border-theme-success/20 bg-theme-success/10 text-theme-success',
  stale: 'border-amber-300/20 bg-amber-300/10 text-amber-300',
  unavailable: 'border-zinc-400/20 bg-zinc-400/10 text-zinc-400',
  error: 'border-theme-error/20 bg-theme-error/10 text-theme-error',
}

export type AgentUsageProviderGroup = AgentUsageProvider & {
  accounts: AgentUsageAccount[]
}

export function groupAgentUsageAccounts(
  providers: AgentUsageProvider[],
  accounts: AgentUsageAccount[],
): AgentUsageProviderGroup[] {
  const accountsByProvider = new Map<string, AgentUsageAccount[]>()

  for (const account of accounts) {
    const current = accountsByProvider.get(account.providerId) ?? []
    current.push(account)
    accountsByProvider.set(account.providerId, current)
  }

  return providers.map((provider) => ({
    ...provider,
    accounts: accountsByProvider.get(provider.id) ?? [],
  }))
}

export function getAccountStatus(
  account: AgentUsageAccount,
): AgentUsageStatus {
  return account.latestSample?.status ?? 'unavailable'
}

export function formatAgentUsageStatus(status: AgentUsageStatus): string {
  return AGENT_USAGE_STATUS_LABELS[status]
}

export function formatAgentUsageNumber(
  value: number | null | undefined,
  unit: string | null | undefined = null,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }

  const formatted = new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 2,
  }).format(value)

  return unit ? `${formatted} ${unit}` : formatted
}

export function formatAgentUsageMetric(metric: AgentUsageMetric): string {
  const used = formatAgentUsageNumber(metric.used, metric.unit)
  const limit = formatAgentUsageNumber(metric.limit, metric.unit)
  const remaining = formatAgentUsageNumber(metric.remaining, metric.unit)

  return `Usado ${used} · limite ${limit} · restante ${remaining}`
}

export function formatAgentUsageDate(
  value: string | null | undefined,
  fallback = 'não informado',
): string {
  if (!value) {
    return fallback
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return fallback
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

export function formatAgentUsageIdentity(account: AgentUsageAccount): string {
  return account.identityDisplay ?? 'Identidade não informada pela CLI'
}

export function formatAgentUsageSource(sample: AgentUsageSample | null): string {
  if (!sample) {
    return 'Nenhuma coleta realizada.'
  }

  return `${sample.sourceLabel} · ${formatAgentUsageDate(sample.collectedAt)}`
}

export function getLastKnownAgentUsage(
  account: AgentUsageAccount,
): AgentUsageSample | null {
  return account.lastKnownSample ?? null
}

export function summarizeAgentUsage(
  accounts: AgentUsageAccount[],
): Record<AgentUsageStatus, number> {
  const summary: Record<AgentUsageStatus, number> = {
    current: 0,
    stale: 0,
    unavailable: 0,
    error: 0,
  }

  for (const account of accounts) {
    summary[getAccountStatus(account)] += 1
  }

  return summary
}
