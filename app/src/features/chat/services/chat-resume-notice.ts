import {
  describeAgentResumeForPerson,
  type AgentResumePlan,
  type AgentResumeReason,
} from '../../canvas/services/agent-session'
import { resolveAgentResumeCapability } from '../../canvas/services/agent-resume-capability'

/** O que o processo principal devolve quando a thread recomeçou por pasta ou conta diferente. */
export type ChatResumeInfo = {
  reasons: Array<Extract<AgentResumeReason, 'cwd-mismatch' | 'account-mismatch'>>
  previousCwd: string
}

/**
 * O aviso do chat para uma conversa que não foi retomada. O texto é o do
 * canvas (`describeAgentResumeForPerson`), com "chat" no lugar de "bloco" e
 * sem ID nenhum; o chat reenvia o histórico no pedido, e o aviso diz isso.
 */
export function describeChatResumeNotice(
  info: ChatResumeInfo | undefined,
  context: { command?: string; cwd?: string },
): string | null {
  if (!info || info.reasons.length === 0) return null
  const plan: AgentResumePlan = {
    outcome: 'new',
    reason: info.reasons[0],
    reasons: info.reasons,
    capability: resolveAgentResumeCapability({ provider: context.command, version: null }),
  }
  const { detail } = describeAgentResumeForPerson(plan, {
    command: context.command,
    cwd: context.cwd,
    subject: 'chat',
    reference: { version: 1, provider: 'claude', sessionId: '', cwd: info.previousCwd, capturedAt: 0 },
  })
  return `Esta conversa recomeçou sem retomar a sessão anterior da CLI. ${detail} O histórico foi reenviado no pedido.`
}
