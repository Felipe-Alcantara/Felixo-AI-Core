import { describe, expect, it } from 'vitest'
import {
  buildAgentResumeArgs,
  buildResumeFallbackNotice,
  canResumeAgentSession,
  isAgentSessionReference,
  type AgentSessionReference,
} from './agent-session'

const reference: AgentSessionReference = {
  version: 1,
  provider: 'codex',
  sessionId: 'codex-session-123',
  cwd: '/repo',
  capturedAt: 1,
}

describe('sessão do agente do canvas', () => {
  it('valida a referência versionada e exige provider/cwd compatíveis', () => {
    expect(isAgentSessionReference(reference)).toBe(true)
    expect(canResumeAgentSession('codex', '/repo', reference)).toBe(true)
    expect(canResumeAgentSession('claude', '/repo', reference)).toBe(false)
    expect(canResumeAgentSession('codex', '/outro', reference)).toBe(false)
  })

  it('monta as formas oficiais de retomada por CLI', () => {
    expect(buildAgentResumeArgs('codex', ['--dangerously-bypass-approvals-and-sandbox'], '/repo', reference)).toEqual([
      'resume',
      '--dangerously-bypass-approvals-and-sandbox',
      'codex-session-123',
    ])
    expect(
      buildAgentResumeArgs('claude', ['--dangerously-skip-permissions'], '/repo', {
        ...reference,
        provider: 'claude',
      }),
    ).toEqual(['--resume', 'codex-session-123', '--dangerously-skip-permissions'])
  })

  it('explica o fallback quando a associação não é segura', () => {
    expect(buildResumeFallbackNotice(reference, '/outro')).toContain('nenhum ID foi usado')
    expect(buildAgentResumeArgs('codex', [], '/outro', reference)).toBeUndefined()
  })
})
