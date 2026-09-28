/**
 * Modelo de visão puro do diálogo "Trocar de conta?" (§8.2) e da montagem do
 * bloco de continuação (§9.1).
 *
 * O componente só desenha o que sai daqui; toda frase, aviso e escolha de foco
 * é decidida nesta camada, testada sem navegador. Nada aqui decide a troca:
 * a lista de aptas, a ordem e o recomendado vêm do main.
 */
import type {
  AccountChainProviderId,
  AccountFailureClass,
  AccountSwitchCandidate,
  AccountSwitchProposal,
} from '../../shared/types/account-chain'
import {
  explainCandidateRank,
  failureClassLabel,
  formatAgo,
  formatBilling,
  formatCapacity,
  formatClockTime,
  formatCooldown,
  formatLogin,
  formatMultiplier,
  ineligibilityText,
  isUsageBilling,
  providerLabel,
  type TimeOptions,
} from './account-chain-view'
import { buildAgentArgs, getAgent, type AgentId } from './agent-launch-options'

/** Saída do terminal antigo mais recente que isto conta como "ainda ativo" (§8.4). */
export const SOURCE_ACTIVE_WINDOW_MS = 5_000
/** A linha da CLI mostrada no diálogo nunca passa disto. */
const EVIDENCE_MAX_CHARS = 200

export type DialogOption = {
  accountId: string
  name: string
  recommended: boolean
  billing: string
  plan: string | null
  capacity: string
  login: string
  checkingLogin: boolean
  identity: string
  explanation: string
}

export type AccountSwitchDialogModel = {
  title: string
  /** Lido pelo leitor de tela (`aria-describedby`). */
  summary: string
  from: {
    name: string
    billing: string
    multiplier: string | null
    detected: string
    evidence: string | null
    cooldown: string
  }
  options: DialogOption[]
  /**
   * Destino marcado: o que a pessoa escolheu; sem escolha, o recomendado.
   * Recebe o foco ao abrir (nunca o botão primário). `null` = nada marcado.
   */
  initialFocusAccountId: string | null
  /**
   * A conta escolhida saiu da proposta ao vivo (por exemplo, a checagem de
   * login terminou deslogada). O destino NÃO cai na recomendada: fica sem
   * destino, com este aviso, até a pessoa escolher outra (decisão 1).
   */
  selectionLost: string | null
  excluded: Array<{ name: string; reason: string }>
  empty: boolean
  emptyText: string
  costNotice: string | null
  providerSwitchNotice: string | null
  multipleSessionsNotice: string | null
  oldTerminal: {
    untouched: string
    activity: string
    sourceActive: boolean
    autoResume: string | null
  }
  confirmLabel: string
}

function accountName(label: string | null, accountId: string | null, providerId: string): string {
  if (!accountId) return `Login do sistema (${providerLabel(providerId)})`
  return `${label?.trim() || 'conta sem nome'} (${providerLabel(providerId)})`
}

function shortBilling(declared: AccountSwitchCandidate['billingDeclared'], detected: AccountSwitchCandidate['billingDetected']): string {
  if (declared && detected && declared !== detected) return 'cobrança desconhecida'
  const billing = declared ?? detected
  return billing === 'assinatura' ? 'assinatura' : billing === 'uso' ? 'cobrança por uso' : 'cobrança não declarada'
}

function identityText(candidate: AccountSwitchCandidate): string {
  switch (candidate.login?.identityStatus) {
    case 'matched':
      return 'vinculada'
    case 'unbound':
    case 'missing':
    case null:
    case undefined:
      return 'não vinculada'
    default:
      return 'identidade a conferir'
  }
}

/** "3,2 KB, 48 linhas": fato do texto que vai, não estimativa de tokens. */
export function formatTranscriptSize(chars: number, lines: number): string {
  const kb = chars / 1024
  const size = kb < 0.1 ? `${chars} caracteres` : `${kb.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB`
  return `${size}, ${lines} ${lines === 1 ? 'linha' : 'linhas'}`
}

export function countLines(text: string): number {
  if (!text) return 0
  return text.split('\n').length
}

function truncateEvidence(evidence: string | null): string | null {
  const value = evidence?.trim()
  if (!value) return null
  return value.length > EVIDENCE_MAX_CHARS ? `${value.slice(0, EVIDENCE_MAX_CHARS - 1)}…` : value
}

export function buildAccountSwitchDialogModel(params: {
  proposal: AccountSwitchProposal
  selectedAccountId: string | null
  transcriptChars: number
  transcriptLines: number
  nowMs: number
  timeOptions?: TimeOptions
}): AccountSwitchDialogModel {
  const { proposal, nowMs } = params
  const time = params.timeOptions ?? {}
  const from = proposal.from
  const fromName = accountName(from.label, from.accountId, from.providerId)
  const fromBilling = shortBilling(from.billingDeclared, from.billingDetected)
  const reason = failureClassLabel(proposal.failureClass)
  const detectedClock = formatClockTime(proposal.detectedAt, time)

  const options: DialogOption[] = proposal.candidates.map((candidate, index) => ({
    accountId: candidate.accountId,
    name: accountName(candidate.label, candidate.accountId, candidate.providerId),
    recommended: candidate.accountId === proposal.recommendedAccountId,
    billing: formatBilling(candidate.billingDeclared, candidate.billingDetected),
    plan: candidate.planText,
    capacity: formatCapacity(candidate.capacity, candidate.multiplier, time),
    login: candidate.checkingLogin ? 'Conferindo login…' : formatLogin(candidate.login, nowMs),
    checkingLogin: candidate.checkingLogin,
    identity: identityText(candidate),
    explanation: explainCandidateRank(proposal.strategy, candidate, index, time),
  }))

  const recommended = proposal.candidates.find(
    (candidate) => candidate.accountId === proposal.recommendedAccountId,
  )
  // A escolha da pessoa vale sozinha: se ela some da proposta, não há destino
  // (nunca "a recomendada no lugar"). Sem escolha, vale a recomendada.
  const selected =
    params.selectedAccountId !== null
      ? (proposal.candidates.find((candidate) => candidate.accountId === params.selectedAccountId) ?? null)
      : (recommended ?? proposal.candidates[0] ?? null)
  const selectionLost =
    params.selectedAccountId !== null && selected === null
      ? lostSelectionText(proposal, params.selectedAccountId)
      : null

  const fromDescribed = from.accountId
    ? `${from.label?.trim() || 'conta sem nome'} (${providerLabel(from.providerId)}, ${fromBilling})`
    : fromName
  const summary = recommended
    ? `${capitalize(reason)} detectado às ${detectedClock} na conta ${fromDescribed}. Recomendada: ${recommended.label.trim() || 'conta sem nome'} (${providerLabel(recommended.providerId)}, ${shortBilling(recommended.billingDeclared, recommended.billingDetected)}).`
    : `${capitalize(reason)} detectado às ${detectedClock} na conta ${fromDescribed}. Nenhuma conta apta agora.`

  const size = formatTranscriptSize(params.transcriptChars, params.transcriptLines)
  const costNotice = selected ? buildCostNotice(selected, size) : null

  const crossProvider = selected !== null && selected.providerId !== from.providerId
  const providerSwitchNotice = crossProvider
    ? `Outro provedor: a retomada nativa não vale entre provedores. O histórico deste terminal (${size}, com segredos mascarados) será enviado a ${providerLabel(selected.providerId)}, que abre com o modelo e o esforço padrão dele.`
    : null

  const others = proposal.otherSessionsInIncident
  const multipleSessionsNotice =
    others > 0
      ? `${others === 1 ? 'Outro bloco' : `Outros ${others} blocos`} nesta conta também ${others === 1 ? 'parou' : 'pararam'}. Cada continuação que você confirmar envia o contexto dela à conta de destino.`
      : null

  const lastOutputMs = proposal.sourceLastOutputAt ? Date.parse(proposal.sourceLastOutputAt) : NaN
  const sourceActive = Number.isFinite(lastOutputMs) && nowMs - lastOutputMs < SOURCE_ACTIVE_WINDOW_MS
  const stoppedFor = Number.isFinite(lastOutputMs)
    ? `Parado há ${Math.max(0, Math.round((nowMs - lastOutputMs) / 1000))} s.`
    : 'Sem saída desde que abriu.'

  const autoResume = proposal.sourceAutoResumeAt
    ? `O Claude deste terminal está programado para continuar sozinho às ${formatClockTime(proposal.sourceAutoResumeAt, time)} na conta antiga. Isso poria dois agentes no mesmo trabalho. Se for continuar aqui, pressione Esc no terminal antigo ou feche-o.`
    : null

  return {
    title: 'Trocar de conta?',
    summary,
    from: {
      name: fromName,
      billing: formatBilling(from.billingDeclared, from.billingDetected),
      multiplier:
        from.multiplier !== null && from.multiplierSource !== null
          ? formatMultiplier({
              multiplier: from.multiplier,
              source: from.multiplierSource,
              declared: null,
              detected: null,
            })
          : null,
      detected: proposal.detectedAt
        ? `Detectado às ${formatClockTime(proposal.detectedAt, time)} (${formatAgo(proposal.detectedAt, nowMs)})`
        : 'Sem horário de detecção',
      evidence: truncateEvidence(proposal.evidence),
      cooldown: formatCooldown(proposal.cooldown, time),
    },
    options,
    initialFocusAccountId: selected?.accountId ?? null,
    selectionLost,
    excluded: proposal.excluded.map((item) => ({
      name: accountName(item.label, item.accountId, item.providerId),
      reason: ineligibilityText(item.reason, item.reasonText),
    })),
    empty: options.length === 0,
    emptyText: 'Nenhuma conta apta agora.',
    costNotice,
    providerSwitchNotice,
    multipleSessionsNotice,
    oldTerminal: {
      untouched: 'O terminal antigo não será encerrado nem receberá nada.',
      activity: sourceActive
        ? 'O terminal antigo ainda está produzindo saída.'
        : stoppedFor,
      sourceActive,
      autoResume,
    },
    confirmLabel: selected
      ? `Abrir bloco novo em ${selected.label.trim() || 'conta sem nome'}`
      : 'Abrir bloco novo',
  }
}

/**
 * Destino marcado ao abrir o diálogo: o recomendado (ou o primeiro apto). O
 * diálogo guarda isto como a escolha da pessoa, para que o destino que ela
 * viu nunca mude em silêncio quando a proposta ao vivo muda.
 */
export function initialDialogSelection(proposal: AccountSwitchProposal): string | null {
  const recommended = proposal.candidates.find(
    (candidate) => candidate.accountId === proposal.recommendedAccountId,
  )
  return (recommended ?? proposal.candidates[0])?.accountId ?? null
}

/**
 * Esc vale "Agora não" — menos enquanto o confirm está em curso: recusar ali
 * fecharia o diálogo como recusado e o bloco novo abriria mesmo assim quando
 * o confirm voltasse.
 */
export function escapeDeclines(busy: boolean): boolean {
  return !busy
}

function lostSelectionText(proposal: AccountSwitchProposal, accountId: string): string {
  const excluded = proposal.excluded.find((item) => item.accountId === accountId)
  if (!excluded) return 'A conta escolhida saiu da lista. Escolha outra para continuar.'
  const name = excluded.label.trim() || 'conta sem nome'
  const reason = ineligibilityText(excluded.reason, excluded.reasonText)
  return `A conta escolhida (${name}) deixou de estar apta${reason ? `: ${reason}` : ''}. Escolha outra para continuar.`
}

function capitalize(text: string): string {
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text
}

function buildCostNotice(candidate: AccountSwitchCandidate, size: string): string {
  const name = candidate.label.trim() || 'conta sem nome'
  const consumption =
    candidate.providerId === 'openia'
      ? `créditos por uso do OpenRouter em ${name}`
      : isUsageBilling(candidate.billingDeclared, candidate.billingDetected)
        ? `cobrança por uso da conta ${name}`
        : candidate.billingDeclared === 'assinatura' || candidate.billingDetected === 'assinatura'
          ? `a assinatura da conta ${name}`
          : `a conta ${name} (cobrança não declarada)`
  return `Abrir o bloco novo envia o contexto (${size}) como ponto de partida. O agente vai ler esse contexto e consumir ${consumption}.`
}

// ---------------------------------------------------------------------------
// Bloco de continuação
// ---------------------------------------------------------------------------

const YOLO_FLAGS = new Set([
  '--dangerously-skip-permissions',
  '--dangerously-bypass-approvals-and-sandbox',
  '--yolo',
])

export type ContinuationSource = {
  command?: string
  args?: string[]
  launchMode?: 'agent' | 'launcher'
  label?: string
}

export type ContinuationLaunch = {
  command: string
  args?: string[]
  launchMode?: 'agent' | 'launcher'
  label: string
}

/**
 * Como o bloco novo abre (§9.1). No mesmo provedor, repete comando e
 * argumentos do antigo (mesmo modelo e esforço). Em outro provedor, modelo e
 * esforço voltam ao padrão do destino; só o modo de permissão escolhido para
 * o trabalho acompanha. `null` = o destino não tem agente conhecido.
 */
export function buildContinuationLaunch(params: {
  source: ContinuationSource
  sourceProviderId: AccountChainProviderId
  destinationProviderId: AccountChainProviderId
  destinationLabel: string | null
}): ContinuationLaunch | null {
  const sourceLabel = params.source.label?.trim() || 'Terminal'
  const accountLabel = params.destinationLabel?.trim() || 'conta sem nome'
  const label = `${sourceLabel} · continuação (${accountLabel})`

  if (params.sourceProviderId === params.destinationProviderId && params.source.command) {
    return {
      command: params.source.command,
      ...(params.source.args?.length ? { args: [...params.source.args] } : {}),
      ...(params.source.launchMode ? { launchMode: params.source.launchMode } : {}),
      label,
    }
  }

  const agent = getAgent(params.destinationProviderId as AgentId)
  if (!agent) return null
  if (agent.isLauncher) {
    // O Openia pede interface e modelo que só o configurador sabe: abre o
    // menu do próprio Openia, sem inventar flags.
    return { command: agent.command, launchMode: 'launcher', label }
  }
  const yolo = (params.source.args ?? []).some((arg) => YOLO_FLAGS.has(arg))
  const args = buildAgentArgs({ agentId: agent.id, yolo }) ?? []
  return { command: agent.command, ...(args.length ? { args } : {}), label }
}

/** Motivo da continuação, para o prompt e para o registro manual. */
export type ContinuationReason = {
  failureClass: AccountFailureClass
  detectedAt: string | null
}
