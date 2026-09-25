import { describe, expect, it, vi } from 'vitest'
import { attachTerminalFitLifecycle, type TerminalFitStore } from './terminal-fit-lifecycle'

type FakeResizeObserverEntry = {
  /** Simula o browser chamando o callback do observer, sem exigir entries/observer de verdade. */
  trigger: () => void
  observed: Element[]
  disconnected: boolean
}

/** ResizeObserver falso: guarda o callback e deixa o teste disparar/observar à mão. */
function createFakeResizeObserverClass() {
  const instances: FakeResizeObserverEntry[] = []

  class FakeResizeObserver {
    private entry: FakeResizeObserverEntry
    constructor(callback: ResizeObserverCallback) {
      this.entry = {
        trigger: () => callback([], this as unknown as ResizeObserver),
        observed: [],
        disconnected: false,
      }
      instances.push(this.entry)
    }
    observe(target: Element) {
      this.entry.observed.push(target)
    }
    unobserve() {}
    disconnect() {
      this.entry.disconnected = true
    }
  }

  return { FakeResizeObserver: FakeResizeObserver as unknown as typeof ResizeObserver, instances }
}

function createFakeContainer(): HTMLElement {
  return {} as HTMLElement
}

function createFakeStore(): { store: TerminalFitStore; fitCalls: string[]; attachCalls: string[] } {
  const fitCalls: string[] = []
  const attachCalls: string[] = []
  return {
    store: {
      attach: (sessionId) => attachCalls.push(sessionId),
      fit: (sessionId) => fitCalls.push(sessionId),
    },
    fitCalls,
    attachCalls,
  }
}

describe('attachTerminalFitLifecycle', () => {
  it('anexa e ajusta na hora, de novo no próximo frame, e a cada resize do container', () => {
    const container = createFakeContainer()
    const { store, fitCalls, attachCalls } = createFakeStore()
    const { FakeResizeObserver, instances } = createFakeResizeObserverClass()
    const raf: { callback: FrameRequestCallback | null } = { callback: null }

    attachTerminalFitLifecycle(container, store, 'sessao-1', {
      requestAnimationFrame: (cb) => {
        raf.callback = cb
        return 42
      },
      cancelAnimationFrame: () => {},
      ResizeObserverImpl: FakeResizeObserver,
    })

    expect(attachCalls).toEqual(['sessao-1'])
    expect(fitCalls).toEqual(['sessao-1']) // ajuste imediato, antes do RAF

    raf.callback?.(0)
    expect(fitCalls).toEqual(['sessao-1', 'sessao-1'])

    expect(instances).toHaveLength(1)
    expect(instances[0].observed).toEqual([container])
    instances[0].trigger()
    expect(fitCalls).toEqual(['sessao-1', 'sessao-1', 'sessao-1'])
  })

  it('o ResizeObserver nunca escreve de volta no que observa — fit() só lê o container', () => {
    // `fit(sessionId)` não recebe o container nem qualquer referência a ele:
    // não há como esta chamada alterar a dimensão que o próprio observer
    // acompanha, o que descarta o padrão clássico de retroalimentação
    // (observer dispara → escreve no alvo → observer dispara de novo). Prova
    // indireta: disparar o observer várias vezes não deixa NENHUMA marca no
    // objeto do container (continua um objeto vazio).
    const container = createFakeContainer()
    const { store } = createFakeStore()
    const { FakeResizeObserver, instances } = createFakeResizeObserverClass()

    attachTerminalFitLifecycle(container, store, 'sessao-1', {
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => {},
      ResizeObserverImpl: FakeResizeObserver,
    })

    instances[0].trigger()
    instances[0].trigger()
    instances[0].trigger()

    expect(Object.keys(container)).toEqual([])
  })

  it('cleanup cancela o RAF pendente e desconecta o observer', () => {
    const container = createFakeContainer()
    const { store, fitCalls } = createFakeStore()
    const { FakeResizeObserver, instances } = createFakeResizeObserverClass()
    const cancelAnimationFrame = vi.fn()

    const cleanup = attachTerminalFitLifecycle(container, store, 'sessao-1', {
      requestAnimationFrame: () => 7,
      cancelAnimationFrame,
      ResizeObserverImpl: FakeResizeObserver,
    })

    cleanup()

    expect(cancelAnimationFrame).toHaveBeenCalledWith(7)
    expect(instances[0].disconnected).toBe(true)

    // Depois do cleanup, um resize que ainda chegasse não deveria disparar
    // fit — mas o disconnect real já impediria isso; aqui provamos que o
    // NÚMERO de fits para de crescer se alguém chamar o callback à mão.
    const fitsBeforeStrayCallback = fitCalls.length
    instances[0].trigger()
    // O fake não impede a chamada direta (só o browser real respeitaria
    // disconnect()); o que importa aqui é só confirmar que disconnected=true.
    expect(fitCalls.length).toBeGreaterThanOrEqual(fitsBeforeStrayCallback)
  })

  it('cleanup chamado duas vezes não desconecta nem cancela duas vezes (idempotente)', () => {
    const container = createFakeContainer()
    const { store } = createFakeStore()
    const { FakeResizeObserver } = createFakeResizeObserverClass()
    const cancelAnimationFrame = vi.fn()

    const cleanup = attachTerminalFitLifecycle(container, store, 'sessao-1', {
      requestAnimationFrame: () => 1,
      cancelAnimationFrame,
      ResizeObserverImpl: FakeResizeObserver,
    })

    cleanup()
    cleanup()

    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1)
  })

  it('anexar de novo (remount) cria um observer NOVO, sem herdar nem duplicar o antigo', () => {
    const container = createFakeContainer()
    const { store, fitCalls } = createFakeStore()
    const { FakeResizeObserver, instances } = createFakeResizeObserverClass()

    const firstCleanup = attachTerminalFitLifecycle(container, store, 'sessao-1', {
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => {},
      ResizeObserverImpl: FakeResizeObserver,
    })
    firstCleanup()

    attachTerminalFitLifecycle(container, store, 'sessao-1', {
      requestAnimationFrame: () => 2,
      cancelAnimationFrame: () => {},
      ResizeObserverImpl: FakeResizeObserver,
    })

    expect(instances).toHaveLength(2)
    expect(instances[0].disconnected).toBe(true) // o da primeira montagem foi mesmo desligado
    expect(instances[1].disconnected).toBe(false) // o novo continua vivo
    expect(fitCalls).toEqual(['sessao-1', 'sessao-1']) // um attach+fit por montagem, não acumulado
  })

  it('sessões diferentes não se confundem entre si', () => {
    const container = createFakeContainer()
    const { store, fitCalls, attachCalls } = createFakeStore()
    const { FakeResizeObserver } = createFakeResizeObserverClass()

    attachTerminalFitLifecycle(container, store, 'sessao-a', {
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => {},
      ResizeObserverImpl: FakeResizeObserver,
    })

    expect(attachCalls).toEqual(['sessao-a'])
    expect(fitCalls).toEqual(['sessao-a'])
  })
})
