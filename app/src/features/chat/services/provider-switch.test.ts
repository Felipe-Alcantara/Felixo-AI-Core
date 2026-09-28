import { describe, expect, it, vi } from 'vitest'

import type {
  ProviderSwitchRequest,
  ProviderSwitchRequestStreamEvent,
  ProviderSwitchRespondResult,
} from '../types'
import {
  applyProviderSwitchEvent,
  createProviderSwitchResponder,
  describeProviderSwitchError,
  formatProviderSwitchDeadline,
  formatProviderSwitchRoute,
  formatProviderSwitchRule,
  formatProviderSwitchWaitingStatus,
  isProviderSwitchExpired,
  mergeProviderSwitchList,
} from './provider-switch'

function request(overrides: Partial<ProviderSwitchRequest> = {}): ProviderSwitchRequest {
  return {
    decisionId: 'decision-1',
    kind: 'initial',
    runId: 'run-1',
    agentId: 'reviewer-1',
    parentThreadId: 'thread-1',
    sessionId: 'session-1',
    fromCliType: 'claude',
    toCliType: 'codex-app-server',
    toModelId: 'codex-main',
    toModelName: 'Codex Main',
    rule: 'provider-fallback',
    reason: 'Claude com limite de uso.',
    requestedAt: '2026-05-01T12:00:00.000Z',
    expiresAt: '2026-05-01T12:10:00.000Z',
    ...overrides,
  }
}

function requestEvent(overrides: Partial<ProviderSwitchRequest> = {}): ProviderSwitchRequestStreamEvent {
  return { ...request(overrides), type: 'provider_switch_request', threadId: 'thread-1' }
}

describe('provider-switch', () => {
  it('mostra a rota pelo provedor, não pelo transporte', () => {
    expect(formatProviderSwitchRoute(request())).toBe('Claude → Codex (Codex Main)')
    expect(formatProviderSwitchRoute(request({ toModelName: null, toCliType: 'gemini-acp' }))).toBe(
      'Claude → Gemini',
    )
    expect(formatProviderSwitchRule('last-resort')).toMatch(/Último recurso/)
    expect(formatProviderSwitchRule(null)).toBeNull()
  })

  it('status do chat nomeia a troca pendente e quantas mais há', () => {
    expect(formatProviderSwitchWaitingStatus([])).toBeNull()
    expect(formatProviderSwitchWaitingStatus([request()])).toBe(
      'Aguardando sua confirmação para trocar Claude → Codex…',
    )
    expect(
      formatProviderSwitchWaitingStatus([request(), request({ decisionId: 'decision-2' })]),
    ).toBe('Aguardando sua confirmação para trocar Claude → Codex… (+1)')
  })

  it('prazo diz o horário e quanto falta', () => {
    const now = Date.parse('2026-05-01T12:01:00.000Z')
    expect(formatProviderSwitchDeadline('2026-05-01T12:10:00.000Z', now)).toMatch(/\(em 9 min\)$/)
    expect(formatProviderSwitchDeadline('2026-05-01T12:10:00.000Z', Date.parse('2026-05-01T12:11:00.000Z'))).toMatch(
      /\(vencida\)$/,
    )
    expect(formatProviderSwitchDeadline('não é data')).toBeNull()
  })

  it('prazo vencido: o card deixa de oferecer a troca', () => {
    const expiresAt = '2026-05-01T12:10:00.000Z'
    expect(isProviderSwitchExpired(expiresAt, Date.parse('2026-05-01T12:09:59.000Z'))).toBe(false)
    expect(isProviderSwitchExpired(expiresAt, Date.parse('2026-05-01T12:10:00.000Z'))).toBe(true)
    expect(isProviderSwitchExpired(expiresAt, Date.parse('2026-05-01T12:10:30.000Z'))).toBe(true)
    expect(isProviderSwitchExpired('não é data', Date.parse('2026-05-01T12:10:30.000Z'))).toBe(false)
  })

  it('aplica pedido e resolução sem duplicar', () => {
    const once = applyProviderSwitchEvent([], requestEvent())
    const twice = applyProviderSwitchEvent(once, requestEvent())
    expect(twice).toHaveLength(1)
    expect(twice[0]).not.toHaveProperty('type')

    const resolved = applyProviderSwitchEvent(twice, {
      type: 'provider_switch_resolved',
      decisionId: 'decision-1',
      agentId: 'reviewer-1',
      outcome: 'expired',
      message: null,
      sessionId: 'session-1',
    })
    expect(resolved).toEqual([])
    expect(
      applyProviderSwitchEvent(resolved, {
        type: 'provider_switch_resolved',
        decisionId: 'outra',
        agentId: 'x',
        outcome: 'refused',
        message: null,
        sessionId: 'session-1',
      }),
    ).toBe(resolved)
  })

  it('a lista do main vence a do stream e o que chegou em voo fica', () => {
    const merged = mergeProviderSwitchList(
      [request({ decisionId: 'decision-1' }), request({ decisionId: 'decision-3' })],
      [request({ decisionId: 'decision-1', reason: 'do main' }), request({ decisionId: 'decision-2' })],
    )
    expect(merged.map((entry) => entry.decisionId)).toEqual(['decision-1', 'decision-2', 'decision-3'])
    expect(merged[0].reason).toBe('do main')
  })

  it('erros do main viram texto claro', () => {
    expect(describeProviderSwitchError({ ok: false, code: 'DECISION_NOT_PENDING' })).toMatch(
      /já foi respondida ou expirou/,
    )
    expect(describeProviderSwitchError({ ok: false, code: 'RUN_FINISHED' })).toMatch(/já terminou/)
    expect(describeProviderSwitchError(null)).toMatch(/Não foi possível/)
  })

  it('clique duplo gera uma chamada só', async () => {
    let finish: (result: ProviderSwitchRespondResult) => void = () => {}
    const send = vi.fn(
      () =>
        new Promise<ProviderSwitchRespondResult>((resolve) => {
          finish = resolve
        }),
    )
    const respond = createProviderSwitchResponder(send)

    const first = respond('decision-1', true)
    const second = respond('decision-1', true)
    const otherButton = respond('decision-1', false)
    finish({ ok: true, outcome: 'accepted' })

    await expect(first).resolves.toEqual({ ok: true, outcome: 'accepted' })
    await expect(second).resolves.toEqual({ ok: true, outcome: 'accepted' })
    await expect(otherButton).resolves.toEqual({ ok: true, outcome: 'accepted' })
    await expect(respond('decision-1', false)).resolves.toMatchObject({ code: 'DECISION_NOT_PENDING' })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({ decisionId: 'decision-1', accept: true })
  })

  it('falha de IPC libera nova tentativa', async () => {
    const send = vi
      .fn<(params: { decisionId: string; accept: boolean }) => Promise<ProviderSwitchRespondResult>>()
      .mockRejectedValueOnce(new Error('ipc caiu'))
      .mockResolvedValueOnce({ ok: true, outcome: 'refused' })
    const respond = createProviderSwitchResponder(send)

    await expect(respond('decision-1', false)).resolves.toMatchObject({ ok: false })
    await expect(respond('decision-1', false)).resolves.toEqual({ ok: true, outcome: 'refused' })
    expect(send).toHaveBeenCalledTimes(2)
  })
})
