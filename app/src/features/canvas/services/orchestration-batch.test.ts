import { describe, expect, it } from 'vitest'

import type { OrchestrationTask } from '../types'
import {
  MAX_BATCH_TASKS,
  createOrchestration,
  deriveTaskState,
  layoutOrchestrationGroup,
  listOrchestrationBatches,
  parseBatchText,
  patchOrchestrationTask,
  summarizeOrchestration,
} from './orchestration-batch'

const task = (overrides: Partial<OrchestrationTask> = {}): OrchestrationTask => ({
  id: 't1',
  titulo: 'Task A',
  terminalId: 'terminal-1',
  state: 'running',
  ...overrides,
})

describe('parseBatchText', () => {
  it('lê uma task por linha, ignora linhas em branco e aceita "título :: contexto"', () => {
    const { tasks, ignored } = parseBatchText('  Task A  \n\nTask B :: detalhe da B\r\n   \nTask C :: ')

    expect(tasks).toEqual([{ titulo: 'Task A' }, { titulo: 'Task B', contexto: 'detalhe da B' }, { titulo: 'Task C' }])
    expect(ignored).toBe(0)
  })

  it('corta título comprido e passa de 20 tasks contando as que ficaram de fora', () => {
    const lines = Array.from({ length: MAX_BATCH_TASKS + 3 }, (_, index) => (index === 0 ? 'x'.repeat(300) : `t${index}`))
    const { tasks, ignored } = parseBatchText(lines.join('\n'))

    expect(tasks).toHaveLength(MAX_BATCH_TASKS)
    expect(tasks[0].titulo).toHaveLength(120)
    expect(ignored).toBe(3)
  })

  it('texto vazio ou só com separadores não vira task', () => {
    expect(parseBatchText('').tasks).toEqual([])
    expect(parseBatchText(' :: só contexto\n\n').tasks).toEqual([])
  })
})

describe('layoutOrchestrationGroup', () => {
  const child = { width: 400, height: 300 }

  it('põe os terminais numa matriz quase quadrada abaixo da faixa do título e cabe todos no grupo', () => {
    const { groupSize, childPositions } = layoutOrchestrationGroup(3, child)

    expect(childPositions).toHaveLength(3)
    // 3 terminais: 2 colunas e 2 linhas.
    expect(childPositions[0].x).toBe(childPositions[2].x)
    expect(childPositions[1].x).toBeGreaterThan(childPositions[0].x)
    expect(childPositions[2].y).toBeGreaterThan(childPositions[0].y)
    for (const position of childPositions) {
      expect(position.x + child.width).toBeLessThanOrEqual(groupSize.width)
      expect(position.y + child.height).toBeLessThanOrEqual(groupSize.height)
      expect(position.y).toBeGreaterThanOrEqual(48)
    }
  })

  it('um terminal só ocupa uma coluna e nenhum se sobrepõe nos lotes maiores', () => {
    expect(layoutOrchestrationGroup(1, child).childPositions).toHaveLength(1)

    const { childPositions } = layoutOrchestrationGroup(7, child)
    for (let a = 0; a < childPositions.length; a += 1) {
      for (let b = a + 1; b < childPositions.length; b += 1) {
        const apart =
          Math.abs(childPositions[a].x - childPositions[b].x) >= child.width ||
          Math.abs(childPositions[a].y - childPositions[b].y) >= child.height
        expect(apart).toBe(true)
      }
    }
  })
})

describe('createOrchestration', () => {
  it('as tasks com terminal começam rodando e as que passaram do teto esperam com o motivo', () => {
    let next = 0
    const orchestration = createOrchestration({
      tasks: [{ titulo: 'A' }, { titulo: 'B' }, { titulo: 'C' }],
      terminalIds: ['terminal-a', 'terminal-b'],
      waitingNote: 'Teto "Agentes por rodada" (2) atingido.',
      cwd: 'P:/projeto',
      now: new Date('2026-11-18T19:00:00.000Z'),
      newId: () => `task-${(next += 1)}`,
    })

    expect(orchestration.createdAt).toBe('2026-11-18T19:00:00.000Z')
    expect(orchestration.cwd).toBe('P:/projeto')
    expect(orchestration.tasks).toEqual([
      { id: 'task-1', titulo: 'A', terminalId: 'terminal-a', state: 'running' },
      { id: 'task-2', titulo: 'B', terminalId: 'terminal-b', state: 'running' },
      { id: 'task-3', titulo: 'C', state: 'waiting', note: 'Teto "Agentes por rodada" (2) atingido.' },
    ])
    expect(summarizeOrchestration(orchestration.tasks)).toEqual({ total: 3, waiting: 1, running: 2, done: 0, failed: 0 })
  })
})

describe('deriveTaskState', () => {
  it('sem terminal a task espera', () => {
    expect(deriveTaskState(task({ terminalId: undefined, state: 'waiting' }), 'working')).toEqual({ state: 'waiting', worked: false })
  })

  it('trabalhando ou esperando aprovação é rodando e marca que já trabalhou', () => {
    expect(deriveTaskState(task(), 'working')).toEqual({ state: 'running', worked: true })
    expect(deriveTaskState(task(), 'waiting_approval')).toEqual({ state: 'running', worked: true })
  })

  it('ocioso sem ter trabalhado ainda é rodando; ocioso depois de trabalhar é concluída', () => {
    expect(deriveTaskState(task(), 'idle')).toEqual({ state: 'running', worked: false })
    expect(deriveTaskState(task({ worked: true }), 'idle')).toEqual({ state: 'done', worked: true })
  })

  it('sair com código 0 conclui; código diferente de 0 ou erro é falha', () => {
    expect(deriveTaskState(task(), 'exited', 0).state).toBe('done')
    expect(deriveTaskState(task(), 'exited', undefined).state).toBe('done')
    expect(deriveTaskState(task(), 'exited', 1).state).toBe('failed')
    expect(deriveTaskState(task(), 'error').state).toBe('failed')
  })

  it('depois de reiniciar o app (starting) o estado final gravado não volta para rodando', () => {
    expect(deriveTaskState(task({ state: 'done', worked: true }), 'starting').state).toBe('done')
    expect(deriveTaskState(task({ state: 'failed' }), 'starting').state).toBe('failed')
    expect(deriveTaskState(task({ state: 'running' }), 'starting').state).toBe('running')
  })

  it('o que a pessoa marcou à mão vale mais que a atividade do terminal', () => {
    expect(deriveTaskState(task({ state: 'done', manual: true }), 'working').state).toBe('done')
    expect(deriveTaskState(task({ state: 'done', manual: true }), 'error').state).toBe('done')
  })
})

describe('patchOrchestrationTask', () => {
  const orchestration = { createdAt: 'x', tasks: [task(), task({ id: 't2', titulo: 'B' })] }

  it('aplica o patch só na task pedida e não mexe nas outras', () => {
    const next = patchOrchestrationTask(orchestration, 't2', { state: 'done', worked: true })

    expect(next?.tasks[1]).toMatchObject({ id: 't2', state: 'done', worked: true })
    expect(next?.tasks[0]).toBe(orchestration.tasks[0])
  })

  it('devolve null quando nada muda ou a task não existe, para quem grava não gravar à toa', () => {
    expect(patchOrchestrationTask(orchestration, 't1', { state: 'running' })).toBeNull()
    expect(patchOrchestrationTask(orchestration, 'nao-existe', { state: 'done' })).toBeNull()
  })
})

describe('listOrchestrationBatches', () => {
  const lote = (createdAt: string) => ({ createdAt, tasks: [task()] })

  it('lista só os grupos com lote, do mais novo ao mais antigo, e ignora o resto', () => {
    const batches = listOrchestrationBatches([
      { id: 'terminal-1', type: 'terminal', data: { orchestration: lote('2026-11-18T12:00:00.000Z') } },
      { id: 'group-livre', type: 'group', data: { label: 'Grupo' } },
      { id: 'group-velho', type: 'group', data: { label: 'Velho', orchestration: lote('2026-11-18T10:00:00.000Z') } },
      { id: 'group-novo', type: 'group', data: { orchestration: lote('2026-11-18T11:00:00.000Z') } },
      { id: 'group-torto', type: 'group', data: { orchestration: { createdAt: 'x', tasks: 'não é lista' } } },
      { id: 'group-sem-dados', type: 'group' },
    ])

    expect(batches.map((batch) => batch.groupId)).toEqual(['group-novo', 'group-velho'])
    expect(batches.map((batch) => batch.label)).toEqual(['Orquestração', 'Velho'])
  })
})
