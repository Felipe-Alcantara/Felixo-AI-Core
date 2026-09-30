import { describe, expect, it } from 'vitest'
import {
  buildAgentResumeArgs,
  buildResumeFallbackNotice,
  canResumeAgentSession,
  describeAgentResumeCapability,
  describeAgentResumeForPerson,
  describeAgentResumeTarget,
  explainAgentResume,
  isAgentSessionReference,
  withResumeMethod,
  type AgentResumeReason,
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

  it('Gemini só recebe o ID da conversa da 0.57 em diante', () => {
    const geminiReference = { ...reference, provider: 'gemini' as const }

    // Sem versão, ou numa versão anterior à provada, o `--help` só garante
    // `latest` e o índice: o UUID não vai.
    for (const cliVersion of [undefined, null, '0.56.2', 'não é versão']) {
      expect(canResumeAgentSession('gemini', '/repo', geminiReference, undefined, undefined, cliVersion), String(cliVersion)).toBe(false)
      expect(buildAgentResumeArgs('gemini', ['--yolo'], '/repo', geminiReference, undefined, undefined, cliVersion)).toBeUndefined()
    }
    for (const cliVersion of ['0.57.0', '0.58.1', '0.60.0-nightly.20261001']) {
      expect(buildAgentResumeArgs('gemini', ['--yolo'], '/repo', geminiReference, undefined, undefined, cliVersion), cliVersion).toEqual([
        '--resume',
        'codex-session-123',
        '--yolo',
      ])
    }
  })

  it('Claude e Codex seguem pelo ID sem versão: o --help deles documenta a retomada', () => {
    expect(canResumeAgentSession('codex', '/repo', reference, undefined, undefined, null)).toBe(true)
    expect(canResumeAgentSession('claude', '/repo', { ...reference, provider: 'claude' }, undefined)).toBe(true)
  })

  it('referência que não é exata não monta argumentos de retomada', () => {
    expect(buildAgentResumeArgs('codex', [], '/outro', reference, undefined)).toBeUndefined()
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

describe('plano de retomada: desfecho e motivo', () => {
  const plan = (overrides: Partial<Parameters<typeof explainAgentResume>[0]> = {}) =>
    explainAgentResume({ command: 'codex', cwd: '/repo', reference, accountId: undefined, ...overrides })

  it('mesma conversa, pasta e conta: retomada exata', () => {
    expect(plan()).toEqual({
      outcome: 'exact',
      reason: 'exact',
      reasons: ['exact'],
      capability: { provider: 'codex', version: null, method: 'exact-id', basis: 'documented' },
    })
  })

  it('sem conversa associada: a lista da CLI é a escolha, sem segurar o spawn', () => {
    expect(plan({ reference: undefined })).toMatchObject({ outcome: 'picker', reason: 'fallback', reasons: ['fallback'] })
  })

  it('cada divergência tem o próprio motivo, e o spawn espera a escolha da pessoa', () => {
    const casos: Array<[Partial<Parameters<typeof explainAgentResume>[0]>, AgentResumeReason]> = [
      [{ cwd: '/outro' }, 'cwd-mismatch'],
      [{ cwd: '' }, 'missing-cwd'],
      [{ cwd: undefined }, 'missing-cwd'],
      [{ accountId: 'conta-pessoal' }, 'account-mismatch'],
      [{ command: 'claude' }, 'provider-mismatch'],
      [{ reference: { ...reference, sessionId: 'curto' } }, 'invalid-reference'],
      [{ command: 'gemini', reference: { ...reference, provider: 'gemini' } }, 'unsupported'],
      [{ failure: { sessionId: reference.sessionId, reason: 'expired', at: 2 } }, 'expired'],
      [{ failure: { sessionId: reference.sessionId, reason: 'auth', at: 2 } }, 'auth'],
    ]
    for (const [overrides, reason] of casos) {
      expect(plan(overrides), reason).toMatchObject({ outcome: 'pending', reason })
    }
  })

  it('pasta E conta divergentes aparecem juntas, a pasta primeiro', () => {
    expect(plan({ cwd: '/outro', accountId: 'conta-pessoal' })).toMatchObject({
      outcome: 'pending',
      reason: 'cwd-mismatch',
      reasons: ['cwd-mismatch', 'account-mismatch'],
    })
  })

  it('falha registrada para OUTRA conversa não conta: a referência nova retoma normalmente', () => {
    expect(plan({ failure: { sessionId: 'outra-conversa-99', reason: 'expired', at: 2 } }).outcome).toBe('exact')
    expect(canResumeAgentSession('codex', '/repo', reference, undefined, {
      sessionId: 'outra-conversa-99',
      reason: 'expired',
      at: 2,
    })).toBe(true)
  })

  it('conversa que a CLI já recusou não é retomada de novo pelo mesmo ID', () => {
    const failure = { sessionId: reference.sessionId, reason: 'expired' as const, at: 2 }
    expect(canResumeAgentSession('codex', '/repo', reference, undefined, failure)).toBe(false)
    expect(buildAgentResumeArgs('codex', [], '/repo', reference, undefined, failure)).toBeUndefined()
  })

  it('a escolha da pessoa resolve a pendência em lista da CLI ou conversa nova', () => {
    expect(plan({ cwd: '/outro', choice: 'picker' })).toMatchObject({ outcome: 'picker', reason: 'cwd-mismatch' })
    expect(plan({ cwd: '/outro', choice: 'new' })).toMatchObject({ outcome: 'new', reason: 'cwd-mismatch' })
    // Retomada exata não pergunta nada, mesmo com escolha guardada.
    expect(plan({ choice: 'new' }).outcome).toBe('exact')
  })
})

describe('textos da retomada: explicam sem expor ID', () => {
  const daConta: AgentSessionReference = { ...reference, accountId: 'conta-trabalho-secreta' }
  const todos: Array<[string, ReturnType<typeof explainAgentResume>, { cwd?: string; command?: string; reference?: AgentSessionReference }]> = [
    ['cwd', explainAgentResume({ command: 'codex', cwd: '/outro', reference: daConta, accountId: 'conta-trabalho-secreta' }), { cwd: '/outro', command: 'codex', reference: daConta }],
    ['conta', explainAgentResume({ command: 'codex', cwd: '/repo', reference: daConta, accountId: 'outra-conta-secreta' }), { cwd: '/repo', command: 'codex', reference: daConta }],
    ['provider', explainAgentResume({ command: 'claude', cwd: '/repo', reference: daConta, accountId: 'conta-trabalho-secreta' }), { cwd: '/repo', command: 'claude', reference: daConta }],
    ['sem pasta', explainAgentResume({ command: 'codex', cwd: '', reference: daConta, accountId: 'conta-trabalho-secreta' }), { cwd: '', command: 'codex', reference: daConta }],
    ['gemini sem versão', explainAgentResume({ command: 'gemini', cwd: '/repo', reference: { ...daConta, provider: 'gemini' }, accountId: 'conta-trabalho-secreta' }), { cwd: '/repo', command: 'gemini', reference: { ...daConta, provider: 'gemini' } }],
    ['gemini antigo', explainAgentResume({ command: 'gemini', cwd: '/repo', reference: { ...daConta, provider: 'gemini' }, accountId: 'conta-trabalho-secreta', cliVersion: '0.56.2' }), { cwd: '/repo', command: 'gemini', reference: { ...daConta, provider: 'gemini' } }],
    ['expirada', explainAgentResume({ command: 'codex', cwd: '/repo', reference: daConta, accountId: 'conta-trabalho-secreta', failure: { sessionId: daConta.sessionId, reason: 'expired', at: 3 } }), { cwd: '/repo', command: 'codex', reference: daConta }],
    ['login', explainAgentResume({ command: 'codex', cwd: '/repo', reference: daConta, accountId: 'conta-trabalho-secreta', failure: { sessionId: daConta.sessionId, reason: 'auth', at: 3 } }), { cwd: '/repo', command: 'codex', reference: daConta }],
    ['sem associação', explainAgentResume({ command: 'codex', cwd: '/repo', reference: undefined, accountId: undefined }), { cwd: '/repo', command: 'codex' }],
  ]

  it.each(todos)('%s: título, explicação e aviso ao agente sem o ID da conversa nem o da conta', (_label, planned, context) => {
    const person = describeAgentResumeForPerson(planned, context)
    const notice = buildResumeFallbackNotice(planned, context)
    for (const text of [person.title, person.detail, notice]) {
      expect(text).not.toContain(daConta.sessionId)
      expect(text).not.toContain('conta-trabalho-secreta')
      expect(text).not.toContain('outra-conta-secreta')
    }
    expect(person.title.length).toBeGreaterThan(0)
  })

  it('nenhum motivo culpa a CLI por algo que ela não disse', () => {
    for (const [, planned, context] of todos) {
      if (planned.reasons.includes('expired') || planned.reasons.includes('auth')) continue
      expect(describeAgentResumeForPerson(planned, context).detail).not.toMatch(/CLI (não confirmou|respondeu)/)
    }
  })

  it('login pedido: manda fazer login nesta conta, nunca trocar a conta do bloco', () => {
    // Trocar a conta levaria a outra faixa (conta divergente) e a retomada
    // exata ficaria proibida: o conselho seria um beco sem saída.
    const [, planned, context] = todos.find(([label]) => label === 'login')!
    const { detail } = describeAgentResumeForPerson(planned, context)
    expect(detail).toContain('Faça login na CLI desta conta')
    expect(detail).not.toMatch(/troque a conta|trocar a conta/i)
  })

  it('pasta divergente diz onde a conversa nasceu e onde o bloco está', () => {
    const [, planned, context] = todos[0]
    const { title, detail } = describeAgentResumeForPerson(planned, context)
    expect(title).toBe('A conversa nasceu em outra pasta')
    expect(detail).toContain('/repo')
    expect(detail).toContain('/outro')
  })

  it('pasta e conta divergentes: as duas explicações no mesmo texto', () => {
    const planned = explainAgentResume({ command: 'codex', cwd: '/outro', reference: daConta, accountId: 'outra-conta-secreta' })
    const { detail } = describeAgentResumeForPerson(planned, { cwd: '/outro', command: 'codex', reference: daConta })
    expect(detail).toContain('/outro')
    expect(detail).toContain('outra conta')
  })

  it('o aviso ao agente diz que a conversa é nova e pede para não presumir o histórico', () => {
    const [, planned, context] = todos[0]
    const notice = buildResumeFallbackNotice(planned, context)
    expect(notice).toContain('conversa nova')
    expect(notice).toContain('Não presuma')
  })

  it('o alvo mostra provider, pasta, data e tipo de conta, sem ID', () => {
    const target = describeAgentResumeTarget(daConta)
    expect(target).toContain('Codex')
    expect(target).toContain('/repo')
    expect(target).toContain('conta própria')
    expect(target).not.toContain(daConta.sessionId)
    expect(target).not.toContain('conta-trabalho-secreta')
    expect(describeAgentResumeTarget(reference)).toContain('login do sistema')
  })
})

describe('capacidade pela versão instalada', () => {
  const gemini: AgentSessionReference = { ...reference, provider: 'gemini' }
  const geminiPlan = (cliVersion: string | null | undefined, recorded?: string) =>
    explainAgentResume({
      command: 'gemini',
      cwd: '/repo',
      reference: recorded ? { ...gemini, cliVersion: recorded } : gemini,
      accountId: undefined,
      cliVersion,
    })

  it('Gemini 0.57 retoma pelo ID; antes dela, ou sem versão, a pessoa escolhe', () => {
    expect(geminiPlan('0.57.0')).toMatchObject({ outcome: 'exact', capability: { method: 'exact-id', basis: 'measured' } })
    expect(geminiPlan('0.56.2')).toMatchObject({
      outcome: 'pending',
      reason: 'unsupported',
      capability: { method: 'numeric-index', basis: 'below-proven', version: '0.56.2' },
    })
    expect(geminiPlan(undefined)).toMatchObject({
      outcome: 'pending',
      reason: 'unsupported',
      capability: { method: 'numeric-index', basis: 'unknown-version', version: null },
    })
  })

  it('CLI atualizada: recalcula o método pela versão nova, sem apagar a conversa', () => {
    // Gravada numa versão que não retomava pelo ID; a nova retoma.
    const updated = geminiPlan('0.57.0', '0.56.2')
    expect(updated).toMatchObject({ outcome: 'exact', versionChange: { from: '0.56.2', to: '0.57.0' } })
    // O caminho inverso também é recalculado, e a conversa segue gravada para a escolha.
    const downgraded = geminiPlan('0.56.2', '0.57.0')
    expect(downgraded).toMatchObject({ outcome: 'pending', reason: 'unsupported', versionChange: { from: '0.57.0', to: '0.56.2' } })
    // Mesma versão, ou versão atual desconhecida: nada a mostrar como troca.
    expect(geminiPlan('0.57.0', '0.57.0').versionChange).toBeUndefined()
    expect(geminiPlan(undefined, '0.57.0').versionChange).toBeUndefined()
  })

  it('explica a versão antiga e a desconhecida sem ID, e diz o que fazer', () => {
    const context = { cwd: '/repo', command: 'gemini', reference: gemini }
    const old = describeAgentResumeForPerson(geminiPlan('0.56.2'), context)
    expect(old.title).toBe('Retomada pelo ID indisponível nesta versão do Gemini CLI')
    expect(old.detail).toContain('Gemini CLI 0.56.2')
    expect(old.detail).toContain('0.57.0')
    expect(old.detail).toContain('Atualize o Gemini CLI')
    const unknown = describeAgentResumeForPerson(geminiPlan(null), context)
    expect(unknown.detail).toContain('não conseguiu ler a versão do Gemini CLI')
    for (const text of [old.title, old.detail, unknown.detail]) expect(text).not.toContain(gemini.sessionId)
  })

  it('a linha dos detalhes diz como a CLI instalada retoma e de qual versão veio a conversa', () => {
    expect(describeAgentResumeCapability(geminiPlan('0.57.0', '0.56.2'))).toBe(
      'Gemini CLI 0.57.0: pelo ID da conversa (gravada na 0.56.2)',
    )
    expect(describeAgentResumeCapability(geminiPlan(undefined))).toBe('Gemini CLI versão desconhecida: só pela posição na lista')
  })

  it('a conversa de outro provider não ganha também o motivo de versão', () => {
    expect(explainAgentResume({ command: 'gemini', cwd: '/repo', reference, accountId: undefined }).reasons).toEqual([
      'provider-mismatch',
    ])
  })

  it('grava o método da versão com que a conversa foi capturada', () => {
    expect(withResumeMethod({ ...gemini, cliVersion: '0.57.0' }).resumeMethod).toBe('exact-id')
    expect(withResumeMethod(gemini).resumeMethod).toBe('numeric-index')
    expect(withResumeMethod(reference).resumeMethod).toBe('exact-id')
    const stamped = withResumeMethod(reference)
    expect(withResumeMethod(stamped)).toBe(stamped)
  })

  it('versão e método gravados precisam estar no formato; ausentes continuam valendo', () => {
    expect(isAgentSessionReference({ ...reference, cliVersion: '0.156.1', resumeMethod: 'exact-id' })).toBe(true)
    expect(isAgentSessionReference({ ...reference, cliVersion: 'codex-cli 0.156.1' })).toBe(false)
    expect(isAgentSessionReference({ ...reference, cliVersion: 42 })).toBe(false)
    expect(isAgentSessionReference({ ...reference, resumeMethod: 'adivinhar' })).toBe(false)
  })
})
