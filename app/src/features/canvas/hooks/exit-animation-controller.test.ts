import { describe, expect, it, vi } from 'vitest'
import { createExitAnimationController } from './exit-animation-controller'

/** Timer falso e determinístico: sem `setTimeout` real, sem esperar nada. */
function createFakeClock() {
  let nextId = 1
  const pending = new Map<number, { at: number; callback: () => void }>()
  let now = 0

  return {
    setTimeoutFn: (callback: () => void, ms: number) => {
      const id = nextId++
      pending.set(id, { at: now + ms, callback })
      return id as unknown as ReturnType<typeof setTimeout>
    },
    clearTimeoutFn: (handle: ReturnType<typeof setTimeout>) => {
      pending.delete(handle as unknown as number)
    },
    advance(ms: number) {
      now += ms
      // Uma ordem estável (por id de agendamento) evita depender da ordem de
      // iteração do Map para quem agenda dois timers no mesmo `advance`.
      for (const [id, entry] of [...pending.entries()].sort((a, b) => a[0] - b[0])) {
        if (entry.at <= now) {
          pending.delete(id)
          entry.callback()
        }
      }
    },
    pendingCount: () => pending.size,
  }
}

function setup({ skip = false } = {}) {
  const clock = createFakeClock()
  const onClosed = vi.fn()
  const closingStates: boolean[] = []
  const controller = createExitAnimationController({
    onClosed,
    shouldSkipAnimation: () => skip,
    onClosingChange: (value) => closingStates.push(value),
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  })
  return { clock, onClosed, closingStates, controller }
}

describe('createExitAnimationController', () => {
  it('marca closing e só chama onClosed depois de durationMs', () => {
    const { clock, onClosed, closingStates, controller } = setup()

    controller.close(160)
    expect(closingStates).toEqual([true])
    expect(controller.isClosing()).toBe(true)
    expect(onClosed).not.toHaveBeenCalled()

    clock.advance(159)
    expect(onClosed).not.toHaveBeenCalled()

    clock.advance(1)
    expect(onClosed).toHaveBeenCalledTimes(1)
    expect(controller.isClosing()).toBe(false)
  })

  it('close() chamado de novo enquanto já fechando é idempotente: não reinicia nem duplica o timer', () => {
    const { clock, onClosed, closingStates, controller } = setup()

    controller.close(160)
    clock.advance(100)
    controller.close(160) // segunda chamada, timer já rodando
    clock.advance(60) // completaria os 160ms da primeira chamada

    expect(onClosed).toHaveBeenCalledTimes(1)
    expect(closingStates).toEqual([true]) // não notifica "closing" de novo
  })

  it('uma SEGUNDA chamada com duração diferente não substitui o timer em curso', () => {
    const { clock, onClosed, controller } = setup()

    controller.close(160)
    controller.close(10) // tentativa de "encurtar"; deve ser ignorada
    clock.advance(15)
    expect(onClosed).not.toHaveBeenCalled() // ainda vale o primeiro close(160)

    clock.advance(145)
    expect(onClosed).toHaveBeenCalledTimes(1)
  })

  it('sem animação (reduced motion / Modo Performance), o delay é 0 — não espera durationMs', () => {
    const { clock, onClosed, controller } = setup({ skip: true })

    controller.close(160)
    expect(onClosed).not.toHaveBeenCalled() // ainda não avançou nem o tick 0

    clock.advance(0)
    expect(onClosed).toHaveBeenCalledTimes(1)
  })

  it('a preferência é lida no INSTANTE de close(), não fixada na criação do controlador', () => {
    let skip = false
    const clock = createFakeClock()
    const onClosed = vi.fn()
    const controller = createExitAnimationController({
      onClosed,
      shouldSkipAnimation: () => skip,
      onClosingChange: () => {},
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
    })

    skip = true // muda DEPOIS do controlador já criado
    controller.close(160)
    clock.advance(0)

    expect(onClosed).toHaveBeenCalledTimes(1)
  })

  it('dispose() cancela o timer pendente e onClosed nunca é chamado — nenhuma animação mede componente desmontado', () => {
    const { clock, onClosed, controller } = setup()

    controller.close(160)
    controller.dispose()
    clock.advance(1000)

    expect(onClosed).not.toHaveBeenCalled()
    expect(controller.isClosing()).toBe(false)
  })

  it('dispose() sem nenhum close() pendente não quebra nem chama onClosed', () => {
    const { onClosed, controller } = setup()

    expect(() => controller.dispose()).not.toThrow()
    expect(onClosed).not.toHaveBeenCalled()
  })

  it('depois de completar um close(), o controlador aceita um novo ciclo (não fica travado)', () => {
    const { clock, onClosed, closingStates, controller } = setup()

    controller.close(160)
    clock.advance(160)
    expect(onClosed).toHaveBeenCalledTimes(1)
    expect(controller.isClosing()).toBe(false)

    controller.close(160) // um segundo ciclo de fechamento, no mesmo controlador
    expect(controller.isClosing()).toBe(true)
    clock.advance(160)

    expect(onClosed).toHaveBeenCalledTimes(2)
    expect(closingStates).toEqual([true, true])
  })

  it('não sobra nenhum timer pendente depois do ciclo completar', () => {
    const { clock, controller } = setup()

    controller.close(160)
    clock.advance(160)

    expect(clock.pendingCount()).toBe(0)
  })
})
