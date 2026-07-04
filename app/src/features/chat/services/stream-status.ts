// Interpretação de status de streaming/orquestração para exibição no chat:
// rótulos de progresso de runs e inferência de disponibilidade de modelo a
// partir de mensagens de erro das CLIs. Funções puras.
import { normalizePromptText } from './cli-prompt'
import type {
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

export function inferAvailabilityStatus(
  message: string,
): ModelAvailabilityStatus | null {
  const normalizedMessage = normalizePromptText(message)

  if (
    normalizedMessage.includes('out of extra usage') ||
    normalizedMessage.includes('usage limit') ||
    normalizedMessage.includes('rate limit') ||
    normalizedMessage.includes('too many requests') ||
    normalizedMessage.includes('quota exceeded') ||
    normalizedMessage.includes('exceeded your current quota') ||
    normalizedMessage.includes('resource exhausted') ||
    /\b429\b/.test(normalizedMessage)
  ) {
    return 'limit_reached'
  }

  if (
    normalizedMessage.includes('not logged in') ||
    normalizedMessage.includes('please login') ||
    normalizedMessage.includes('please log in') ||
    normalizedMessage.includes('authentication failed') ||
    normalizedMessage.includes('unauthorized') ||
    normalizedMessage.includes('invalid api key') ||
    /\b401\b/.test(normalizedMessage)
  ) {
    return 'no_login'
  }

  return null
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
