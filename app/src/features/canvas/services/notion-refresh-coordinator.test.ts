import { describe, expect, it, vi } from 'vitest'
import { createRefreshCoordinator, targetChanged } from './notion-refresh-coordinator'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('createRefreshCoordinator', () => {
  it('executa um único trigger normalmente', async () => {
    const coordinator = createRefreshCoordinator()
    const run = vi.fn(async () => {})

    await coordinator.trigger(run)

    expect(run).toHaveBeenCalledTimes(1)
  })

  it('nunca roda dois runners em paralelo — um trigger durante outro só faz fila', async () => {
    const coordinator = createRefreshCoordinator()
    const order: string[] = []
    const first = deferred<void>()

    const runA = vi.fn(async () => {
      order.push('a-start')
      await first.promise
      order.push('a-end')
    })
    const runB = vi.fn(async () => {
      order.push('b-start')
      order.push('b-end')
    })

    const triggerA = coordinator.trigger(runA)
    // B chega enquanto A ainda está em andamento.
    const triggerB = coordinator.trigger(runB)

    // B não pode ter começado ainda — A ainda não liberou.
    expect(order).toEqual(['a-start'])

    first.resolve()
    await Promise.all([triggerA, triggerB])

    // A termina por completo antes de B começar — nunca intercalados.
    expect(order).toEqual(['a-start', 'a-end', 'b-start', 'b-end'])
    expect(runA).toHaveBeenCalledTimes(1)
    expect(runB).toHaveBeenCalledTimes(1)
  })

  it('dois triggers concorrentes colapsam numa única execução extra — o mais recente vence', async () => {
    const coordinator = createRefreshCoordinator()
    const first = deferred<void>()
    const runA = vi.fn(async () => {
      await first.promise
    })
    const runB = vi.fn(async () => {})
    const runC = vi.fn(async () => {})

    const triggerA = coordinator.trigger(runA)
    // B e C chegam os dois enquanto A está em andamento — só a execução
    // pendente mais recente (C) deveria rodar depois de A, nunca as duas.
    void coordinator.trigger(runB)
    const triggerC = coordinator.trigger(runC)

    first.resolve()
    await Promise.all([triggerA, triggerC])

    expect(runA).toHaveBeenCalledTimes(1)
    expect(runB).toHaveBeenCalledTimes(0)
    expect(runC).toHaveBeenCalledTimes(1)
  })

  it('runner que lança erro não trava o coordinator pra sempre', async () => {
    const coordinator = createRefreshCoordinator()
    const failing = vi.fn(async () => {
      throw new Error('falhou')
    })
    const after = vi.fn(async () => {})

    await expect(coordinator.trigger(failing)).rejects.toThrow('falhou')
    await coordinator.trigger(after)

    expect(after).toHaveBeenCalledTimes(1)
  })
})

describe('targetChanged', () => {
  it('false quando conexão e tabela continuam as mesmas', () => {
    expect(
      targetChanged(
        { connectionId: 'c1', dataSourceId: 'd1' },
        { connectionId: 'c1', dataSourceId: 'd1' },
      ),
    ).toBe(false)
  })

  it('true quando a conexão mudou', () => {
    expect(
      targetChanged(
        { connectionId: 'c1', dataSourceId: 'd1' },
        { connectionId: 'c2', dataSourceId: 'd1' },
      ),
    ).toBe(true)
  })

  it('true quando a tabela mudou', () => {
    expect(
      targetChanged(
        { connectionId: 'c1', dataSourceId: 'd1' },
        { connectionId: 'c1', dataSourceId: 'd2' },
      ),
    ).toBe(true)
  })
})
