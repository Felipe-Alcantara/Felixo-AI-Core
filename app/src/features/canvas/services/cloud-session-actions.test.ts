import { describe, expect, it, vi } from 'vitest'
import type { CloudSessionBridge } from '../../shared/types/cloud-session'
import type { CloudSessionNodeData } from '../types'
import {
  CLOUD_SESSION_BRIDGE_ERROR,
  CLOUD_SESSION_UNAVAILABLE,
  runFollowUp,
  runLaunch,
} from './cloud-session-actions'

const ID = 'session_01EXEMPLO0000000000000000'
const URL_OK = `https://claude.ai/code/${ID}?from=cli&m=0`
const NOW = '2026-10-12T01:00:00.000Z'
const SESSION = { id: ID, url: URL_OK, title: 'Resposta' }

const draft: CloudSessionNodeData = {
  cloudStatus: 'draft',
  cloudTask: 'Corrigir o bug',
  cloudCwd: '/projeto',
  cloudAccountId: 'conta-a',
  cloudFollowUps: [],
}
const created: CloudSessionNodeData = {
  ...draft,
  cloudStatus: 'created',
  cloudSession: { ...SESSION, createdAt: NOW },
}

function makeBridge(overrides: Partial<CloudSessionBridge> = {}): CloudSessionBridge {
  return {
    launch: vi.fn().mockResolvedValue({ ok: true, session: SESSION }),
    followUp: vi.fn().mockResolvedValue({ ok: true }),
    open: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  }
}

/** `null` simula uma versão do app sem a ponte (`undefined` ativaria o valor padrão). */
function setup(current: CloudSessionNodeData, bridge: CloudSessionBridge | null = makeBridge()) {
  const changes: CloudSessionNodeData[] = []
  const params = {
    nodeId: 'no-1',
    current,
    latest: () => current,
    bridge: bridge ?? undefined,
    now: () => NOW,
    change: (patch: CloudSessionNodeData) => changes.push(patch),
  }
  return { params, changes, bridge: bridge ?? undefined }
}

describe('runLaunch', () => {
  it('marca disparando antes de chamar o main e grava a sessão criada com o horário', async () => {
    const { params, changes, bridge } = setup(draft)

    const outcome = await runLaunch(params)

    expect(outcome).toEqual({ started: true })
    expect(bridge?.launch).toHaveBeenCalledExactlyOnceWith({
      nodeId: 'no-1',
      task: 'Corrigir o bug',
      cwd: '/projeto',
      accountId: 'conta-a',
    })
    expect(changes.map((patch) => patch.cloudStatus)).toEqual(['launching', 'created'])
    expect(changes[1].cloudSession).toEqual({ ...SESSION, createdAt: NOW })
  })

  it('grava a falha com o código e a mensagem que o main devolveu', async () => {
    const bridge = makeBridge({
      launch: vi.fn().mockResolvedValue({ ok: false, code: 'trust-required', message: 'confie na pasta' }),
    })
    const { params, changes } = setup(draft, bridge)

    await runLaunch(params)

    expect(changes.at(-1)).toMatchObject({
      cloudStatus: 'failed',
      cloudError: { code: 'trust-required', message: 'confie na pasta' },
      cloudTask: 'Corrigir o bug',
    })
  })

  it('sem a ponte do main avisa que o recurso não existe e não altera o cartão', async () => {
    const { params, changes } = setup(draft, null)

    const outcome = await runLaunch(params)

    expect(outcome).toEqual({ started: false, message: CLOUD_SESSION_UNAVAILABLE })
    expect(changes).toEqual([])
  })

  it('não dispara sem tarefa, sem pasta ou com o cartão já criado', async () => {
    for (const current of [{ ...draft, cloudTask: '  ' }, { ...draft, cloudCwd: '' }, created]) {
      const { params, changes, bridge } = setup(current)

      const outcome = await runLaunch(params)

      expect(outcome).toEqual({ started: false })
      expect(changes).toEqual([])
      expect(bridge?.launch).not.toHaveBeenCalled()
    }
  })

  it('uma exceção na ponte vira falha desconhecida e nunca rejeita a promessa', async () => {
    const bridge = makeBridge({ launch: vi.fn().mockRejectedValue(new Error('IPC caiu')) })
    const { params, changes } = setup(draft, bridge)

    const outcome = await runLaunch(params)

    expect(outcome).toEqual({ started: true })
    expect(changes.at(-1)).toMatchObject({
      cloudStatus: 'failed',
      cloudError: { code: 'unknown', message: CLOUD_SESSION_BRIDGE_ERROR },
    })
  })

  it('monta o resultado sobre os dados mais recentes, não sobre os de quando clicou', async () => {
    const maisRecente = { ...draft, cloudTask: 'Tarefa editada durante o disparo' }
    const { params, changes } = setup(draft)

    await runLaunch({ ...params, latest: () => maisRecente })

    expect(changes.at(-1)?.cloudTask).toBe('Tarefa editada durante o disparo')
  })
})

describe('runFollowUp', () => {
  it('envia o texto sem espaços nas pontas e registra o envio como bem-sucedido', async () => {
    const { params, changes, bridge } = setup(created)

    const outcome = await runFollowUp({ ...params, text: '  Agora responda pronto  ' })

    expect(outcome).toEqual({ sent: true })
    expect(bridge?.followUp).toHaveBeenCalledExactlyOnceWith({
      nodeId: 'no-1',
      sessionId: ID,
      text: 'Agora responda pronto',
      cwd: '/projeto',
      accountId: 'conta-a',
    })
    expect(changes).toHaveLength(1)
    expect(changes[0].cloudFollowUps).toEqual([{ at: NOW, text: 'Agora responda pronto', ok: true }])
  })

  it('registra a falha com o código e devolve a mensagem para a tela', async () => {
    const bridge = makeBridge({
      followUp: vi.fn().mockResolvedValue({ ok: false, code: 'timeout', message: 'demorou demais' }),
    })
    const { params, changes } = setup(created, bridge)

    const outcome = await runFollowUp({ ...params, text: 'oi' })

    expect(outcome).toEqual({ sent: false, message: 'demorou demais' })
    expect(changes[0].cloudFollowUps).toEqual([{ at: NOW, text: 'oi', ok: false, error: 'timeout' }])
  })

  it('não envia texto vazio nem a um cartão que ainda não tem sessão', async () => {
    for (const [current, text] of [
      [created, '   '],
      [draft, 'oi'],
      [{ ...created, cloudSession: undefined }, 'oi'],
    ] as const) {
      const { params, changes, bridge } = setup(current)

      const outcome = await runFollowUp({ ...params, text })

      expect(outcome).toEqual({ sent: false })
      expect(changes).toEqual([])
      expect(bridge?.followUp).not.toHaveBeenCalled()
    }
  })

  it('sem a ponte do main avisa que o recurso não existe', async () => {
    const { params, changes } = setup(created, null)

    const outcome = await runFollowUp({ ...params, text: 'oi' })

    expect(outcome).toEqual({ sent: false, message: CLOUD_SESSION_UNAVAILABLE })
    expect(changes).toEqual([])
  })

  it('uma exceção na ponte devolve a mensagem e não grava um envio que não aconteceu', async () => {
    const bridge = makeBridge({ followUp: vi.fn().mockRejectedValue(new Error('IPC caiu')) })
    const { params, changes } = setup(created, bridge)

    const outcome = await runFollowUp({ ...params, text: 'oi' })

    expect(outcome).toEqual({ sent: false, message: CLOUD_SESSION_BRIDGE_ERROR })
    expect(changes).toEqual([])
  })
})
