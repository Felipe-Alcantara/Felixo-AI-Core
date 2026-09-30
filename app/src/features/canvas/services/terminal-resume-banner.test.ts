import { describe, expect, it } from 'vitest'
import {
  explainAgentResume,
  type AgentResumeFailure,
  type AgentResumeReason,
  type AgentSessionReference,
} from './agent-session'
import { RESUME_INITIAL_TEXT } from './quality-standard-prompt'
import {
  TERMINAL_RESUME_PENDING_LABEL,
  agentSessionPatch,
  buildTerminalResumeBanner,
  describeTerminalResumeStart,
  followsTerminalResumePlan,
  resolveTerminalRelaunch,
  resumeFailurePatch,
  shouldShowTerminalResumeBanner,
  terminalResumeActionPatch,
  terminalResumeActionRelaunches,
  visibleTerminalResumeBanner,
} from './terminal-resume-banner'

const SESSION_ID = 'conversa-secreta-0123456789'
const ACCOUNT_ID = 'conta-trabalho-secreta'

const reference: AgentSessionReference = {
  version: 1,
  provider: 'codex',
  sessionId: SESSION_ID,
  cwd: '/repo',
  capturedAt: Date.UTC(2026, 8, 28, 21, 40),
  accountId: ACCOUNT_ID,
}

const expired: AgentResumeFailure = { sessionId: SESSION_ID, reason: 'expired', at: 5 }
const auth: AgentResumeFailure = { sessionId: SESSION_ID, reason: 'auth', at: 5 }

type PlanInput = Parameters<typeof explainAgentResume>[0]

/** Bloco em /repo, na conta da conversa: tudo coincide até o caso mudar algo. */
function scenario(overrides: Partial<PlanInput> = {}) {
  const input: PlanInput = { command: 'codex', cwd: '/repo', reference, accountId: ACCOUNT_ID, ...overrides }
  const plan = explainAgentResume(input)
  return {
    plan,
    banner: buildTerminalResumeBanner({
      plan,
      reference: input.reference,
      cwd: input.cwd,
      command: input.command,
    }),
  }
}

const actionIds = (banner: ReturnType<typeof buildTerminalResumeBanner>) =>
  banner?.actions.map((action) => action.id)

describe('faixa de retomada do cartão', () => {
  it('não há faixa quando não há o que decidir', () => {
    // Retomada exata: sobe direto com os argumentos de retomada.
    expect(scenario().banner).toBeNull()
    // Sem conversa associada: a lista da CLI já é a escolha, sem segurar o spawn.
    expect(scenario({ reference: undefined }).banner).toBeNull()
    // Escolha já feita: o bloco sobe com a lista ou a conversa nova.
    expect(scenario({ cwd: '/outro', choice: 'picker' }).banner).toBeNull()
    expect(scenario({ failure: expired, choice: 'new' }).banner).toBeNull()
  })

  const pendentes: Array<[AgentResumeReason, Partial<PlanInput>]> = [
    ['cwd-mismatch', { cwd: '/outro' }],
    ['missing-cwd', { cwd: '' }],
    ['account-mismatch', { accountId: 'outra-conta-secreta' }],
    ['provider-mismatch', { command: 'claude' }],
    ['invalid-reference', { reference: { ...reference, sessionId: 'curto' } }],
    ['unsupported', { command: 'gemini', reference: { ...reference, provider: 'gemini' } }],
    ['expired', { failure: expired }],
    ['auth', { failure: auth }],
  ]

  it.each(pendentes)('%s: faixa com título, explicação e as duas saídas', (reason, overrides) => {
    const { plan, banner } = scenario(overrides)
    expect(plan).toMatchObject({ outcome: 'pending', reason })
    expect(banner).not.toBeNull()
    expect(banner?.title.length).toBeGreaterThan(0)
    expect(banner?.detail.length).toBeGreaterThan(0)
    expect(actionIds(banner)?.slice(0, 2)).toEqual(['picker', 'new'])
    expect(banner?.actions.slice(0, 2).map((action) => action.label)).toEqual([
      'Escolher na lista (/resume)',
      'Abrir conversa nova',
    ])
  })

  it.each(pendentes)('%s: nenhum texto da faixa leva o ID da conversa nem o da conta', (_reason, overrides) => {
    const { banner } = scenario(overrides)
    const texts = [banner?.title, banner?.detail, banner?.target, ...(banner?.actions ?? []).map((action) => action.label)]
    for (const text of texts) {
      if (text === undefined) continue
      expect(text).not.toContain(SESSION_ID)
      expect(text).not.toContain('curto')
      expect(text).not.toContain(ACCOUNT_ID)
      expect(text).not.toContain('outra-conta-secreta')
    }
  })

  it('"tentar de novo" só quando a CLI recusou e a falha é o único obstáculo', () => {
    expect(actionIds(scenario({ failure: expired }).banner)).toEqual(['picker', 'new', 'retry'])
    expect(actionIds(scenario({ failure: auth }).banner)).toEqual(['picker', 'new', 'retry'])
    expect(scenario({ failure: auth }).banner?.actions[2].label).toBe('Tentar retomar de novo')
    // Divergências que tentar de novo não resolve: o botão prometeria demais.
    for (const overrides of [{ cwd: '/outro' }, { accountId: undefined }, { command: 'claude' }]) {
      expect(actionIds(scenario(overrides).banner)).toEqual(['picker', 'new'])
    }
    // Falha E pasta divergente: limpar a falha cairia na faixa da pasta.
    const both = scenario({ failure: expired, cwd: '/outro' })
    expect(both.plan.reason).toBe('expired')
    expect(actionIds(both.banner)).toEqual(['picker', 'new'])
  })

  it('o alvo diz agente, pasta, data e tipo de conta — e some com registro ilegível', () => {
    const target = scenario({ cwd: '/outro' }).banner?.target
    expect(target).toContain('Codex')
    expect(target).toContain('/repo')
    expect(target).toContain('conta própria')
    expect(scenario({ reference: { ...reference, sessionId: 'curto' } }).banner?.target).toBeUndefined()
  })

  it('o título vem do motivo principal e a explicação junta todos os motivos', () => {
    const { banner } = scenario({ cwd: '/outro', accountId: undefined })
    expect(banner?.title).toBe('A conversa nasceu em outra pasta')
    expect(banner?.detail).toContain('/outro')
    expect(banner?.detail).toContain('outra conta')
  })

  it('marca quando a CLI já recusou a conversa, mesmo junto de outro motivo', () => {
    expect(scenario({ failure: expired }).banner?.failure).toBe(true)
    expect(scenario({ failure: auth, cwd: '/outro' }).banner?.failure).toBe(true)
    expect(scenario({ cwd: '/outro' }).banner?.failure).toBe(false)
    expect(scenario({ command: 'gemini', reference: { ...reference, provider: 'gemini' } }).banner?.failure).toBe(false)
  })

  it('o estado do bloco segurado diz que ele espera a pessoa', () => {
    expect(TERMINAL_RESUME_PENDING_LABEL).toBe('aguardando escolha')
  })
})

describe('quando a faixa aparece', () => {
  const gemini = scenario({ command: 'gemini', reference: { ...reference, provider: 'gemini' } }).banner
  const failed = scenario({ failure: auth }).banner
  const show = (
    banner: ReturnType<typeof buildTerminalResumeBanner>,
    state: { hasProcess: boolean; processLive: boolean; revealed?: boolean },
  ) => shouldShowTerminalResumeBanner({ banner, revealed: false, ...state })

  it('sem pendência, nunca', () => {
    expect(show(null, { hasProcess: false, processLive: false })).toBe(false)
  })

  it('bloco segurado (sem processo) ou processo encerrado: há um spawn por decidir', () => {
    expect(show(gemini, { hasProcess: false, processLive: false })).toBe(true)
    expect(show(gemini, { hasProcess: true, processLive: false })).toBe(true)
  })

  it('agente de pé: só a falha que a CLI acabou de dar aparece sozinha', () => {
    // Gemini aberto agora, com a conversa recém-registrada: a pendência é da
    // próxima abertura, e uma faixa sobre um agente funcionando pareceria erro.
    expect(show(gemini, { hasProcess: true, processLive: true })).toBe(false)
    // A CLI pediu login e segue de pé esperando: é sobre este processo.
    expect(show(failed, { hasProcess: true, processLive: true })).toBe(true)
  })

  it('Reiniciar revela a faixa guardada em vez de subir sem a escolha', () => {
    expect(show(gemini, { hasProcess: true, processLive: true, revealed: true })).toBe(true)
  })
})

describe('dispensar o aviso de falha com o agente de pé', () => {
  const failed = scenario({ failure: auth }).banner
  const visible = (
    banner: ReturnType<typeof buildTerminalResumeBanner>,
    state: { hasProcess: boolean; processLive: boolean; revealed?: boolean },
  ) => visibleTerminalResumeBanner({ banner, revealed: false, ...state })

  it('falha com o processo vivo ganha "Dispensar aviso" depois das outras saídas', () => {
    const banner = visible(failed, { hasProcess: true, processLive: true })
    expect(actionIds(banner)).toEqual(['picker', 'new', 'retry', 'dismiss'])
    expect(banner?.actions.at(-1)?.label).toBe('Dispensar aviso')
    // Falha junto de outro motivo (sem "tentar de novo"): dispensar vale igual.
    const both = visible(scenario({ failure: auth, cwd: '/outro' }).banner, { hasProcess: true, processLive: true })
    expect(actionIds(both)).toEqual(['picker', 'new', 'dismiss'])
  })

  it('sem processo vivo não há o que dispensar: a faixa decide o próximo spawn', () => {
    expect(actionIds(visible(failed, { hasProcess: false, processLive: false }))).toEqual(['picker', 'new', 'retry'])
    expect(actionIds(visible(failed, { hasProcess: true, processLive: false }))).toEqual(['picker', 'new', 'retry'])
  })

  it('faixa que não é de falha nunca oferece dispensar, nem quando revelada', () => {
    const gemini = scenario({ command: 'gemini', reference: { ...reference, provider: 'gemini' } }).banner
    expect(visible(gemini, { hasProcess: true, processLive: true })).toBeNull()
    expect(actionIds(visible(gemini, { hasProcess: true, processLive: true, revealed: true }))).toEqual(['picker', 'new'])
    expect(visible(null, { hasProcess: true, processLive: true })).toBeNull()
  })

  it('não altera a faixa montada (o cartão e a gaveta partem da mesma)', () => {
    visible(failed, { hasProcess: true, processLive: true })
    expect(actionIds(failed)).toEqual(['picker', 'new', 'retry'])
  })

  it('dispensar limpa só a falha, não relança, e a faixa some', () => {
    const patch = terminalResumeActionPatch('dismiss')
    expect(patch).toEqual({ resumeFailure: undefined })
    expect(patch).toHaveProperty('resumeFailure', undefined)
    expect(patch).not.toHaveProperty('resumeChoice')
    expect(patch).not.toHaveProperty('agentSession')
    expect(terminalResumeActionRelaunches('dismiss')).toBe(false)
    for (const action of ['picker', 'new', 'retry'] as const) {
      expect(terminalResumeActionRelaunches(action)).toBe(true)
    }
    const after = scenario({ failure: patch.resumeFailure })
    expect(visible(after.banner, { hasProcess: true, processLive: true })).toBeNull()
  })
})

describe('o que o cartão diz antes da primeira linha da CLI', () => {
  it('"retomando" só no desfecho exato; cada outro desfecho diz o que o spawn faz', () => {
    expect(describeTerminalResumeStart(scenario().plan)).toBe('Retomando a conversa anterior…')
    expect(describeTerminalResumeStart(scenario({ reference: undefined }).plan)).toContain('Sem conversa associada')
    expect(describeTerminalResumeStart(scenario({ cwd: '/outro', choice: 'picker' }).plan)).toContain('/resume')
    expect(describeTerminalResumeStart(scenario({ failure: expired, choice: 'new' }).plan)).toBe('Abrindo uma conversa nova…')
    for (const overrides of [{ cwd: '/outro' }, { failure: expired }, { failure: auth }]) {
      const text = describeTerminalResumeStart(scenario(overrides).plan)
      // Pendente: a faixa fala; o cartão não promete retomada nenhuma.
      expect(text).toBeNull()
    }
    expect(describeTerminalResumeStart(scenario({ choice: 'picker', cwd: '/outro' }).plan)).not.toContain('Retomando')
    expect(describeTerminalResumeStart(undefined)).toBeNull()
  })
})

describe('botões da faixa', () => {
  it('a escolha grava só a escolha; nada apaga a conversa associada', () => {
    expect(terminalResumeActionPatch('picker')).toEqual({ resumeChoice: 'picker' })
    expect(terminalResumeActionPatch('new')).toEqual({ resumeChoice: 'new' })
    for (const action of ['picker', 'new', 'retry'] as const) {
      expect(terminalResumeActionPatch(action)).not.toHaveProperty('agentSession')
      expect(terminalResumeActionPatch(action)).not.toHaveProperty('previousAgentSession')
    }
  })

  it('tentar de novo limpa a falha e a escolha, e a retomada exata volta a valer', () => {
    const patch = terminalResumeActionPatch('retry')
    // As chaves existem com `undefined`: é assim que o merge do bloco as limpa.
    expect(patch).toHaveProperty('resumeFailure', undefined)
    expect(patch).toHaveProperty('resumeChoice', undefined)

    const before = resolveTerminalRelaunch({ followsResumePlan: true, command: 'codex', cwd: '/repo', reference, accountId: ACCOUNT_ID, failure: expired })
    expect(before.kind).toBe('hold')
    const after = resolveTerminalRelaunch({
      followsResumePlan: true,
      command: 'codex',
      cwd: '/repo',
      reference,
      accountId: ACCOUNT_ID,
      failure: patch.resumeFailure,
      choice: patch.resumeChoice,
    })
    expect(after).toEqual({ kind: 'spawn', resumeAgentSession: true, initialText: undefined, initialTextIsHandoff: false })
  })
})

describe('quem segue o plano de retomada', () => {
  it('agente restaurado, ou agente com conversa associada; nunca um shell', () => {
    expect(followsTerminalResumePlan({ isRestoredAgent: true, hasAgentCommand: true, reference: undefined })).toBe(true)
    expect(followsTerminalResumePlan({ isRestoredAgent: false, hasAgentCommand: true, reference })).toBe(true)
    // Agente aberto nesta execução, sem conversa: instrução de largada de sempre.
    expect(followsTerminalResumePlan({ isRestoredAgent: false, hasAgentCommand: true, reference: undefined })).toBe(false)
    // `/resume` digitado num shell não significa nada.
    expect(followsTerminalResumePlan({ isRestoredAgent: true, hasAgentCommand: false, reference })).toBe(false)
  })
})

describe('relançamento: cartão, gaveta e faixa decidem igual', () => {
  const base = { followsResumePlan: true, command: 'codex', cwd: '/repo', reference, accountId: ACCOUNT_ID }

  it('bloco fora do plano relança com o texto de largada que já tinha', () => {
    expect(
      resolveTerminalRelaunch({ followsResumePlan: false, command: 'codex', initialText: 'instrução', initialTextIsHandoff: true }),
    ).toEqual({ kind: 'spawn', resumeAgentSession: false, initialText: 'instrução', initialTextIsHandoff: true })
  })

  it('retomada exata sobe com os argumentos de retomada, sem texto', () => {
    expect(resolveTerminalRelaunch({ ...base, initialText: 'instrução de largada' })).toEqual({
      kind: 'spawn',
      resumeAgentSession: true,
      initialText: undefined,
      initialTextIsHandoff: false,
    })
  })

  it('pendente não sobe: a faixa espera a escolha', () => {
    const relaunch = resolveTerminalRelaunch({ ...base, cwd: '/outro', initialText: 'instrução de largada' })
    expect(relaunch).toMatchObject({ kind: 'hold', plan: { outcome: 'pending', reason: 'cwd-mismatch' } })
  })

  it('lista da CLI: digita /resume, nunca a instrução de largada', () => {
    const relaunch = resolveTerminalRelaunch({ ...base, cwd: '/outro', choice: 'picker', initialText: 'instrução de largada' })
    expect(relaunch).toEqual({ kind: 'spawn', resumeAgentSession: false, initialText: RESUME_INITIAL_TEXT, initialTextIsHandoff: false })
    expect(RESUME_INITIAL_TEXT).toBe(`/resume${String.fromCharCode(13)}`)
  })

  it('conversa nova: o agente recebe o aviso, sem ID', () => {
    const relaunch = resolveTerminalRelaunch({ ...base, failure: expired, choice: 'new' })
    expect(relaunch.kind).toBe('spawn')
    if (relaunch.kind !== 'spawn') return
    expect(relaunch.resumeAgentSession).toBe(false)
    expect(relaunch.initialText).toContain('conversa nova')
    expect(relaunch.initialText).not.toContain(SESSION_ID)
    expect(relaunch.initialText).not.toContain(ACCOUNT_ID)
  })

  it('agente restaurado sem conversa associada: a lista da CLI, como sempre', () => {
    expect(resolveTerminalRelaunch({ ...base, reference: undefined })).toEqual({
      kind: 'spawn',
      resumeAgentSession: false,
      initialText: RESUME_INITIAL_TEXT,
      initialTextIsHandoff: false,
    })
  })
})

describe('registro da conversa do bloco', () => {
  it('primeira conversa descoberta: grava a referência e a pasta real do PTY', () => {
    expect(agentSessionPatch({}, reference, 10)).toEqual({ agentSession: reference, cwd: '/repo' })
  })

  it('mesma conversa redescoberta: não mexe na escolha nem cria conversa anterior', () => {
    const patch = agentSessionPatch({ agentSession: reference }, { ...reference, capturedAt: 99 }, 10)
    expect(patch).not.toHaveProperty('previousAgentSession')
    expect(patch).not.toHaveProperty('resumeChoice')
  })

  it('conversa trocada: a anterior fica guardada e a escolha da faixa sai', () => {
    const next = { ...reference, sessionId: 'conversa-nova-9876543210', capturedAt: 50 }
    const patch = agentSessionPatch({ agentSession: reference }, next, 60)
    expect(patch).toMatchObject({
      agentSession: next,
      cwd: '/repo',
      previousAgentSession: { reference, replacedAt: 60 },
    })
    expect(patch).toHaveProperty('resumeChoice', undefined)
  })

  it('agentSession null ou lixo no canvas salvo: grava a descoberta sem virar conversa anterior', () => {
    // Antes: `previous.sessionId` com `previous === null` lançava dentro do setNodes.
    expect(agentSessionPatch({ agentSession: null }, reference, 10)).toEqual({ agentSession: reference, cwd: '/repo' })
    for (const garbage of ['texto', 42, {}, { sessionId: 'curto' }, { ...reference, version: 2 }]) {
      const patch = agentSessionPatch({ agentSession: garbage }, reference, 10)
      expect(patch).toEqual({ agentSession: reference, cwd: '/repo' })
      expect(patch).not.toHaveProperty('previousAgentSession')
    }
  })

  it('falha da CLI fica presa ao ID tentado; sem conversa associada, nada a registrar', () => {
    expect(resumeFailurePatch({}, 'expired', 7)).toBeNull()
    const patch = resumeFailurePatch({ agentSession: reference }, 'auth', 7)
    expect(patch).toEqual({ resumeFailure: { sessionId: SESSION_ID, reason: 'auth', at: 7 }, resumeChoice: undefined })
    // O store informa a conversa que o spawn tentou; é a ela que a falha se prende.
    const other = { ...reference, sessionId: 'conversa-nova-9876543210' }
    expect(resumeFailurePatch({ agentSession: other }, 'expired', 8, reference)?.resumeFailure).toEqual({
      sessionId: SESSION_ID,
      reason: 'expired',
      at: 8,
    })
    // Presa ao ID: com outra conversa associada, a falha antiga não segura nada.
    expect(
      resolveTerminalRelaunch({
        followsResumePlan: true,
        command: 'codex',
        cwd: '/repo',
        reference: other,
        accountId: ACCOUNT_ID,
        failure: patch?.resumeFailure,
      }).kind,
    ).toBe('spawn')
  })
})
