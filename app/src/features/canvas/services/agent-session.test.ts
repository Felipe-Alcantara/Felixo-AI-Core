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

  it('recusa retomar quando o cwd do node está vazio, mesmo com referência válida', () => {
    // Regressão medida no Linux (28/08/2026): um terminal aberto sem projeto
    // explícito ("Local (sem projeto)") nunca tinha `node.data.cwd` — o PTY
    // caía no diretório do usuário por baixo dos panos
    // (`resolveWorkingDirectory` em pty-process-manager.cjs), mas isso nunca
    // era escrito de volta no node. A descoberta best-effort achava e
    // persistia uma `agentSession` válida com o cwd real; a comparação aqui
    // (que exige os dois lados preenchidos e iguais) sempre falhava do mesmo
    // jeito, e a retomada caía sempre no `/resume` genérico — mesmo com uma
    // sessão descoberta e compatível. O fix backfilla `node.data.cwd` a
    // partir de `reference.cwd` assim que a sessão é descoberta
    // (`CanvasView.tsx`, `onAgentSession`); este teste documenta por que esse
    // backfill é necessário, não opcional.
    expect(canResumeAgentSession('codex', undefined, reference)).toBe(false)
    expect(canResumeAgentSession('codex', '', reference)).toBe(false)
    // Com o cwd do node sincronizado com o da referência (o que o fix faz),
    // a retomada volta a funcionar.
    expect(canResumeAgentSession('codex', reference.cwd, reference)).toBe(true)
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

  it('não envia UUID persistido ao Gemini quando a CLI só documenta latest/índice', () => {
    const geminiReference = { ...reference, provider: 'gemini' as const }

    expect(canResumeAgentSession('gemini', '/repo', geminiReference)).toBe(false)
    expect(
      buildAgentResumeArgs('gemini', ['--yolo'], '/repo', geminiReference),
    ).toBeUndefined()
  })

  it('explica o fallback quando a associação não é segura', () => {
    expect(buildResumeFallbackNotice(reference, '/outro')).toContain('nenhum ID foi usado')
    expect(buildAgentResumeArgs('codex', [], '/outro', reference)).toBeUndefined()
  })

  it('explica o fallback específico da sintaxe atual do Gemini', () => {
    expect(
      buildResumeFallbackNotice(
        { ...reference, provider: 'gemini' },
        '/repo',
      ),
    ).toContain('índice muda')
  })
})
