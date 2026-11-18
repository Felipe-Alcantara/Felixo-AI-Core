import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ApprovalPanelView } from '../components/ApprovalPanel'
import { applyProviderSwitchEvent } from '../../chat/services/provider-switch'
import type { ProviderSwitchRequest } from '../../chat/types'
import type { CanvasAgentLaunchRequest, CanvasAgentQuestion } from '../types'
import { buildApprovalQueue, runApprovalAction, type ApprovalTransport } from './approval-queue'

function decision(overrides: Partial<ProviderSwitchRequest>): ProviderSwitchRequest {
  return {
    decisionId: 'd1',
    kind: 'permission',
    runId: 'r1',
    agentId: 'conversa',
    parentThreadId: 't1',
    sessionId: 's1',
    fromCliType: 'codex-app-server',
    toCliType: 'codex-app-server',
    toModelId: null,
    toModelName: null,
    permissionDetail: 'npm publish',
    rule: 'cli-permission',
    reason: 'Rodar comando',
    requestedAt: '2026-11-18T14:00:00.000Z',
    expiresAt: '2026-11-18T14:10:00.000Z',
    ...overrides,
  }
}

function question(overrides: Partial<CanvasAgentQuestion> = {}): CanvasAgentQuestion {
  return {
    id: 'q1',
    acao: 'perguntar',
    pergunta: 'Qual branch?',
    opcoes: [{ label: 'main' }, { label: 'dev', descricao: 'só homologação' }],
    estado: 'pendente',
    pedidoEm: '2026-11-18T14:05:00.000Z',
    origem: 'Agente B',
    ...overrides,
  }
}

const transport = (): ApprovalTransport => ({
  respondDecision: vi.fn().mockResolvedValue({ ok: true }),
  answerQuestion: vi.fn().mockResolvedValue({ ok: true }),
  decideLaunch: vi.fn().mockResolvedValue({ ok: true, abrir: [] }),
})

function launch(overrides: Partial<CanvasAgentLaunchRequest> = {}): CanvasAgentLaunchRequest {
  return {
    id: 'l1',
    acao: 'abrir-agentes',
    tarefas: [{ titulo: 'Task A' }, { titulo: 'Task B', contexto: 'detalhe' }, { titulo: 'Task C' }],
    estado: 'pendente',
    pedidoEm: '2026-11-18T14:10:00.000Z',
    origem: 'P:/projeto',
    ...overrides,
  }
}

describe('fila de aprovações pendentes', () => {
  const dois = [
    decision({ decisionId: 'd2', agentId: 'sub-2', kind: 'cost', spentUsd: 5, capUsd: 5, requestedAt: '2026-11-18T14:02:00.000Z' }),
    decision({ decisionId: 'd1' }),
  ]

  it('junta decisões e perguntas de agentes diferentes, do mais antigo ao mais novo, sem as já respondidas', () => {
    const items = buildApprovalQueue({
      decisions: dois,
      questions: [question(), question({ id: 'q0', estado: 'aceito' })],
    })

    expect(items.map((item) => item.key)).toEqual(['decision:d1', 'decision:d2', 'question:q1'])
    expect(items[0].title).toBe('Permitir? Rodar comando')
    expect(items[1].title).toBe('Continuar acima do teto de custo?')
    expect(items[2].actions.map((action) => action.label)).toEqual(['main', 'dev', 'Dispensar'])
  })

  it('o painel mostra os dois pedidos simultâneos com os botões de cada um', () => {
    const items = buildApprovalQueue({ decisions: dois, questions: [] })
    const html = renderToStaticMarkup(
      createElement(ApprovalPanelView, { items, open: true, busyKey: null, error: null, onToggle() {}, onAct() {} }),
    )

    expect(html).toContain('2 aprovações pendentes')
    expect(html).toContain('Permitir? Rodar comando')
    expect(html).toContain('Continuar acima do teto de custo?')
    expect(html).toContain('Sub-agente sub-2')
    expect(html).toContain('Permitir')
    expect(html).toContain('Negar')
    expect(html).toContain('lembrete às 12h e 18h')
  })

  it('fechado, mostra só a contagem; sem pedidos, não renderiza nada', () => {
    const items = buildApprovalQueue({ decisions: dois })
    const fechado = renderToStaticMarkup(
      createElement(ApprovalPanelView, { items, open: false, busyKey: null, error: null, onToggle() {}, onAct() {} }),
    )
    expect(fechado).toContain('2 aprovações pendentes')
    expect(fechado).not.toContain('Negar')

    const vazio = renderToStaticMarkup(
      createElement(ApprovalPanelView, { items: [], open: true, busyKey: null, error: null, onToggle() {}, onAct() {} }),
    )
    expect(vazio).toBe('')
  })

  it('resolver um pedido tira só ele da fila; o outro segue esperando', async () => {
    const t = transport()
    const items = buildApprovalQueue({ decisions: dois, questions: [question()] })
    const permissao = items.find((item) => item.key === 'decision:d1')!

    expect(await runApprovalAction(permissao, 'refuse', t)).toEqual({ ok: true })
    expect(t.respondDecision).toHaveBeenCalledWith({ decisionId: 'd1', accept: false })

    // O main avisa pelo stream que d1 foi resolvido: a fila perde só d1.
    const restante = applyProviderSwitchEvent(dois, {
      type: 'provider_switch_resolved',
      decisionId: 'd1',
      agentId: 'conversa',
      outcome: 'refused',
      message: 'Permissão negada.',
      sessionId: 's1',
    })
    expect(buildApprovalQueue({ decisions: restante, questions: [question()] }).map((item) => item.key)).toEqual([
      'decision:d2',
      'question:q1',
    ])
  })

  it('responde pergunta pelo índice da opção e dispensa com índice nulo', async () => {
    const t = transport()
    const [pergunta] = buildApprovalQueue({ questions: [question()] })

    await runApprovalAction(pergunta, 'option:1', t)
    expect(t.answerQuestion).toHaveBeenLastCalledWith({ id: 'q1', indice: 1 })
    await runApprovalAction(pergunta, 'dismiss', t)
    expect(t.answerQuestion).toHaveBeenLastCalledWith({ id: 'q1', indice: null })
  })

  it('ação inexistente não chega ao IPC; pedido que o main não tem mais vira "stale"', async () => {
    const t = transport()
    const [permissao] = buildApprovalQueue({ decisions: [decision({})] })

    expect((await runApprovalAction(permissao, 'option:9', t)).ok).toBe(false)
    expect(t.respondDecision).not.toHaveBeenCalled()

    vi.mocked(t.respondDecision).mockResolvedValue({ ok: false, code: 'DECISION_NOT_PENDING' })
    expect(await runApprovalAction(permissao, 'accept', t)).toMatchObject({ ok: false, stale: true })
  })

  it('pedido de agentes entra na fila com as tasks listadas e os botões de aceitar e recusar', () => {
    const items = buildApprovalQueue({
      decisions: dois,
      questions: [question()],
      launches: [launch(), launch({ id: 'l0', estado: 'aceito' })],
    })

    expect(items.map((item) => item.key)).toEqual(['decision:d1', 'decision:d2', 'question:q1', 'launch:l1'])
    const pedido = items[3]
    expect(pedido.title).toBe('Um coordenador pede 3 agentes, um por task')
    expect(pedido.details).toEqual(['1. Task A', '2. Task B', '3. Task C'])
    expect(pedido.origin).toBe('Coordenador em P:/projeto')
    expect(pedido.actions.map((action) => action.label)).toEqual(['Abrir 3 agentes', 'Recusar'])
  })

  it('aceitar devolve as tasks que o main autorizou e a pasta do coordenador; o app só abre isso', async () => {
    const t = transport()
    vi.mocked(t.decideLaunch).mockResolvedValue({ ok: true, abrir: [{ titulo: 'Task A' }, { titulo: 'Task B' }] })
    const [pedido] = buildApprovalQueue({ launches: [launch()] })

    const resultado = await runApprovalAction(pedido, 'accept', t)

    expect(t.decideLaunch).toHaveBeenCalledWith({ id: 'l1', aceitar: true })
    expect(resultado).toEqual({ ok: true, opened: { tasks: [{ titulo: 'Task A' }, { titulo: 'Task B' }], cwd: 'P:/projeto' } })
  })

  it('recusar não abre nada; aceitar com teto estourado vira mensagem, não terminal', async () => {
    const t = transport()
    const [pedido] = buildApprovalQueue({ launches: [launch()] })

    expect(await runApprovalAction(pedido, 'refuse', t)).toEqual({ ok: true })
    expect(t.decideLaunch).toHaveBeenLastCalledWith({ id: 'l1', aceitar: false })

    vi.mocked(t.decideLaunch).mockResolvedValue({ ok: true, abrir: [], message: 'Teto "Agentes no total" (10) atingido.' })
    expect(await runApprovalAction(pedido, 'accept', t)).toEqual({ ok: false, message: 'Teto "Agentes no total" (10) atingido.' })

    vi.mocked(t.decideLaunch).mockResolvedValue({ ok: false, message: 'Esse pedido não está mais pendente.' })
    expect(await runApprovalAction(pedido, 'accept', t)).toMatchObject({ ok: false, message: 'Esse pedido não está mais pendente.' })
  })
})
