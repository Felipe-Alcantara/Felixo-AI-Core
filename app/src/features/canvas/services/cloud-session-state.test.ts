import { describe, expect, it } from 'vitest'
import {
  CLOUD_FOLLOW_UP_LIMIT,
  CLOUD_TASK_MAX,
  appendFollowUp,
  applyLaunchResult,
  canFollowUp,
  canLaunch,
  canRetryWithoutConfirmation,
  createDraft,
  isCloudSessionUrl,
  markLaunching,
  normalizeLoaded,
  startNewSession,
} from './cloud-session-state'

const ID = 'session_01EXEMPLO0000000000000000'
const URL_OK = `https://claude.ai/code/${ID}?from=cli&m=0`
const NOW = '2026-10-11T23:00:00.000Z'
const SESSION = { id: ID, url: URL_OK, title: 'Resposta' }

function created() {
  const draft = { ...createDraft({ cwd: '/projeto', accountId: 'conta-a' }), cloudTask: 'Corrigir o bug' }
  return applyLaunchResult(markLaunching(draft), { ok: true, session: SESSION }, NOW)
}

describe('createDraft', () => {
  it('começa em rascunho, vazio e sem sessão', () => {
    expect(createDraft({ cwd: '/projeto', accountId: 'conta-a' })).toEqual({
      cloudStatus: 'draft',
      cloudTask: '',
      cloudCwd: '/projeto',
      cloudAccountId: 'conta-a',
      cloudFollowUps: [],
    })
  })

  it('sem conta usa o Login do sistema (campo ausente)', () => {
    expect(createDraft({ cwd: '/projeto' }).cloudAccountId).toBeUndefined()
  })
})

describe('transições', () => {
  it('draft para launching limpa o erro anterior', () => {
    const falho = applyLaunchResult(
      markLaunching(createDraft({ cwd: '/p' })),
      { ok: false, code: 'login-required', message: 'sem login' },
      NOW,
    )

    const lancando = markLaunching(falho)

    expect(lancando.cloudStatus).toBe('launching')
    expect(lancando.cloudError).toBeUndefined()
  })

  it('launching para created guarda a sessão com o horário carimbado pelo renderer', () => {
    const data = created()

    expect(data.cloudStatus).toBe('created')
    expect(data.cloudSession).toEqual({ ...SESSION, createdAt: NOW })
    expect(data.cloudError).toBeUndefined()
    expect(data.cloudFollowUps).toEqual([])
  })

  it('launching para failed guarda o código e a mensagem e mantém a tarefa', () => {
    const draft = { ...createDraft({ cwd: '/p' }), cloudTask: 'Tarefa' }

    const data = applyLaunchResult(
      markLaunching(draft),
      { ok: false, code: 'trust-required', message: 'confie na pasta' },
      NOW,
    )

    expect(data.cloudStatus).toBe('failed')
    expect(data.cloudError).toEqual({ code: 'trust-required', message: 'confie na pasta' })
    expect(data.cloudTask).toBe('Tarefa')
    expect(data.cloudSession).toBeUndefined()
  })

  it('Nova sessão volta ao rascunho, mantém tarefa, pasta e conta e limpa sessão e follow-ups', () => {
    const comFollowUp = appendFollowUp(created(), { at: NOW, text: 'oi', ok: true })

    const novo = startNewSession(comFollowUp)

    expect(novo).toMatchObject({
      cloudStatus: 'draft',
      cloudTask: 'Corrigir o bug',
      cloudCwd: '/projeto',
      cloudAccountId: 'conta-a',
      cloudFollowUps: [],
    })
    expect(novo.cloudSession).toBeUndefined()
    expect(novo.cloudError).toBeUndefined()
  })
})

describe('regras de uso do cartão', () => {
  it('só dispara com tarefa e pasta, em rascunho ou falha (I3: nunca depois de criada)', () => {
    const base = { ...createDraft({ cwd: '/p' }), cloudTask: 'Tarefa' }

    expect(canLaunch(base)).toBe(true)
    expect(canLaunch({ ...base, cloudTask: '   ' })).toBe(false)
    expect(canLaunch({ ...base, cloudCwd: '' })).toBe(false)
    expect(canLaunch({ ...base, cloudStatus: 'failed' })).toBe(true)
    expect(canLaunch({ ...base, cloudStatus: 'launching' })).toBe(false)
    expect(canLaunch(created())).toBe(false)
  })

  it('só aceita follow-up quando a sessão foi criada', () => {
    expect(canFollowUp(created())).toBe(true)
    expect(canFollowUp(createDraft({ cwd: '/p' }))).toBe(false)
    expect(canFollowUp({ ...created(), cloudSession: undefined })).toBe(false)
  })

  it('tentar de novo sem confirmar só para erros que provam que nenhuma sessão foi criada', () => {
    for (const code of ['trust-required', 'login-required', 'limit-reached', 'invalid-input'] as const) {
      expect(canRetryWithoutConfirmation(code)).toBe(true)
    }
    for (const code of ['timeout', 'network', 'interrupted', 'unknown', 'busy', 'repo-too-large'] as const) {
      expect(canRetryWithoutConfirmation(code)).toBe(false)
    }
  })
})

describe('appendFollowUp', () => {
  it('guarda no máximo os 20 mais recentes', () => {
    let data = created()
    for (let i = 1; i <= CLOUD_FOLLOW_UP_LIMIT + 1; i += 1) {
      data = appendFollowUp(data, { at: NOW, text: `mensagem ${i}`, ok: true })
    }

    expect(data.cloudFollowUps).toHaveLength(CLOUD_FOLLOW_UP_LIMIT)
    expect(data.cloudFollowUps?.[0].text).toBe('mensagem 2')
    expect(data.cloudFollowUps?.at(-1)?.text).toBe(`mensagem ${CLOUD_FOLLOW_UP_LIMIT + 1}`)
  })

  it('registra a falha com o código do erro', () => {
    const data = appendFollowUp(created(), { at: NOW, text: 'oi', ok: false, error: 'timeout' })

    expect(data.cloudFollowUps).toEqual([{ at: NOW, text: 'oi', ok: false, error: 'timeout' }])
  })
})

describe('normalizeLoaded', () => {
  it('um cartão que foi fechado em launching nunca volta launching (I9)', () => {
    const data = normalizeLoaded({ cloudStatus: 'launching', cloudTask: 'Tarefa', cloudCwd: '/p' })

    expect(data.cloudStatus).toBe('failed')
    expect(data.cloudError?.code).toBe('interrupted')
    expect(data.cloudTask).toBe('Tarefa')
  })

  it('dados que não são um objeto viram um rascunho vazio', () => {
    for (const raw of [undefined, null, 'texto', 42, []]) {
      expect(normalizeLoaded(raw)).toMatchObject({ cloudStatus: 'draft', cloudTask: '', cloudFollowUps: [] })
    }
  })

  it('status desconhecido vira rascunho', () => {
    expect(normalizeLoaded({ cloudStatus: 'qualquer', cloudTask: 'T' }).cloudStatus).toBe('draft')
  })

  it('created sem uma sessão válida volta a rascunho em vez de mostrar um cartão quebrado', () => {
    const semSessao = normalizeLoaded({ cloudStatus: 'created', cloudTask: 'T' })
    const urlRuim = normalizeLoaded({
      cloudStatus: 'created',
      cloudSession: { id: ID, url: 'https://evil.example/x', title: 'x', createdAt: NOW },
    })

    expect(semSessao.cloudStatus).toBe('draft')
    expect(urlRuim.cloudStatus).toBe('draft')
    expect(urlRuim.cloudSession).toBeUndefined()
  })

  it('preserva um cartão criado válido', () => {
    const data = normalizeLoaded({
      cloudStatus: 'created',
      cloudTask: 'T',
      cloudCwd: '/p',
      cloudAccountId: 'conta-a',
      cloudSession: { ...SESSION, createdAt: NOW },
      cloudFollowUps: [{ at: NOW, text: 'oi', ok: true }],
    })

    expect(data.cloudStatus).toBe('created')
    expect(data.cloudSession).toEqual({ ...SESSION, createdAt: NOW })
    expect(data.cloudFollowUps).toHaveLength(1)
  })

  it('corta a tarefa no limite e descarta follow-ups inválidos e o excesso', () => {
    const muitos = Array.from({ length: 30 }, (_, i) => ({ at: NOW, text: `m${i}`, ok: true }))

    const data = normalizeLoaded({
      cloudStatus: 'created',
      cloudSession: { ...SESSION, createdAt: NOW },
      cloudTask: 'a'.repeat(CLOUD_TASK_MAX + 50),
      cloudFollowUps: [{ texto: 'sem campos certos' }, 'lixo', ...muitos],
    })

    expect(data.cloudTask).toHaveLength(CLOUD_TASK_MAX)
    expect(data.cloudFollowUps).toHaveLength(CLOUD_FOLLOW_UP_LIMIT)
    expect(data.cloudFollowUps?.every((entry) => entry.ok === true)).toBe(true)
  })

  it('um código de erro desconhecido vira unknown', () => {
    const data = normalizeLoaded({
      cloudStatus: 'failed',
      cloudError: { code: 'codigo-inventado', message: 'x' },
    })

    expect(data.cloudError?.code).toBe('unknown')
  })

  it('campos de outros tipos de bloco passados juntos são ignorados', () => {
    const data = normalizeLoaded({ cloudStatus: 'draft', command: 'claude', accountId: 'x', orderIndex: 3 })

    expect(Object.keys(data).every((key) => key.startsWith('cloud'))).toBe(true)
  })
})

describe('isCloudSessionUrl', () => {
  it('só aceita https://claude.ai/code/session_*', () => {
    expect(isCloudSessionUrl(URL_OK)).toBe(true)
    expect(isCloudSessionUrl(`https://claude.ai/code/${ID}`)).toBe(true)
    expect(isCloudSessionUrl(`http://claude.ai/code/${ID}`)).toBe(false)
    expect(isCloudSessionUrl(`https://claude.ai.evil.example/code/${ID}`)).toBe(false)
    expect(isCloudSessionUrl(`https://evil.example/?u=https://claude.ai/code/${ID}`)).toBe(false)
    expect(isCloudSessionUrl('https://claude.ai/code/')).toBe(false)
    expect(isCloudSessionUrl(undefined)).toBe(false)
  })
})

describe('normalizeLoaded: o ID da sessão tem que ser o do link', () => {
  it('descarta a sessão quando o ID é só um prefixo do ID do link', () => {
    const data = normalizeLoaded({
      cloudStatus: 'created',
      cloudSession: {
        id: 'session_AB',
        url: 'https://claude.ai/code/session_ABC?from=cli',
        title: 'x',
        createdAt: NOW,
      },
    })

    expect(data.cloudStatus).toBe('draft')
    expect(data.cloudSession).toBeUndefined()
  })

  it('aceita quando o ID é exatamente o do link', () => {
    const data = normalizeLoaded({ cloudStatus: 'created', cloudSession: { ...SESSION, createdAt: NOW } })

    expect(data.cloudStatus).toBe('created')
  })
})
