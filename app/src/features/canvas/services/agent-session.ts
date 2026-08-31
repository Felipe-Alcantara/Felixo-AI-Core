import type { AgentId } from './agent-launch-options'

export type AgentSessionReference = {
  version: 1
  provider: AgentId
  sessionId: string
  cwd: string
  capturedAt: number
}

const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/

export function isAgentSessionReference(value: unknown): value is AgentSessionReference {
  if (!value || typeof value !== 'object') return false
  const reference = value as Partial<AgentSessionReference>
  return (
    reference.version === 1 &&
    (reference.provider === 'codex' ||
      reference.provider === 'claude' ||
      reference.provider === 'gemini') &&
    typeof reference.sessionId === 'string' &&
    SESSION_ID_PATTERN.test(reference.sessionId) &&
    typeof reference.cwd === 'string' &&
    reference.cwd.trim().length > 0 &&
    typeof reference.capturedAt === 'number' &&
    Number.isFinite(reference.capturedAt)
  )
}

export function canResumeAgentSession(
  command: string | undefined,
  cwd: string | undefined,
  reference: AgentSessionReference | undefined,
): boolean {
  // Gemini CLI 0.57's help only guarantees `latest` or a current numeric
  // index. The UUID remains in the persisted reference, but using it here
  // would make installations that enforce that public contract print
  // "No previous sessions found" on installations that enforce that
  // contract. Until the app can resolve the index from the exact account
  // environment at launch, an honest manual fallback is safer than guessing
  // an index (which can point to another conversation after a new session).
  if (command === 'gemini') return false

  return Boolean(
    reference &&
      command === reference.provider &&
      cwd &&
      cwd === reference.cwd &&
      isAgentSessionReference(reference),
  )
}

/**
 * Builds the provider's documented resume invocation, without a prompt.
 *
 * Codex and Claude accept the persisted conversation ID. Gemini's current
 * public CLI contract accepts `latest` or a dynamic list index instead; the
 * canvas deliberately does not turn a persisted UUID into a guessed index.
 * `canResumeAgentSession()` therefore rejects Gemini and the caller produces
 * `buildResumeFallbackNotice()` instead.
 */
export function buildAgentResumeArgs(
  command: string | undefined,
  args: readonly string[] = [],
  cwd: string | undefined,
  reference: AgentSessionReference | undefined,
): string[] | undefined {
  if (!reference || !canResumeAgentSession(command, cwd, reference)) return undefined

  switch (command) {
    case 'codex':
      return ['resume', ...args, reference.sessionId]
    case 'claude':
      return ['--resume', reference.sessionId, ...args]
    default:
      return undefined
  }
}

export function buildResumeFallbackNotice(
  reference: AgentSessionReference,
  cwd: string | undefined,
): string {
  return [
    'A conversa anterior não pôde ser retomada automaticamente.',
    `Provider associado: ${reference.provider}.`,
    cwd && cwd !== reference.cwd
      ? 'O diretório atual não coincide com o diretório da conversa; nenhum ID foi usado para evitar abrir a conversa errada.'
      : reference.provider === 'gemini'
        ? 'A versão instalada do Gemini só documenta --resume com "latest" ou índice; o índice muda quando a lista de sessões muda, então nenhum índice foi adivinhado.'
        : 'A CLI não confirmou que esse ID está disponível nesta conta.',
    `Use /resume para escolher manualmente no diretório ${cwd || reference.cwd}.`,
  ].join('\n')
}
