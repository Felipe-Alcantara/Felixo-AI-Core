/**
 * Formatação pura da cadeia de contas para a interface.
 *
 * O renderer só consome o que o processo principal decidiu (elegibilidade,
 * ordem, espera); aqui mora apenas a tradução desses fatos para texto em
 * pt-BR, sem regra de negócio. Tudo recebe o relógio e o fuso por parâmetro,
 * para os testes não dependerem da máquina.
 *
 * Glossário fixo (§12.8): apta, em espera, fora, fixa, cadeia, Automática,
 * cobrança por uso, assinatura, continuação. "Limite" nunca nomeia erro de
 * rede ou de servidor.
 */
import type {
  AccountBillingClass,
  AccountCapacity,
  AccountChainConfirmErrorCode,
  AccountChainDetection,
  AccountChainExclusion,
  AccountChainMember,
  AccountChainMemberUpdate,
  AccountChainProviderId,
  AccountChainState,
  AccountChainStrategy,
  AccountCooldown,
  AccountCooldownUntilSource,
  AccountFailureClass,
  AccountIneligibilityReason,
  AccountLoginCheck,
  AccountMode,
  AccountMultiplierSource,
  AccountSwitchCandidate,
  AccountSwitchHistoryEntry,
  AccountSwitchKind,
  AccountSwitchProposal,
  AccountSwitchState,
} from '../../shared/types/account-chain'
import { formatRelativeTime } from '../components/notification-time'

export type TimeOptions = {
  /** Fuso IANA; ausente = o da máquina. */
  timeZone?: string
}

/** Prefixo das sessões PTY dos blocos do canvas (`terminal-session-store.ts`). */
const CANVAS_SESSION_PREFIX = 'canvas:'

export function ptySessionIdForNode(nodeId: string): string {
  return `${CANVAS_SESSION_PREFIX}${nodeId}`
}

/** Id do bloco a partir da sessão PTY; `null` quando a sessão não é de um bloco. */
export function nodeIdFromPtySessionId(sessionId: string | null | undefined): string | null {
  if (!sessionId || !sessionId.startsWith(CANVAS_SESSION_PREFIX)) return null
  const nodeId = sessionId.slice(CANVAS_SESSION_PREFIX.length)
  return nodeId || null
}

const PROVIDER_LABELS: Record<AccountChainProviderId, string> = {
  codex: 'Codex',
  claude: 'Claude',
  gemini: 'Gemini',
  openia: 'Openia',
}

export function providerLabel(providerId: string | null | undefined): string {
  if (!providerId) return 'provedor desconhecido'
  return PROVIDER_LABELS[providerId as AccountChainProviderId] ?? providerId
}

export type StrategyOption = {
  value: AccountChainStrategy
  label: string
  description: string
}

export const STRATEGY_OPTIONS: readonly StrategyOption[] = [
  {
    value: 'manual',
    label: 'Ordem manual',
    description: 'Propõe a primeira conta apta na ordem desta lista.',
  },
  {
    value: 'round_robin',
    label: 'Rodízio',
    description: 'Propõe a próxima conta apta depois da última que recebeu uma troca.',
  },
  {
    value: 'most_capacity',
    label: 'Mais quota primeiro',
    description:
      'Capacidade = restante% × multiplicador do plano (50% com 20x vale mais que 100% com 1x). Sem medição atual, a conta vai para o fim.',
  },
  {
    value: 'subscription_first',
    label: 'Assinatura antes de uso',
    description: 'Contas de assinatura primeiro, depois as de cobrança desconhecida e por último as de cobrança por uso.',
  },
]

export function strategyLabel(strategy: AccountChainStrategy): string {
  return STRATEGY_OPTIONS.find((option) => option.value === strategy)?.label ?? strategy
}

const FAILURE_CLASS_LABELS: Record<AccountFailureClass, string> = {
  limit: 'limite de uso',
  billing: 'falta de crédito',
  auth: 'perda de login',
  network: 'falha de rede',
  provider: 'falha do provedor',
  timeout: 'tempo esgotado',
  cancelled: 'cancelamento',
  unknown: 'falha desconhecida',
}

/** Motivo em linguagem simples. Rede e servidor nunca viram "limite". */
export function failureClassLabel(failureClass: AccountFailureClass | null | undefined): string {
  if (!failureClass) return 'escolha da cadeia'
  return FAILURE_CLASS_LABELS[failureClass] ?? FAILURE_CLASS_LABELS.unknown
}

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isFinite(date.getTime()) ? date : null
}

/** "14:32" no horário local (ou no fuso pedido). */
export function formatClockTime(iso: string | null | undefined, options: TimeOptions = {}): string {
  const date = toDate(iso)
  if (!date) return 'horário desconhecido'
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: options.timeZone,
  }).format(date)
}

/** "28/09/2026 14:32", para a aba Trocas, onde a data importa. */
export function formatDateTime(iso: string | null | undefined, options: TimeOptions = {}): string {
  const date = toDate(iso)
  if (!date) return 'data desconhecida'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: options.timeZone,
  }).format(date)
}

/** "há 2 min" / "agora". */
export function formatAgo(iso: string | null | undefined, nowMs: number): string {
  const date = toDate(iso)
  if (!date) return ''
  const relative = formatRelativeTime(date.getTime(), nowMs)
  return relative === 'agora' ? 'agora' : `há ${relative}`
}

const UNTIL_SOURCE_LABELS: Record<AccountCooldownUntilSource, string> = {
  medicao: 'medido',
  texto: 'horário impresso pela CLI',
  texto_fuso_local: 'horário impresso pela CLI, no fuso local',
  padrao: 'estimado pelo padrão',
  checagem: 'até nova checagem de login',
}

export function untilSourceLabel(source: AccountCooldownUntilSource): string {
  return UNTIL_SOURCE_LABELS[source] ?? source
}

/**
 * Espera da conta em uma linha: "em espera até 16:40 · fonte: horário impresso
 * pela CLI". Auth e billing não têm horário: esperam uma ação.
 */
export function formatCooldown(cooldown: AccountCooldown | null, options: TimeOptions = {}): string {
  if (!cooldown) return ''
  if (cooldown.needsCheck) {
    return 'espera vencida · precisa conferir o login antes de voltar'
  }
  if (!cooldown.untilAt) {
    return cooldown.failureClass === 'billing'
      ? 'em espera até recarregar e conferir o login'
      : 'em espera até conferir o login de novo'
  }
  const main = `em espera até ${formatClockTime(cooldown.untilAt, options)} · fonte: ${untilSourceLabel(cooldown.untilSource)}`
  if (cooldown.alternativeUntilAt && cooldown.alternativeUntilSource) {
    return `${main} (${untilSourceLabel(cooldown.alternativeUntilSource)}: ${formatClockTime(cooldown.alternativeUntilAt, options)})`
  }
  return main
}

const NUMBER_FORMAT = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 1,
  useGrouping: false,
})

export function formatNumber(value: number): string {
  return NUMBER_FORMAT.format(value)
}

/**
 * Capacidade absoluta com a conta aberta: "1000 = 50% × 20x · medido às
 * 14:02". Sem medição atual, diz isso — nunca inventa 0 ou 100.
 */
export function formatCapacity(
  capacity: AccountCapacity,
  multiplier: number,
  options: TimeOptions = {},
): string {
  if (!capacity.comparable) {
    return 'não comparável (créditos em dinheiro, não em %)'
  }
  if (capacity.value === null || capacity.remainingPercent === null) {
    return capacity.lastMeasuredAt
      ? `sem medição atual (última às ${formatClockTime(capacity.lastMeasuredAt, options)})`
      : 'sem medição atual'
  }
  const measured = capacity.measuredAt
    ? ` · medido às ${formatClockTime(capacity.measuredAt, options)}`
    : ''
  return `${formatNumber(capacity.value)} = ${formatNumber(capacity.remainingPercent)}% × ${formatNumber(multiplier)}x${measured}`
}

/** Multiplicador com a fonte e a divergência entre CLI e declaração. */
export function formatMultiplier(params: {
  multiplier: number
  source: AccountMultiplierSource
  declared: number | null
  detected: number | null
}): string {
  if (params.source === 'nao_declarado') return 'não declarado (vale 1)'
  if (params.source === 'declarado') return `${formatNumber(params.multiplier)}x · declarado`
  const base = `${formatNumber(params.multiplier)}x · informado pela CLI`
  if (params.declared !== null && params.detected !== null && params.declared !== params.detected) {
    return `${base} (você declarou ${formatNumber(params.declared)}x, a CLI informa ${formatNumber(params.detected)}x)`
  }
  return base
}

const BILLING_LABELS: Record<AccountBillingClass, string> = {
  assinatura: 'assinatura',
  uso: 'cobrança por uso',
}

/**
 * Cobrança efetiva: vale a declarada; sem ela, a detectada. Se as duas
 * divergem, é desconhecida (nunca presumida assinatura) e o texto mostra as
 * duas.
 */
export function formatBilling(
  declared: AccountBillingClass | null,
  detected: AccountBillingClass | null,
): string {
  if (declared && detected && declared !== detected) {
    return `cobrança desconhecida (declarada: ${BILLING_LABELS[declared]}; detectada: ${BILLING_LABELS[detected]})`
  }
  if (declared) return `${BILLING_LABELS[declared]} (declarada)`
  if (detected) return `${BILLING_LABELS[detected]} (detectada)`
  return 'cobrança não declarada'
}

/** A cobrança efetiva é por uso? Só aí o diálogo destaca o custo. */
export function isUsageBilling(
  declared: AccountBillingClass | null,
  detected: AccountBillingClass | null,
): boolean {
  if (declared && detected && declared !== detected) return false
  return (declared ?? detected) === 'uso'
}

/** Login em uma linha: "conferido pela CLI há 3 min (checagem local)". */
export function formatLogin(login: AccountLoginCheck | null, nowMs: number): string {
  if (!login) return 'login não conferido'
  const when = formatAgo(login.checkedAt, nowMs)
  switch (login.status) {
    case 'logged_in':
      return login.source === 'amostra_do_painel'
        ? `conferido pelo painel de uso ${when}`
        : `conferido pela CLI ${when} (checagem local)`
    case 'logged_out':
      return `sem login na última checagem (${when})`
    case 'cli_ausente':
      return 'a CLI não está instalada'
    case 'tempo_esgotado':
      return `a checagem demorou demais (${when})`
    case 'erro':
      return `a checagem falhou (${when})`
    case 'sem_checagem':
      return 'o app ainda não confere o login deste provedor'
    default:
      return `login incerto (${when})`
  }
}

const INELIGIBILITY_TEXT: Record<AccountIneligibilityReason, string> = {
  'cadeia-desligada': 'a cadeia está desligada',
  'membro-desabilitado': 'não habilitada na cadeia',
  'conta-removida': 'a conta não existe mais',
  'sem-checagem-de-login': 'fora da cadeia até o app conferir o login deste provedor',
  'sem-chave': 'sem chave configurada',
  'em-espera': 'em espera',
  'esgotada-pela-medicao': 'esgotada pela medição atual',
  'login-nao-conferido': 'login não conferido há pouco',
  deslogada: 'sem login',
  'cli-ausente': 'a CLI não está instalada',
  'tempo-esgotado': 'a checagem de login demorou demais',
  'identidade-diferente': 'a CLI informa outra conta',
  'identidade-duplicada': 'é a mesma conta de outra da lista',
  origem: 'é a conta de origem',
  'ja-visitada-na-linhagem': 'já foi usada nesta sequência de trocas',
}

/** Texto da razão; prefere o que o main mandou e cai no glossário local. */
export function ineligibilityText(
  reason: AccountIneligibilityReason | null,
  reasonText?: string | null,
): string {
  if (reasonText?.trim()) return reasonText.trim()
  if (!reason) return ''
  return INELIGIBILITY_TEXT[reason] ?? reason
}

const SWITCH_STATE_LABELS: Record<AccountSwitchState, string> = {
  noticed: 'aviso',
  proposed: 'proposta aberta',
  confirmed: 'confirmada',
  spawning: 'abrindo o bloco',
  spawned: 'bloco aberto',
  declined: 'recusada',
  dismissed: 'não era limite',
  expired: 'expirada',
  superseded: 'substituída',
  spawn_failed: 'o bloco não abriu',
  no_candidate: 'nenhuma conta apta',
  accepted: 'aceita',
  refused: 'recusada',
}

export function switchStateLabel(state: AccountSwitchState): string {
  return SWITCH_STATE_LABELS[state] ?? state
}

const SWITCH_KIND_LABELS: Record<AccountSwitchKind, string> = {
  continuation: 'continuação',
  launch: 'Automática (cadeia)',
  manual: 'passagem manual',
  notice: 'aviso',
  provider_switch: 'troca de provedor no chat',
}

export function switchKindLabel(kind: AccountSwitchKind): string {
  return SWITCH_KIND_LABELS[kind] ?? kind
}

function endpointLabel(label: string | null, accountId: string | null, providerId: string | null): string {
  const provider = providerLabel(providerId)
  if (!accountId) return `Login do sistema (${provider})`
  return `${label?.trim() || 'conta sem nome'} (${provider})`
}

export type AccountSwitchHistoryRow = {
  id: string
  /** ISO do momento mais relevante (spawn > decisão > proposta). */
  at: string
  when: string
  whenRelative: string
  route: string
  reason: string
  kindLabel: string
  stateLabel: string
  /** Bloco de destino (ou de origem) para "Ir para o bloco". */
  nodeId: string | null
}

export function toHistoryRow(
  entry: AccountSwitchHistoryEntry,
  nowMs: number,
  options: TimeOptions = {},
): AccountSwitchHistoryRow {
  const at = entry.spawnedAt ?? entry.decidedAt ?? entry.proposedAt
  const from = endpointLabel(entry.from.label, entry.from.accountId, entry.from.providerId)
  const to = entry.to
    ? endpointLabel(entry.to.label, entry.to.accountId, entry.to.providerId)
    : null
  return {
    id: entry.id,
    at,
    when: formatDateTime(at, options),
    whenRelative: formatAgo(at, nowMs),
    route: to ? `${from} → ${to}` : from,
    reason: entry.reason.trim() || failureClassLabel(entry.failureClass),
    kindLabel: switchKindLabel(entry.kind),
    stateLabel: switchStateLabel(entry.state),
    nodeId:
      nodeIdFromPtySessionId(entry.targetSessionId) ?? nodeIdFromPtySessionId(entry.sourceSessionId),
  }
}

/** Linha de resumo do topo da aba Cadeia. */
export function summarizeChain(state: AccountChainState): string {
  if (!state.settings.enabled) {
    return 'Desligada: nenhum bloco troca de conta.'
  }
  const enabled = state.members.filter((member) => member.enabled && !member.locked)
  if (enabled.length === 0) {
    return 'Ligada · 0 contas habilitadas: habilite as que podem receber trocas.'
  }
  const eligible = enabled.filter((member) => member.eligible).length
  const contas = enabled.length === 1 ? 'conta habilitada' : 'contas habilitadas'
  const aptas = eligible === 1 ? 'apta agora' : 'aptas agora'
  return `Ligada · ${enabled.length} ${contas}, ${eligible} ${aptas} · ${strategyLabel(state.settings.strategy)}.`
}

/** Membros como o canal `update-members` recebe: a lista inteira, na ordem. */
export function toMemberUpdates(members: readonly AccountChainMember[]): AccountChainMemberUpdate[] {
  return members.map((member) => ({
    accountId: member.accountId,
    enabled: member.enabled,
    billingDeclared: member.billingDeclared,
    multiplierDeclared: member.multiplierDeclared,
  }))
}

/**
 * Move um membro `delta` posições (−1 sobe, +1 desce). Fora dos limites
 * devolve `null`: a UI não manda nada ao main.
 */
export function moveMember<T extends { accountId: string }>(
  members: readonly T[],
  accountId: string,
  delta: -1 | 1,
): T[] | null {
  const index = members.findIndex((member) => member.accountId === accountId)
  const target = index + delta
  if (index < 0 || target < 0 || target >= members.length) return null
  const next = [...members]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/** "Pessoal agora é a 2ª", anunciado pelo `aria-live` depois de mover. */
export function positionAnnouncement(label: string, index: number): string {
  return `${label.trim() || 'Conta'} agora é a ${index + 1}ª`
}

export type ChainMoveOutcome = { moved: true; accountId: string; announcement: string } | { moved: false }

/**
 * Move uma conta na ordem da cadeia e diz o que anunciar. Só um `ok` do main
 * move de fato: recusa, conflito de revisão ou tela ocupada (`busy`, por
 * exemplo durante "Conferir agora") não anunciam posição nova nem fazem o
 * foco seguir a linha — senão o leitor de tela ouviria uma ordem que não
 * mudou e um push qualquer tiraria o foco de onde a pessoa está.
 */
export async function moveChainMember<T extends { accountId: string; label: string }>(params: {
  members: readonly T[]
  accountId: string
  delta: -1 | 1
  busy: boolean
  save: (next: T[]) => Promise<{ ok: boolean } | null>
}): Promise<ChainMoveOutcome> {
  if (params.busy) return { moved: false }
  const next = moveMember(params.members, params.accountId, params.delta)
  if (!next) return { moved: false }
  const result = await params.save(next)
  if (!result?.ok) return { moved: false }
  const index = next.findIndex((item) => item.accountId === params.accountId)
  return {
    moved: true,
    accountId: params.accountId,
    announcement: positionAnnouncement(next[index].label, index),
  }
}

/**
 * Lê o multiplicador digitado. Vazio = não declarado (`null`); fora de 1 a
 * 100 ou não numérico = inválido (a UI não manda).
 */
export function parseMultiplierInput(text: string): { ok: true; value: number | null } | { ok: false } {
  const trimmed = text.trim().replace(/x$/i, '').trim().replace(',', '.')
  if (!trimmed) return { ok: true, value: null }
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 1 || value > 100) return { ok: false }
  return { ok: true, value: Math.round(value * 10) / 10 }
}

/**
 * Selo do bloco: "Pessoal · fixa", "Pessoal · cadeia" ou "Login do sistema".
 * Sem modo gravado o bloco é fixo (decisão 5).
 */
export function accountChipLabel(params: {
  accountId?: string | null
  accountLabel?: string | null
  accountMode?: AccountMode | null
}): { text: string; title: string } {
  if (!params.accountId) {
    return {
      text: 'Login do sistema',
      title: 'Login do sistema: a sessão atual do computador. Nunca é destino da cadeia.',
    }
  }
  const label = params.accountLabel?.trim() || 'conta sem nome'
  if (params.accountMode === 'chain') {
    return {
      text: `${label} · cadeia`,
      title: `Conta ${label}, escolhida pela cadeia. Se bater o limite, a cadeia propõe outra conta e pede sua confirmação.`,
    }
  }
  return {
    text: `${label} · fixa`,
    title: `Conta ${label}, fixa neste bloco. Se bater o limite, você recebe um aviso; nada troca sozinho.`,
  }
}

/**
 * Por que a conta está nesta posição (§7.1), para o "Recomendada" e para a
 * prévia de "Automática (cadeia)".
 */
export function explainCandidateRank(
  strategy: AccountChainStrategy,
  candidate: Pick<
    AccountSwitchCandidate,
    'capacity' | 'multiplier' | 'billingDeclared' | 'billingDetected'
  >,
  index: number,
  options: TimeOptions = {},
): string {
  const ordinal = `${index + 1}ª`
  switch (strategy) {
    case 'round_robin':
      return index === 0 ? 'próxima do rodízio' : `${ordinal} no rodízio`
    case 'most_capacity':
      return candidate.capacity.value === null
        ? 'sem medição atual, não comparada'
        : `${index === 0 ? 'maior capacidade' : 'capacidade'}: ${formatCapacity(candidate.capacity, candidate.multiplier, options)}`
    case 'subscription_first': {
      const billing = candidate.billingDeclared ?? candidate.billingDetected
      const conflicting =
        candidate.billingDeclared !== null &&
        candidate.billingDetected !== null &&
        candidate.billingDeclared !== candidate.billingDetected
      if (!conflicting && billing === 'assinatura') return 'assinatura primeiro'
      if (!conflicting && billing === 'uso') return 'cobrança por uso fica por último'
      return 'cobrança desconhecida, depois das assinaturas'
    }
    default:
      return `${ordinal} apta na ordem manual`
  }
}

function candidateName(candidate: { label: string; providerId: string }): string {
  return `${candidate.label.trim() || 'conta sem nome'} (${providerLabel(candidate.providerId)})`
}

/** "A cadeia vai usar: Trabalho (Codex) · 1ª apta na ordem manual." */
export function chainLaunchSummary(proposal: AccountSwitchProposal): string | null {
  const index = proposal.candidates.findIndex(
    (candidate) => candidate.accountId === proposal.recommendedAccountId,
  )
  if (index < 0) return null
  const candidate = proposal.candidates[index]
  return `A cadeia vai usar: ${candidateName(candidate)} · ${explainCandidateRank(proposal.strategy, candidate, index)}.`
}

/** Motivos de "nenhuma conta apta", um por conta. */
export function exclusionsText(reasons: readonly AccountChainExclusion[]): string {
  if (reasons.length === 0) return 'Nenhuma conta deste provedor está habilitada na cadeia.'
  return reasons
    .map((reason) => `${candidateName(reason)}: ${ineligibilityText(reason.reason, reason.reasonText)}`)
    .join('; ')
}

const CONFIRM_ERROR_TEXT: Record<AccountChainConfirmErrorCode, string> = {
  SUPERSEDED: 'A conta recomendada mudou desde que a lista foi montada. Confira a nova lista e confirme de novo.',
  EXPIRED: 'A proposta expirou. Nada foi aberto.',
  SOURCE_ACTIVE: 'O terminal antigo ainda está produzindo saída.',
  NOT_ELIGIBLE: 'A conta escolhida deixou de estar apta. Confira a lista atualizada.',
  NOT_PENDING: 'Esta proposta já foi decidida em outro lugar. Nada foi aberto.',
}

/** Texto de uma recusa do `confirm`; código desconhecido cai numa frase genérica. */
export function confirmErrorText(code: string | undefined, message?: string): string {
  if (code && code in CONFIRM_ERROR_TEXT) {
    return CONFIRM_ERROR_TEXT[code as AccountChainConfirmErrorCode]
  }
  return message?.trim() || 'Não foi possível confirmar a troca. Nada foi aberto.'
}

// ---------------------------------------------------------------------------
// Faixas do bloco e item fixo das notificações
// ---------------------------------------------------------------------------

export type TerminalChainBannerAction =
  | 'view-options'
  | 'not-a-limit'
  | 'pass-responsibility'
  | 'treat-as-limit'
  | 'ignore'
  | 'dismiss'
  | 'relogin'
  | 'go-to-successor'

export type TerminalChainBanner = {
  key: string
  tone: 'warning' | 'info'
  text: string
  actions: TerminalChainBannerAction[]
  proposalId: string | null
  detectionId: string | null
  accountId: string | null
  reasonClass: AccountFailureClass | null
  detectedAt: string | null
  successorNodeId: string | null
}

function capitalizeFirst(text: string): string {
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text
}

function whereText(accountId: string | null, label: string | null): string {
  return accountId ? `da conta ${label?.trim() || 'sem nome'}` : 'no Login do sistema'
}

/**
 * Faixas de um bloco (§8.1, §9.2), fora do botão da prévia: a proposta aberta,
 * a última detecção e o "continuado em". Nenhuma delas abre diálogo sozinha.
 */
export function buildTerminalChainBanners(params: {
  detection: AccountChainDetection | null
  proposal: AccountSwitchProposal | null
  successor: {
    nodeId: string
    label: string
    at: string | null
    reasonClass: AccountFailureClass | null
  } | null
  timeOptions?: TimeOptions
}): TerminalChainBanner[] {
  const time = params.timeOptions ?? {}
  const banners: TerminalChainBanner[] = []
  const { detection, proposal } = params

  if (proposal) {
    const cooldown = formatCooldown(proposal.cooldown, time)
    banners.push({
      key: `proposta:${proposal.id}`,
      tone: 'warning',
      text: [
        `${capitalizeFirst(failureClassLabel(proposal.failureClass))} ${whereText(proposal.from.accountId, proposal.from.label)} às ${formatClockTime(proposal.detectedAt, time)}`,
        cooldown,
        'a cadeia tem uma proposta de troca',
      ]
        .filter(Boolean)
        .join(' · '),
      actions: proposal.failureClass === 'limit' ? ['view-options', 'not-a-limit'] : ['view-options'],
      proposalId: proposal.id,
      detectionId: null,
      accountId: proposal.from.accountId,
      reasonClass: proposal.failureClass,
      detectedAt: proposal.detectedAt,
      successorNodeId: null,
    })
  } else if (detection) {
    banners.push(detectionBanner(detection, time))
  }

  if (params.successor) {
    const at = params.successor.at ? ` às ${formatClockTime(params.successor.at, time)}` : ''
    const why = params.successor.reasonClass
      ? ` por ${failureClassLabel(params.successor.reasonClass)}`
      : ''
    banners.push({
      key: `sucessor:${params.successor.nodeId}`,
      tone: 'info',
      text: `Parado${why} · continuado em ${params.successor.label.trim() || 'outro bloco'}${at}`,
      actions: ['go-to-successor'],
      proposalId: null,
      detectionId: null,
      accountId: null,
      reasonClass: null,
      detectedAt: null,
      successorNodeId: params.successor.nodeId,
    })
  }

  return banners
}

function detectionBanner(detection: AccountChainDetection, time: TimeOptions): TerminalChainBanner {
  const at = formatClockTime(detection.detectedAt, time)
  const where = whereText(detection.accountId, detection.accountLabel)
  const base = {
    key: `deteccao:${detection.id}`,
    proposalId: detection.proposalId,
    detectionId: detection.id,
    accountId: detection.accountId,
    reasonClass: detection.failureClass,
    detectedAt: detection.detectedAt,
    successorNodeId: null,
  }

  if (detection.outcome === 'ambiguous') {
    return {
      ...base,
      tone: 'warning',
      text: `Possível limite ${where} às ${at}. Tratar como limite?`,
      actions: ['treat-as-limit', 'ignore'],
    }
  }
  if (detection.outcome === 'source_resumed') {
    return {
      ...base,
      tone: 'info',
      text: 'Este terminal voltou a trabalhar na conta antiga; há outro bloco continuando o mesmo trabalho.',
      actions: ['dismiss'],
    }
  }
  if (detection.outcome === 'informational') {
    return {
      ...base,
      tone: 'info',
      text:
        detection.failureClass === 'limit' && detection.scope === 'model'
          ? `Limite do modelo nesta conta às ${at}; trocar de modelo resolve.`
          : `${capitalizeFirst(failureClassLabel(detection.failureClass))} às ${at}; trocar de conta não resolve.`,
      actions: ['dismiss'],
    }
  }

  const cooldown = formatCooldown(detection.cooldown, time)
  const context =
    detection.outcome === 'no_candidate'
      ? `nenhuma conta apta: ${exclusionsText(detection.exclusions)}`
      : !detection.accountId
        ? 'Login do sistema: só aviso'
        : detection.accountMode === 'chain'
          ? 'a cadeia não propôs troca'
          : 'bloco fixo: nada troca sozinho'
  const prefix = detection.postSwitchFailure ? 'A conta de destino falhou logo após a troca. ' : ''
  const text = `${prefix}${capitalizeFirst(failureClassLabel(detection.failureClass))} ${where} às ${at}${cooldown ? ` · ${cooldown}` : ''} · ${context}`
  const actions: TerminalChainBannerAction[] = []
  if (detection.failureClass === 'auth') actions.push('relogin')
  actions.push('pass-responsibility')
  if (detection.failureClass === 'limit' && detection.accountId && detection.cooldown) {
    actions.push('not-a-limit')
  }
  actions.push('dismiss')
  return { ...base, tone: 'warning', text, actions }
}

export type PendingProposalGroup = {
  key: string
  proposalIds: string[]
  /** Proposta aberta ao clicar em "Ver opções" (a mais antiga do grupo). */
  firstProposalId: string
  text: string
}

/**
 * Item fixo das notificações (§8.1): propostas pendentes agrupadas pela
 * mesma detecção da mesma conta — "Conta Pessoal (Codex) bateu o limite em 3
 * blocos". Propostas `launch` são da abertura em curso e não entram.
 */
export function groupPendingProposals(
  proposals: readonly AccountSwitchProposal[],
): PendingProposalGroup[] {
  const groups = new Map<string, AccountSwitchProposal[]>()
  for (const proposal of proposals) {
    if (proposal.kind !== 'continuation' || proposal.state !== 'proposed') continue
    const key = proposal.incidentKey ?? proposal.id
    groups.set(key, [...(groups.get(key) ?? []), proposal])
  }
  return [...groups.entries()].map(([key, items]) => {
    const sorted = [...items].sort((a, b) => a.proposedAt.localeCompare(b.proposedAt))
    const first = sorted[0]
    const who = first.from.accountId
      ? `Conta ${first.from.label?.trim() || 'sem nome'} (${providerLabel(first.from.providerId)})`
      : `Login do sistema (${providerLabel(first.from.providerId)})`
    const what =
      first.failureClass === 'billing'
        ? 'ficou sem crédito'
        : first.failureClass === 'auth'
          ? 'perdeu o login'
          : 'bateu o limite'
    const where = sorted.length === 1 ? 'em 1 bloco' : `em ${sorted.length} blocos`
    return {
      key,
      proposalIds: sorted.map((item) => item.id),
      firstProposalId: first.id,
      text: `${who} ${what} ${where}`,
    }
  })
}

export const BANNER_ACTION_LABELS: Record<TerminalChainBannerAction, string> = {
  'view-options': 'Ver opções',
  'not-a-limit': 'Não era limite',
  'pass-responsibility': 'Passar responsabilidade…',
  'treat-as-limit': 'Sim, tratar como limite',
  ignore: 'Ignorar',
  dismiss: 'Dispensar',
  relogin: 'Refazer login neste terminal',
  'go-to-successor': 'Ir para o bloco novo',
}
