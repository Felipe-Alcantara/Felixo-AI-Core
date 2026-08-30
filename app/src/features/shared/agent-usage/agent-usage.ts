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

export type AgentUsageStatusDetailValue =
  | string
  | number
  | boolean
  | AgentUsageStatusDetailValue[]
  | { [key: string]: AgentUsageStatusDetailValue }

export type AgentUsageStatusDetails = {
  [key: string]: AgentUsageStatusDetailValue
}

export type AgentUsageMetadata = {
  [key: string]: string | number | boolean | AgentUsageStatusDetails
}

export type AgentUsageSample = {
  id: string
  accountId: string
  status: 'current' | 'stale' | 'unavailable' | 'error'
  sourceKind:
    | 'cli-command'
    | 'assisted-event'
    | 'live-query'
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
  metadata: AgentUsageMetadata
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

/**
 * Percentual preenchido da barra, ou `null` quando a métrica não é uma escala
 * fechada. Sem limite conhecido não existe barra honesta a desenhar — o painel
 * cai no número puro em vez de inventar uma proporção.
 */
export function agentUsagePercent(metric: AgentUsageMetric): number | null {
  if (metric.used === null || metric.limit === null || metric.limit <= 0) {
    return null
  }

  return Math.min(100, Math.max(0, (metric.used / metric.limit) * 100))
}

/**
 * Frase pronta sobre o reset da janela ("Reseta em 1 h 20 min").
 *
 * Quando o horário de reset já passou, a frase muda de tempo em vez de contar
 * minutos negativos: a janela virou depois da medição, então o percentual na
 * tela é de antes da renovação e dizer "reseta em -3 h" esconderia isso.
 */
export function formatAgentUsageReset(
  resetAt: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!resetAt) {
    return null
  }

  const target = new Date(resetAt)
  if (Number.isNaN(target.getTime())) {
    return null
  }

  const minutes = Math.round((target.getTime() - now.getTime()) / 60_000)

  if (minutes <= 0) {
    return `Janela já renovada às ${formatAgentUsageDate(resetAt)}`
  }

  return `Reseta ${formatRemaining(minutes)}`
}

function formatRemaining(minutes: number): string {
  if (minutes < 60) {
    return `em ${minutes} min`
  }

  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60

  if (hours < 24) {
    return restMinutes > 0 ? `em ${hours} h ${restMinutes} min` : `em ${hours} h`
  }

  const days = Math.floor(hours / 24)
  const restHours = hours % 24

  return restHours > 0 ? `em ${days} d ${restHours} h` : `em ${days} d`
}

/**
 * Momento em que o número foi medido pela CLI, que só é igual ao da leitura
 * quando a fonte responde na hora. O painel mostra os dois para nunca
 * apresentar um valor antigo como se fosse recém-colhido.
 */
export function getAgentUsageMeasuredAt(
  sample: AgentUsageSample | null,
): string | null {
  const measuredAt = sample?.metadata?.measuredAt
  return typeof measuredAt === 'string' ? measuredAt : null
}

/** Plano informado pela própria CLI (`plus`, `pro`…), quando ela informa. */
export function getAgentUsagePlan(sample: AgentUsageSample | null): string | null {
  const plan = sample?.metadata?.plan
  return typeof plan === 'string' && plan.trim() ? plan.trim() : null
}

export function getAgentUsageStatusDetails(
  sample: AgentUsageSample | null,
): AgentUsageStatusDetails | null {
  const details = sample?.metadata?.statusDetails

  return details && typeof details === 'object' && !Array.isArray(details)
    ? details
    : null
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

/**
 * Estado da coleta de rate limit do Claude Code.
 *
 * Ligar a coleta registra um script de status line em `~/.claude/settings.json`
 * — configuração da pessoa, não do app —, então a interface precisa saber
 * distinguir "desligado" de "existe outra status line configurada".
 */
export type ClaudeStatuslineState = {
  ok?: boolean
  installed: boolean
  settingsReadable: boolean
  conflictingStatusLine: boolean
  message?: string
}
