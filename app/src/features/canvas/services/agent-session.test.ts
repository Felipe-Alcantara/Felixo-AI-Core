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
    expect(canResumeAgentSession('codex', '/repo', reference, undefined)).toBe(true)
    expect(canResumeAgentSession('claude', '/repo', reference, undefined)).toBe(false)
    expect(canResumeAgentSession('codex', '/outro', reference, undefined)).toBe(false)
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
    expect(canResumeAgentSession('codex', undefined, reference, undefined)).toBe(false)
    expect(canResumeAgentSession('codex', '', reference, undefined)).toBe(false)
    // Com o cwd do node sincronizado com o da referência (o que o fix faz),
    // a retomada volta a funcionar.
    expect(canResumeAgentSession('codex', reference.cwd, reference, undefined)).toBe(true)
  })

  it('monta as formas oficiais de retomada por CLI', () => {
    expect(buildAgentResumeArgs('codex', ['--dangerously-bypass-approvals-and-sandbox'], '/repo', reference, undefined)).toEqual([
      'resume',
      '--dangerously-bypass-approvals-and-sandbox',
      'codex-session-123',
    ])
    expect(
      buildAgentResumeArgs(
        'claude',
        ['--dangerously-skip-permissions'],
        '/repo',
        { ...reference, provider: 'claude' },
        undefined,
      ),
    ).toEqual(['--resume', 'codex-session-123', '--dangerously-skip-permissions'])
  })

  it('não envia UUID persistido ao Gemini quando a CLI só documenta latest/índice', () => {
    const geminiReference = { ...reference, provider: 'gemini' as const }

    expect(canResumeAgentSession('gemini', '/repo', geminiReference, undefined)).toBe(false)
    expect(
      buildAgentResumeArgs('gemini', ['--yolo'], '/repo', geminiReference, undefined),
    ).toBeUndefined()
  })

  it('explica o fallback quando a associação não é segura', () => {
    expect(buildResumeFallbackNotice(reference, '/outro', undefined)).toContain('nenhum ID foi usado')
    expect(buildAgentResumeArgs('codex', [], '/outro', reference, undefined)).toBeUndefined()
  })

  it('explica o fallback específico da sintaxe atual do Gemini', () => {
    expect(
      buildResumeFallbackNotice(
        { ...reference, provider: 'gemini' },
        '/repo',
        undefined,
      ),
    ).toContain('índice muda')
  })

  it('retoma só na mesma conta: a conversa de uma conta nunca abre na cobrança de outra', () => {
    const daConta: AgentSessionReference = { ...reference, accountId: 'conta-trabalho' }

    expect(isAgentSessionReference(daConta)).toBe(true)
    expect(canResumeAgentSession('codex', '/repo', daConta, 'conta-trabalho')).toBe(true)
    expect(canResumeAgentSession('codex', '/repo', daConta, 'conta-pessoal')).toBe(false)
    // Bloco que voltou para o login do sistema não retoma conversa de conta.
    expect(canResumeAgentSession('codex', '/repo', daConta, undefined)).toBe(false)
    expect(canResumeAgentSession('codex', '/repo', daConta, '')).toBe(false)
    expect(buildAgentResumeArgs('codex', [], '/repo', daConta, 'conta-pessoal')).toBeUndefined()
    expect(buildAgentResumeArgs('codex', [], '/repo', daConta, 'conta-trabalho')).toEqual([
      'resume',
      'codex-session-123',
    ])

    const aviso = buildResumeFallbackNotice(daConta, '/repo', 'conta-pessoal')
    expect(aviso).toContain('outra conta')
    expect(aviso).toContain('/resume')
  })

  it('referência antiga, sem conta, só vale em bloco sem conta', () => {
    expect(canResumeAgentSession('codex', '/repo', reference, undefined)).toBe(true)
    expect(canResumeAgentSession('codex', '/repo', reference, 'conta-trabalho')).toBe(false)
  })

  it('conta vazia na referência é inválida', () => {
    expect(isAgentSessionReference({ ...reference, accountId: '  ' })).toBe(false)
    expect(isAgentSessionReference({ ...reference, accountId: 42 })).toBe(false)
  })
})
