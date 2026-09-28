// Interpretação de status de streaming/orquestração para exibição no chat:
// rótulos de progresso de runs e a disponibilidade de modelo que o processo
// principal decidiu para um erro de CLI. Funções puras.
import { normalizePromptText } from './cli-prompt'
import type {
  CliErrorFailure,
  Model,
  ModelAvailabilityStatus,
  OrchestrationRun,
} from '../types'

export function formatAwaitingAgentsStatus(agentCount: number) {
  return agentCount === 1
    ? 'Aguardando 1 sub-agente.'
    : `Aguardando ${agentCount} sub-agentes.`
}

export function formatOrchestrationStatusLabel(status: OrchestrationRun['status']) {
  if (status === 'running_orchestrator') {
    return 'Reinvocando orquestrador.'
  }

  if (status === 'waiting_agents') {
    return 'Aguardando sub-agentes.'
  }

  if (status === 'failed') {
    return 'Orquestracao falhou.'
  }

  return 'Orquestracao concluida.'
}

export function formatOrchestrationRunStatus(run: OrchestrationRun) {
  if (run.status === 'waiting_agents') {
    const activeJobs = run.agentJobs.filter(
      (job) => job.turn === run.currentTurn && job.status === 'running',
    )
    return formatAwaitingAgentsStatus(activeJobs.length || run.agentJobs.length)
  }

  if (run.status === 'running_orchestrator' && run.currentTurn > 1) {
    return `Reinvocando orquestrador (turno ${run.currentTurn}).`
  }

  return formatOrchestrationStatusLabel(run.status)
}

/**
 * Status de disponibilidade de um evento de erro, como o processo principal o
 * decidiu (`failure`, anexado em `sendCliEvent`). O chat não classifica o
 * texto: um erro sem `failure` não muda a disponibilidade, em vez de ser
 * adivinhado por palavra solta ("line 429" não é limite).
 */
export function resolveErrorAvailabilityStatus(event: {
  failure?: CliErrorFailure
}): ModelAvailabilityStatus | null {
  return event.failure?.availabilityStatus ?? null
}

export function inferAvailabilityCliType(
  message: string,
  selectedModel: Model | null,
) {
  const normalizedMessage = normalizePromptText(message)

  if (
    normalizedMessage.includes('claude') ||
    normalizedMessage.includes('anthropic') ||
    normalizedMessage.includes('extra usage')
  ) {
    return 'claude'
  }

  if (
    normalizedMessage.includes('gemini') ||
    normalizedMessage.includes('google') ||
    normalizedMessage.includes('resource exhausted')
  ) {
    return 'gemini'
  }

  if (
    normalizedMessage.includes('codex') ||
    normalizedMessage.includes('openai') ||
    normalizedMessage.includes('gpt-')
  ) {
    return 'codex'
  }

  return selectedModel?.cliType ?? 'unknown'
}

export function createSessionId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

export function createNextMessageId(messages: { id: number }[]) {
  const highestId = messages.reduce(
    (highest, message) => Math.max(highest, message.id),
    0,
  )

  return Math.max(Date.now(), highestId + 1)
}

export function findLastAssistantMessageIndex(
  messages: { role: string; sessionId?: string }[],
  sessionId: string,
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]

    if (message.role === 'assistant' && message.sessionId === sessionId) {
      return index
    }
  }

  return -1
}
