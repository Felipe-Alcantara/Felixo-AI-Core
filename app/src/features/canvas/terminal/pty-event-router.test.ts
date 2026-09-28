import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPtyEventRouter } from './pty-event-router'
import { TerminalSessionStore } from './terminal-session-store'

type DataEvent = { sessionId: string; data: string }

function createChannel() {
  const listeners = new Set<(event: DataEvent) => void>()
  return {
    listeners,
    subscribe: (listener: (event: DataEvent) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit: (event: DataEvent) => {
      for (const listener of listeners) listener(event)
    },
  }
}

describe('createPtyEventRouter', () => {
  it('assina o canal uma única vez, não importa quantas sessões', () => {
    const channel = createChannel()
    const router = createPtyEventRouter<DataEvent>(channel.subscribe)

    for (let index = 0; index < 20; index += 1) {
      router.route(`canvas:t${index}`, () => {})
    }

    expect(channel.listeners.size).toBe(1)
    expect(router.size).toBe(20)
  })

  it('entrega cada evento só para a sessão dele', () => {
    const channel = createChannel()
    const router = createPtyEventRouter<DataEvent>(channel.subscribe)
    const received: Record<string, string[]> = { a: [], b: [] }
    router.route('a', (event) => received.a.push(event.data))
    router.route('b', (event) => received.b.push(event.data))

    channel.emit({ sessionId: 'a', data: 'um' })
    channel.emit({ sessionId: 'b', data: 'dois' })
    channel.emit({ sessionId: 'a', data: 'tres' })
    channel.emit({ sessionId: 'desconhecida', data: 'ignorado' })

    expect(received).toEqual({ a: ['um', 'tres'], b: ['dois'] })
  })

  it('desfazer uma rota não corta as outras, e a última solta o canal', () => {
    const channel = createChannel()
    const router = createPtyEventRouter<DataEvent>(channel.subscribe)
    const received: string[] = []
    const offA = router.route('a', () => received.push('a'))
    const offB = router.route('b', () => received.push('b'))

    offA()
    channel.emit({ sessionId: 'a', data: '' })
    channel.emit({ sessionId: 'b', data: '' })
    expect(received).toEqual(['b'])
    expect(channel.listeners.size).toBe(1)

    offB()
    expect(channel.listeners.size).toBe(0)

    // Uma sessão nova depois de tudo fechado assina de novo.
    router.route('c', () => received.push('c'))
    channel.emit({ sessionId: 'c', data: '' })
    expect(channel.listeners.size).toBe(1)
    expect(received).toEqual(['b', 'c'])
  })

  it('o desfazer antigo de um id reaproveitado não remove a rota nova', () => {
    const channel = createChannel()
    const router = createPtyEventRouter<DataEvent>(channel.subscribe)
    const received: string[] = []
    const offOld = router.route('a', () => received.push('antiga'))
    router.route('a', () => received.push('nova'))

    offOld()
    offOld()
    channel.emit({ sessionId: 'a', data: '' })

    expect(received).toEqual(['nova'])
    expect(channel.listeners.size).toBe(1)
  })
})

describe('TerminalSessionStore: um ouvinte pty:data para todas as sessões', () => {
  const channel = createChannel()

  beforeEach(() => {
    vi.useFakeTimers()
    channel.listeners.clear()
    ;(globalThis as { window?: unknown }).window = {
      felixo: {
        pty: {
          onData: channel.subscribe,
          onExit: () => () => {},
          onSession: () => () => {},
          spawn: async () => ({ ok: true, reused: false }),
          write: async () => ({ ok: true, delivered: true }),
          resize: async () => {},
          kill: async () => {},
        },
      },
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('20 terminais abertos registram 1 ouvinte, e a saída de um só mexe nele', async () => {
    const store = new TerminalSessionStore()
    const ids = Array.from({ length: 20 }, (_, index) => `t${index}`)
    for (const id of ids) {
      store.ensure(id, { command: 'bash', cwd: '/tmp', terminalCount: 20 })
    }

    expect(channel.listeners.size).toBe(1)

    channel.emit({ sessionId: 'canvas:t7', data: 'saida real do terminal 7\r\n' })
    await vi.advanceTimersByTimeAsync(50)

    // O observável é o próprio buffer do xterm de cada sessão: só o t7 recebeu.
    expect(store.getTranscript('t7').text).toContain('saida real do terminal 7')
    for (const id of ids.filter((value) => value !== 't7')) {
      expect(store.getTranscript(id).text).not.toContain('saida real')
    }

    store.remove('t7')
    expect(channel.listeners.size).toBe(1)

    store.clear()
    expect(channel.listeners.size).toBe(0)
  })
})
