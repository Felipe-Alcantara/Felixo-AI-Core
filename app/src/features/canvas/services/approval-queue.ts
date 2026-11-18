// Fila única de aprovações pendentes dos agentes. Funções puras: junta o que
// já existe (pedidos de decisão do orquestrador/CLIs e perguntas de agente) num
// só modelo de visão. Quem decide continua sendo o processo principal; aqui só
// se ordena, se descreve e se encaminha a resposta ao mesmo IPC de sempre.
import {
  describeProviderSwitchError,
  formatProviderLabel,
  formatProviderSwitchActions,
  formatProviderSwitchDetails,
  formatProviderSwitchTimeoutNote,
  formatProviderSwitchTitle,
} from '../../chat/services/provider-switch'
import type { ProviderSwitchRequest, ProviderSwitchRespondResult } from '../../chat/types'
import type { CanvasAgentQuestion } from '../types'

export type ApprovalAction = {
  /** `accept`/`refuse` (decisão) ou `option:<índice>`/`dismiss` (pergunta). */
  id: string
  label: string
  tone: 'accept' | 'refuse' | 'neutral'
  /** Explicação curta da opção, quando o agente mandou uma. */
  hint?: string
}

export type ApprovalItem = {
  key: string
  source: 'decision' | 'question'
  /** Id do pedido no processo principal (decisionId ou id do arquivo de pedido). */
  requestId: string
  title: string
  details: string[]
  origin: string
  requestedAt: number
  /** O que acontece se ninguém responder. */
  timeoutNote: string
  actions: ApprovalAction[]
}

function toMs(iso: string | undefined) {
  const ms = Date.parse(iso ?? '')
  return Number.isNaN(ms) ? 0 : ms
}

function describeDecisionOrigin(request: ProviderSwitchRequest) {
  const who = request.agentId === 'conversa' ? 'Conversa' : `Sub-agente ${request.agentId}`
  return `${who} (${formatProviderLabel(request.toCliType)})`
}

function fromDecision(request: ProviderSwitchRequest): ApprovalItem {
  const labels = formatProviderSwitchActions(request)
  return {
    key: `decision:${request.decisionId}`,
    source: 'decision',
    requestId: request.decisionId,
    title: formatProviderSwitchTitle(request),
    details: formatProviderSwitchDetails(request),
    origin: describeDecisionOrigin(request),
    requestedAt: toMs(request.requestedAt),
    timeoutNote: formatProviderSwitchTimeoutNote(request),
    actions: [
      { id: 'accept', label: labels.accept, tone: 'accept' },
      { id: 'refuse', label: labels.refuse, tone: 'refuse' },
    ],
  }
}

function fromQuestion(question: CanvasAgentQuestion): ApprovalItem {
  return {
    key: `question:${question.id}`,
    source: 'question',
    requestId: question.id,
    title: question.pergunta,
    details: [],
    origin: question.origem ? `Pergunta de um agente em ${question.origem}` : 'Pergunta de um agente',
    requestedAt: toMs(question.pedidoEm),
    timeoutNote: 'sem resposta, o agente continua esperando.',
    actions: [
      ...question.opcoes.map((opcao, indice): ApprovalAction => ({
        id: `option:${indice}`,
        label: opcao.label,
        tone: 'neutral',
        hint: opcao.descricao,
      })),
      { id: 'dismiss', label: 'Dispensar', tone: 'refuse' },
    ],
  }
}

/** Tudo o que espera a pessoa, do pedido mais antigo ao mais novo. */
export function buildApprovalQueue(input: {
  decisions?: ProviderSwitchRequest[] | null
  questions?: CanvasAgentQuestion[] | null
}): ApprovalItem[] {
  const items = [
    ...(input.decisions ?? []).map(fromDecision),
    ...(input.questions ?? []).filter((question) => question.estado === 'pendente').map(fromQuestion),
  ]
  return items.sort((left, right) => left.requestedAt - right.requestedAt)
}

export type ApprovalTransport = {
  respondDecision: (params: { decisionId: string; accept: boolean }) => Promise<ProviderSwitchRespondResult>
  answerQuestion: (params: { id: string; indice: number | null }) => Promise<{ ok: boolean; message?: string }>
}

export type ApprovalActionResult = { ok: boolean; message?: string; stale?: boolean }

/** Encaminha o clique ao mesmo IPC que o chat e o diálogo de pergunta já usam. */
export async function runApprovalAction(
  item: ApprovalItem,
  actionId: string,
  transport: ApprovalTransport,
): Promise<ApprovalActionResult> {
  if (!item.actions.some((action) => action.id === actionId)) {
    return { ok: false, message: 'Essa ação não existe para este pedido.' }
  }

  if (item.source === 'decision') {
    const result = await transport.respondDecision({ decisionId: item.requestId, accept: actionId === 'accept' })
    if (result.ok) return { ok: true }
    // O main já não tem o pedido: só resta tirá-lo da fila.
    const stale = result.code === 'DECISION_NOT_PENDING' || result.code === 'RUN_FINISHED'
    return { ok: false, message: describeProviderSwitchError(result), stale }
  }

  const indice = actionId === 'dismiss' ? null : Number(actionId.slice('option:'.length))
  const result = await transport.answerQuestion({ id: item.requestId, indice })
  return result.ok ? { ok: true } : { ok: false, message: result.message ?? 'Não foi possível responder.' }
}
