export type AgentUsageMetric = {
  key: string
  label: string
  used: number | null
  limit: number | null
  remaining: number | null
  unit: string | null
  precision: string
  resetAt: string | null
  /**
   * `model`: a janela vale só para um modelo (a reserva semanal do Codex, por
   * exemplo) e não diz se a conta inteira acabou. Ausente = conta inteira.
   */
  scope?: 'account' | 'model'
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

export type AgentUsageResetCredit = {
  id: string | null
  resetType: string | null
  title: string | null
  description: string | null
  status: string
  grantedAt: string | null
  expiresAt: string | null
}

export type AgentUsageResetCredits = {
  availableCount: number
  credits: AgentUsageResetCredit[]
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
    // Por que a fonte pode não ter número, independente de qualquer rodada:
    // `unsupported` (sem fonte), `interactive-only` (só existe dentro de
    // sessão interativa, ex.: Gemini) ou `available` (existe algum caminho —
    // consulta ao vivo, comando ou arquivo local).
    capability: 'unsupported' | 'interactive-only' | 'available'
  }
}

/**
 * Disponibilidade em runtime de uma conta (`describeAvailability`, no backend):
 * a capability estática da fonte somada ao resultado da última rodada. Os cinco
 * últimos estados são razões de falha; `available` sem mensagem é "nada a avisar".
 */
export type AgentUsageAvailabilityState =
  | 'available'
  | 'unsupported'
  | 'interactive-only'
  | 'auth-required'
  | 'network-disabled'
  | 'cli-missing'
  | 'timeout'
  | 'query-failed'

export type AgentUsageAvailability = {
  state: AgentUsageAvailabilityState
  message: string | null
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
  /** Pasta de login própria (perfil); a "Conta desta máquina" usa o login do sistema. */
  ownLogin: boolean
  availability: AgentUsageAvailability
  latestSample: AgentUsageSample | null
  lastKnownSample: AgentUsageSample | null
}

export type AgentUsageDashboard = {
  ok: boolean
  providers?: AgentUsageProvider[]
  accounts?: AgentUsageAccount[]
  refreshedAt?: string | null
  message?: string
  /** A rodada estourou o teto: o painel volta com o que já sabia e o motivo. */
  refreshError?: string
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
  stale: 'border-[color-mix(in_srgb,var(--color-warning)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] text-(--color-warning)',
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

// Espelha STALE_AFTER_MS de agent-usage-service.cjs. O backend já marca a
// amostra como `stale` quando a rodada é feita — mas se o painel ficar aberto
// sem nenhum refresh (auto-refresh desligado é o padrão; o aviso de arquivo
// mudado só cobre Codex/Claude), o selo "Atualizado" continuaria o mesmo
// para sempre, mesmo o relógio andando bem além da janela de validade. Ver a
// task "Limites — tornar o painel transparente sobre medição, stale, erro e
// timestamp".
export const AGENT_USAGE_STALE_AFTER_MS = 15 * 60 * 1000

/**
 * Reavalia `current` → `stale` usando o relógio de agora, não o do momento em
 * que o dashboard foi buscado. Os outros status (`stale`/`unavailable`/
 * `error`) já são definitivos e não precisam de reavaliação: só `current` é
 * uma alegação sobre "quão recente" que o tempo pode desmentir sozinho.
 */
export function deriveDisplayStatus(
  sample: AgentUsageSample | null | undefined,
  now: () => number = Date.now,
): AgentUsageStatus {
  if (!sample) {
    return 'unavailable'
  }

  if (sample.status !== 'current') {
    return sample.status
  }

  const measuredAt = getAgentUsageMeasuredAt(sample) ?? sample.collectedAt
  const timestamp = Date.parse(measuredAt)

  if (!Number.isFinite(timestamp)) {
    return sample.status
  }

  return now() - timestamp > AGENT_USAGE_STALE_AFTER_MS ? 'stale' : 'current'
}

export function getAccountStatus(
  account: AgentUsageAccount,
  now: () => number = Date.now,
): AgentUsageStatus {
  return deriveDisplayStatus(account.latestSample, now)
}

export type AgentUsageSchedulerState = {
  /** Minutos escolhidos no painel; `0`/negativo é "só ao abrir/atualizar". */
  autoRefreshMinutes: number
  documentHidden: boolean
  performanceMode: boolean
}

/**
 * Decide se um disparo agendado deve rodar de verdade uma rodada completa
 * (`refresh()`), que abre sessão PTY por conta do Claude, consulta rede do
 * Openia e comandos do Codex — nada barato.
 *
 * Sem esta checagem, o `setInterval` do painel disparava `refresh()` mesmo
 * com a aba/janela oculta ou o Modo Performance ligado: exatamente o oposto
 * do critério de aceite "App oculto/fechado não mantém timer/processo" da
 * task "Limites — implementar scheduler contínuo com backoff, visibilidade e
 * deduplicação". Não decide backoff nem orçamento entre providers — só a
 * pausa mais barata e mais óbvia de aplicar primeiro.
 */
export function shouldRunScheduledAgentUsageRefresh(
  state: AgentUsageSchedulerState,
): boolean {
  if (state.autoRefreshMinutes <= 0) {
    return false
  }

  if (state.documentHidden || state.performanceMode) {
    return false
  }

  return true
}

/**
 * Idade máxima da última coleta completa para o painel abrir com ela, sem
 * reconsultar. Decisão do Felipe (15/10/2026): abrir e fechar os Limites
 * várias vezes não pode custar uma coleta de ~15 s a cada vez; o botão
 * Atualizar continua forçando uma coleta nova.
 */
export const AGENT_USAGE_OPEN_REUSE_MS = 5 * 60_000

/**
 * Decide se abrir o painel dispara a coleta ao vivo (`refresh()`). Sem coleta
 * nesta execução do app, com data ilegível ou "do futuro" (relógio do sistema
 * voltou), reconsulta: na dúvida, o número fresco vale mais que a pressa.
 */
export function shouldRefreshAgentUsageOnOpen(
  refreshedAt: string | null | undefined,
  now: number,
  reuseMs: number = AGENT_USAGE_OPEN_REUSE_MS,
): boolean {
  const collectedAt = refreshedAt ? Date.parse(refreshedAt) : Number.NaN
  if (!Number.isFinite(collectedAt)) {
    return true
  }

  const age = now - collectedAt
  return age < 0 || age >= reuseMs
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
 * Amostra que o painel mostra para a conta. Com a fonte fora do ar, o painel
 * não apaga o que já sabia: mostra o último valor conhecido, marcado como
 * antigo pelo próprio selo de status.
 */
export function getDisplayedAgentUsageSample(
  account: AgentUsageAccount,
): AgentUsageSample | null {
  return account.latestSample?.metrics.length
    ? account.latestSample
    : getLastKnownAgentUsage(account) ?? account.latestSample
}

/** Estados em que a rodada deveria ter trazido número e não trouxe. */
const AGENT_USAGE_FAILURE_STATES: ReadonlySet<AgentUsageAvailabilityState> = new Set([
  'auth-required',
  'network-disabled',
  'cli-missing',
  'timeout',
  'query-failed',
])

/**
 * Idade de um instante em português curto ("há 5 min"). Instante no futuro
 * (relógio que voltou) vira "agora há pouco", nunca "há -5 min"; data ausente
 * ou ilegível devolve `null` em vez de inventar uma idade.
 */
export function formatAgentUsageAge(
  value: string | null | undefined,
  now: number = Date.now(),
): string | null {
  const timestamp = value ? Date.parse(value) : Number.NaN
  if (!Number.isFinite(timestamp)) {
    return null
  }

  const minutes = Math.floor((now - timestamp) / 60_000)
  if (minutes < 1) {
    return 'agora há pouco'
  }
  if (minutes < 60) {
    return `há ${minutes} min`
  }

  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `há ${hours} h` : `há ${Math.floor(hours / 24)} d`
}

export type AgentUsageDisplay = {
  /** O que o card mostra: a leitura mais recente com número, ou a mais recente. */
  sample: AgentUsageSample | null
  /** O número na tela não é da rodada mais recente (que falhou ou veio sem número). */
  isLastKnown: boolean
  /** Frase pronta sobre a idade do número e o motivo da rodada atual; `null` = nada a avisar. */
  notice: string | null
  /** Quando a rodada mais recente falhou, se falhou. */
  failedAt: string | null
}

/**
 * O que o card de uma conta mostra e o que precisa dizer sobre isso. Com a
 * rodada atual sem número, o card cai para o último valor conhecido — e esse
 * número precisa parecer o que é: antigo. A razão vem de `availability` (texto
 * fixo, sem o erro cru da CLI); erro sem razão classificada mantém a mensagem
 * da própria rodada. Limitação da fonte (Gemini) não é falha: o card já a mostra.
 */
export function describeDisplayedAgentUsage(
  account: AgentUsageAccount,
  now: number = Date.now(),
): AgentUsageDisplay {
  const sample = getDisplayedAgentUsageSample(account)
  const latest = account.latestSample
  const hasNumbers = Boolean(sample?.metrics.length)
  const isLastKnown = hasNumbers && sample?.id !== latest?.id
  const { state, message } = account.availability
  const runtimeReason = AGENT_USAGE_FAILURE_STATES.has(state) ? message : null

  if (!isLastKnown) {
    return {
      sample,
      isLastKnown: false,
      notice: hasNumbers ? null : runtimeReason,
      failedAt: null,
    }
  }

  const failureMessage = getAgentUsageLastFailureNotice(account, sample)?.message ?? null
  // `query-failed` é o genérico: a mensagem da própria rodada diz mais que o texto fixo.
  const reason =
    (state === 'query-failed' ? failureMessage ?? runtimeReason : runtimeReason ?? failureMessage) ?? null
  const measuredAt = getAgentUsageMeasuredAt(sample)
  const age = formatAgentUsageAge(measuredAt ?? sample?.collectedAt, now)
  const head = age
    ? `Último valor conhecido, ${measuredAt ? 'medido' : 'lido'} ${age}.`
    : 'Último valor conhecido.'

  return {
    sample,
    isLastKnown: true,
    notice: reason ? `${head} ${reason}` : head,
    failedAt: latest?.status === 'error' || latest?.status === 'unavailable' ? latest.collectedAt : null,
  }
}

/**
 * A partir de quantas contas o painel oferece o filtro. Medido no app (26/10/2026,
 * janela de 696 px): cada conta ocupa ~109 px e o painel já rola com 3; com 6 são
 * ~2,3 telas de rolagem. Abaixo disso a busca só ocuparia espaço.
 */
export const AGENT_USAGE_FILTER_MIN_ACCOUNTS = 6

export type AgentUsageFilter = {
  /** Texto livre: nome da conta, e-mail (como o painel o exibe) ou plano. */
  query: string
  /** Só contas com algo a fazer: erro, leitura velha ou sem sessão. */
  attentionOnly: boolean
}

export const EMPTY_AGENT_USAGE_FILTER: AgentUsageFilter = { query: '', attentionOnly: false }

export function isAgentUsageFilterActive(filter: AgentUsageFilter): boolean {
  return filter.query.trim() !== '' || filter.attentionOnly
}

/** A barra de filtro aparece com muitas contas, e fica enquanto houver filtro ligado (ele não pode esconder conta em silêncio). */
export function shouldShowAgentUsageFilter(accountCount: number, filter: AgentUsageFilter): boolean {
  return accountCount >= AGENT_USAGE_FILTER_MIN_ACCOUNTS || isAgentUsageFilterActive(filter)
}

/**
 * A conta tem algo a fazer? Erro, leitura velha, sem sessão ou ainda sem número.
 * A que a fonte nunca entrega (Gemini interativo, provider sem fonte) não conta:
 * não há o que a pessoa fazer, e ela ficaria para sempre na lista de atenção.
 */
export function accountNeedsAttention(
  account: AgentUsageAccount,
  now: () => number = Date.now,
): boolean {
  const { state } = account.availability
  if (state === 'unsupported' || state === 'interactive-only') {
    return false
  }

  return getAccountStatus(account, now) !== 'current'
}

export function countAgentUsageAccountsNeedingAttention(
  accounts: AgentUsageAccount[],
  now: () => number = Date.now,
): number {
  return accounts.filter((account) => accountNeedsAttention(account, now)).length
}

/** Sem acento e sem caixa: "joao" acha "João", "PLUS" acha "plus". */
function normalizeAgentUsageSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

function matchesAgentUsageQuery(account: AgentUsageAccount, query: string): boolean {
  const terms = normalizeAgentUsageSearch(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) {
    return true
  }

  const plan = getAgentUsagePlan(getDisplayedAgentUsageSample(account))
  const haystack = normalizeAgentUsageSearch(
    [account.label, account.identityDisplay, plan].filter(Boolean).join(' '),
  )
  return terms.every((term) => haystack.includes(term))
}

/**
 * Os grupos com só as contas que passam no filtro. O provider que ficou sem conta
 * some junto: "Nenhuma conta vinculada" seria mentira durante a busca. Filtro
 * desligado devolve os grupos como vieram.
 */
export function filterAgentUsageGroups(
  groups: AgentUsageProviderGroup[],
  filter: AgentUsageFilter,
  now: () => number = Date.now,
): AgentUsageProviderGroup[] {
  if (!isAgentUsageFilterActive(filter)) {
    return groups
  }

  return groups
    .map((group) => ({
      ...group,
      accounts: group.accounts.filter(
        (account) =>
          matchesAgentUsageQuery(account, filter.query) &&
          (!filter.attentionOnly || accountNeedsAttention(account, now)),
      ),
    }))
    .filter((group) => group.accounts.length > 0)
}

/** Texto de ajuda do botão "Atualizar" de uma conta: diz o que a consulta lê de verdade. */
export function describeAgentUsageAccountRefresh(account: AgentUsageAccount): string {
  return account.ownLogin
    ? 'Consulta só esta conta, na pasta de login dela. As outras ficam como estão.'
    : 'Esta conta usa o login desta máquina: relê a sessão do sistema neste provider e mostra a leitura na conta a que essa sessão pertence.'
}

// Subcomandos de login confirmados nas CLIs instaladas (claude 2.1.310, codex-cli
// 0.165). Gemini e Openia ficam de fora: não há login por subcomando para abrir.
const AGENT_LOGIN_COMMANDS: ReadonlyMap<string, { command: string; args: string[] }> = new Map([
  ['claude', { command: 'claude', args: ['auth', 'login'] }],
  ['codex', { command: 'codex', args: ['login'] }],
])

export type AgentUsageLoginTerminal = {
  command: string
  args: string[]
  label: string
  providerId: string
  /** Só em conta com pasta de login própria: o processo principal não conhece a "Conta desta máquina". */
  accountId?: string
  /** Modo opaco: o contexto do canvas não é digitado dentro do fluxo de login. */
  launchMode: 'launcher'
}

/**
 * Terminal que faz o login de uma conta com sessão ausente, ou `null` quando a
 * razão é outra ou a CLI não tem subcomando de login. Compatível com as opções
 * de `addTerminalNode`; o login em si é feito pela pessoa, no terminal.
 */
export function getAgentUsageLoginTerminal(
  account: AgentUsageAccount,
): AgentUsageLoginTerminal | null {
  const login = AGENT_LOGIN_COMMANDS.get(account.providerId)
  if (account.availability.state !== 'auth-required' || !login) {
    return null
  }

  return {
    command: login.command,
    args: [...login.args],
    label: `Entrar · ${account.identityDisplay ?? account.label}`,
    providerId: account.providerId,
    ...(account.ownLogin ? { accountId: account.id } : {}),
    launchMode: 'launcher',
  }
}

export type AgentUsageSummaryColumn = { key: string; label: string }

export type AgentUsageSummaryCell = {
  remaining: number
  usedPercent: number
  resetAt: string | null
}

export type AgentUsageSummaryRow = {
  account: AgentUsageAccount
  plan: string | null
  status: AgentUsageStatus
  /** Aviso de bloqueio publicado pela CLI (uso bloqueado, limite atingido). */
  warning: string | null
  /** As células são do último valor conhecido, não da rodada mais recente. */
  lastKnown: boolean
  /** Idade do número e razão da rodada atual (`describeDisplayedAgentUsage`). */
  notice: string | null
  cells: Record<string, AgentUsageSummaryCell | null>
}

export type AgentUsageProviderSummary = {
  columns: AgentUsageSummaryColumn[]
  rows: AgentUsageSummaryRow[]
}

/**
 * Resumo de um provedor: uma linha por conta e uma coluna por janela de uso
 * da conta, na ordem em que a CLI publica. Só entram janelas em % da conta
 * inteira — a de um modelo só (`scope: 'model'`) e os saldos sem escala
 * fechada ficam no /status completo de cada conta. Conta sem a janela fica
 * com a célula vazia, nunca com zero.
 */
export function summarizeProviderAccounts(
  group: AgentUsageProviderGroup,
  now: () => number = Date.now,
): AgentUsageProviderSummary {
  const columns: AgentUsageSummaryColumn[] = []
  const seen = new Set<string>()
  const displayed = group.accounts.map((account) => {
    const display = describeDisplayedAgentUsage(account, now())
    return { account, display, sample: display.sample }
  })

  for (const { sample } of displayed) {
    for (const metric of sample?.metrics ?? []) {
      if (isAccountPercentWindow(metric) && !seen.has(metric.key)) {
        seen.add(metric.key)
        columns.push({ key: metric.key, label: metric.label })
      }
    }
  }

  const rows = displayed.map(({ account, display, sample }) => {
    const cells: Record<string, AgentUsageSummaryCell | null> = {}
    for (const column of columns) {
      const metric = sample?.metrics.find((item) => item.key === column.key)
      cells[column.key] =
        metric && isAccountPercentWindow(metric)
          ? {
              remaining: metric.remaining as number,
              usedPercent: agentUsagePercent(metric) ?? 100 - (metric.remaining as number),
              resetAt: metric.resetAt,
            }
          : null
    }

    return {
      account,
      plan: getAgentUsagePlan(sample),
      status: getAccountStatus(account, now),
      warning: getAgentUsageBlockingWarning(account.latestSample ?? sample),
      lastKnown: display.isLastKnown,
      notice: display.notice,
      cells,
    }
  })

  return { columns, rows }
}

function isAccountPercentWindow(metric: AgentUsageMetric): boolean {
  return (
    metric.unit === '%' &&
    metric.scope !== 'model' &&
    typeof metric.remaining === 'number' &&
    Number.isFinite(metric.remaining)
  )
}

/** Aviso de bloqueio que a consulta publicou nos detalhes do /status. */
export function getAgentUsageBlockingWarning(sample: AgentUsageSample | null): string | null {
  const warning = getAgentUsageStatusDetails(sample)?.blockingWarning
  return typeof warning === 'string' && warning.trim() ? warning.trim() : null
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

/**
 * Extrai o resumo de resets bancados sem expor ao componente a árvore
 * genérica de detalhes. A lista pode ser menor que `availableCount`: a CLI
 * documenta que o backend pode limitar a quantidade de linhas retornadas.
 */
export function getAgentUsageResetCredits(
  sample: AgentUsageSample | null,
): AgentUsageResetCredits | null {
  const details = getAgentUsageStatusDetails(sample)
  const usageCredits = details?.usageCredits

  if (!isStatusDetailRecord(usageCredits)) {
    return null
  }

  const availableCount =
    typeof usageCredits.availableCount === 'number' &&
    Number.isFinite(usageCredits.availableCount)
      ? Math.max(0, Math.floor(usageCredits.availableCount))
      : 0
  const credits = Array.isArray(usageCredits.credits)
    ? usageCredits.credits
        .filter(isStatusDetailRecord)
        .map((credit) => ({
          id: optionalDetailString(credit.id),
          resetType: optionalDetailString(credit.resetType),
          title: optionalDetailString(credit.title),
          description: optionalDetailString(credit.description),
          status:
            optionalDetailString(credit.status) ?? 'unknown',
          grantedAt: optionalDetailString(credit.grantedAt),
          expiresAt: optionalDetailString(credit.expiresAt),
        }))
    : []

  return { availableCount, credits }
}

export function formatAgentUsageResetCreditStatus(status: string): string {
  return {
    available: 'Disponível',
    redeeming: 'Em processamento',
    redeemed: 'Já usado',
    unknown: 'Status não informado',
  }[status] ?? status
}

export function formatAgentUsageResetCreditType(resetType: string | null): string {
  return resetType === 'codexRateLimits' ? 'Limites do Codex' : resetType ?? 'Tipo não informado'
}

function isStatusDetailRecord(
  value: AgentUsageStatusDetailValue | undefined,
): value is { [key: string]: AgentUsageStatusDetailValue } {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function optionalDetailString(value: AgentUsageStatusDetailValue | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

export function summarizeAgentUsage(
  accounts: AgentUsageAccount[],
  now: () => number = Date.now,
): Record<AgentUsageStatus, number> {
  const summary: Record<AgentUsageStatus, number> = {
    current: 0,
    stale: 0,
    unavailable: 0,
    error: 0,
  }

  for (const account of accounts) {
    summary[getAccountStatus(account, now)] += 1
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

/**
 * Aviso da última falha de uma conta quando o card mostra um valor antigo.
 *
 * Com a consulta atual em erro, o card cai para o último valor conhecido — e
 * a falha sumia atrás dele: quem olhava não sabia que o número era velho nem
 * por quê (task "reconectar o monitor quando o Claude dessincroniza"). Sem
 * valor na tela, o próprio card já mostra a mensagem de erro; aí não há aviso
 * a mais.
 */
export function getAgentUsageLastFailureNotice(
  account: Pick<AgentUsageAccount, 'latestSample'>,
  shownSample: AgentUsageSample | null,
): { message: string; at: string } | null {
  const latest = account.latestSample
  if (!shownSample?.metrics.length) return null
  if (!latest || latest.status !== 'error' || !latest.errorMessage) return null
  return { message: latest.errorMessage, at: latest.collectedAt }
}
