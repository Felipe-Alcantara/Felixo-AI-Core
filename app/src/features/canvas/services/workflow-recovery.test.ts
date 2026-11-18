import { describe, expect, it } from 'vitest'
import {
  MAX_PARALLEL_RESUMES,
  READY_TIMEOUT_MS,
  SETTLE_MS,
  advanceResumeRun,
  interruptedAgentIds,
  isResumeRunFinished,
  orderByDelivery,
  startResumeRun,
  workMarkPatch,
} from './workflow-recovery'

describe('workMarkPatch', () => {
  it('grava o ponto quando o agente passa a trabalhar e não regrava o mesmo estado', () => {
    const patch = workMarkPatch('working', undefined, 10)
    expect(patch).toEqual({ workMark: { state: 'working', at: 10 } })
    expect(workMarkPatch('working', patch!.workMark, 20)).toBeNull()
    expect(workMarkPatch('waiting_approval', patch!.workMark, 20)).toEqual({
      workMark: { state: 'waiting_approval', at: 20 },
    })
  })

  it('só o idle apaga o ponto; sair ou falhar o preserva', () => {
    const mark = { state: 'working', at: 1 }
    expect(workMarkPatch('idle', mark, 5)).toEqual({ workMark: undefined })
    expect(workMarkPatch('idle', undefined, 5)).toBeNull()
    expect(workMarkPatch('exited', mark, 5)).toBeNull()
    expect(workMarkPatch('error', mark, 5)).toBeNull()
    expect(workMarkPatch('starting', mark, 5)).toBeNull()
  })
})

describe('interruptedAgentIds', () => {
  const mark = { state: 'working', at: 1 }
  const session = { version: 1, provider: 'claude', sessionId: 'session-12345', cwd: '/repo', capturedAt: 1 }
  it('pede ponto de salvamento e conversa associada', () => {
    expect(
      interruptedAgentIds([
        { id: 'a', type: 'terminal', data: { workMark: mark, agentSession: session } },
        { id: 'b', type: 'terminal', data: { workMark: mark } },
        { id: 'c', type: 'terminal', data: { agentSession: session } },
        { id: 'f', type: 'terminal', data: { workMark: mark, agentSession: { sessionId: 'x' } } },
        { id: 'd', type: 'file', data: { workMark: mark, agentSession: session } },
        { id: 'e', type: 'terminal', data: { workMark: { state: 'x' }, agentSession: session } },
      ]),
    ).toEqual(['a'])
  })
})

describe('orderByDelivery', () => {
  it('põe quem entrega antes de quem recebe', () => {
    const edges = [
      { source: 'coord', target: 'p1' },
      { source: 'coord', target: 'p2' },
      { source: 'p1', target: 'check' },
      { source: 'p2', target: 'check' },
    ]
    expect(orderByDelivery(['check', 'p2', 'p1', 'coord'], edges)).toEqual(['coord', 'p2', 'p1', 'check'])
  })

  it('ignora ligações fora do conjunto e sobrevive a ciclo', () => {
    expect(orderByDelivery(['a', 'b'], [{ source: 'x', target: 'a' }])).toEqual(['a', 'b'])
    expect(
      orderByDelivery(['a', 'b'], [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }]),
    ).toEqual(['a', 'b'])
  })
})

describe('advanceResumeRun', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f']
  const allIdle = Object.fromEntries(ids.map((id) => [id, 'idle' as const]))

  it('envia no máximo MAX_PARALLEL_RESUMES por vez, na ordem', () => {
    const first = advanceResumeRun(startResumeRun(ids, 0), allIdle, 1)
    expect(first.send).toEqual(ids.slice(0, MAX_PARALLEL_RESUMES))
    // Os quatro começaram a trabalhar: ninguém novo sai.
    const working = { ...allIdle, a: 'working', b: 'working', c: 'working', d: 'working' } as const
    const second = advanceResumeRun(first.run, working, 2)
    expect(second.send).toEqual([])
    // `a` termina o turno: abre uma vaga.
    const third = advanceResumeRun(second.run, { ...working, a: 'idle' }, 3)
    expect(third.run.entries.a.phase).toBe('done')
    expect(third.send).toEqual(['e'])
  })

  it('quem espera decisão da pessoa não ocupa vaga', () => {
    const first = advanceResumeRun(startResumeRun(ids, 0), allIdle, 1)
    const stuck = { ...allIdle, a: 'waiting_approval', b: 'waiting_approval', c: 'working', d: 'working' } as const
    expect(advanceResumeRun(first.run, stuck, 2).send).toEqual(['e', 'f'])
  })

  it('desiste do agente que não ficou pronto no prazo e termina a rodada', () => {
    const run = startResumeRun(['a', 'b'], 0)
    const early = advanceResumeRun(run, { a: 'starting', b: 'idle' }, READY_TIMEOUT_MS)
    expect(early.run.entries.a.phase).toBe('waiting')
    const late = advanceResumeRun(early.run, { a: 'starting', b: 'idle' }, READY_TIMEOUT_MS + 1)
    expect(late.run.entries.a.phase).toBe('skipped')
    expect(isResumeRunFinished(late.run)).toBe(false)
    const done = advanceResumeRun(late.run, { a: 'starting', b: 'idle' }, READY_TIMEOUT_MS + SETTLE_MS + 2)
    expect(isResumeRunFinished(done.run)).toBe(true)
  })
})
