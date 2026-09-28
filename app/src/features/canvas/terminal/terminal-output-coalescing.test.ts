import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * A leitura da tela (`computeSignature`) é contada por um espião em volta da
 * implementação real: o comportamento do store continua o de verdade, só
 * ganhamos o número de vezes que ele leu as linhas visíveis.
 */
const signatureCalls = vi.hoisted(() => ({ count: 0 }))
vi.mock('./terminal-buffer-reader', async (importOriginal) => {
  const original = await importOriginal<typeof import('./terminal-buffer-reader')>()
  return {
    ...original,
    computeSignature: (...args: Parameters<typeof original.computeSignature>) => {
      signatureCalls.count += 1
      return original.computeSignature(...args)
    },
  }
})

const { TerminalSessionStore, countLineFeeds } = await import('./terminal-session-store')

type DataEvent = { sessionId: string; data: string }
type ExitEvent = { sessionId: string; exitCode: number; signal?: number }

function installBridge() {
  const dataListeners = new Set<(event: DataEvent) => void>()
  const exitListeners = new Set<(event: ExitEvent) => void>()
  ;(globalThis as { window?: unknown }).window = {
    felixo: {
      pty: {
        onData: (listener: (event: DataEvent) => void) => {
          dataListeners.add(listener)
          return () => dataListeners.delete(listener)
        },
        onExit: (listener: (event: ExitEvent) => void) => {
          exitListeners.add(listener)
          return () => exitListeners.delete(listener)
        },
        onSession: () => () => {},
        spawn: async () => ({ ok: true, reused: false }),
        write: async () => ({ ok: true, delivered: true }),
        resize: async () => {},
        kill: async () => {},
      },
      contextFiles: { release: async () => ({ ok: true }) },
    },
  }
  return {
    emitData: (sessionId: string, data: string) => {
      for (const listener of dataListeners) listener({ sessionId, data })
    },
    emitExit: (sessionId: string, exitCode: number) => {
      for (const listener of exitListeners) listener({ sessionId, exitCode })
    },
  }
}

describe('TerminalSessionStore: leitura da tela coalescida por fatia de parse', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    signatureCalls.count = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uma rajada de 200 pedaços lê a tela por fatia, não por pedaço', async () => {
    const bridge = installBridge()
    const store = new TerminalSessionStore()
    store.ensure('t1', { command: 'bash', cwd: '/tmp' })
    await vi.advanceTimersByTimeAsync(20)
    signatureCalls.count = 0

    // Mesmo cenário de um agente transmitindo: os pedaços chegam antes de o
    // xterm ter tempo de processar, e caem na mesma fila de parse.
    for (let index = 0; index < 200; index += 1) {
      bridge.emitData('canvas:t1', `linha ${index} da resposta do agente\r\n`)
    }
    await vi.advanceTimersByTimeAsync(50)

    expect(store.getTranscript('t1').text).toContain('linha 199 da resposta do agente')
    // Antes: uma leitura por pedaço (200). Agora: uma por fatia de parse.
    expect(signatureCalls.count).toBeGreaterThan(0)
    expect(signatureCalls.count).toBeLessThanOrEqual(5)
    expect(store.getSnapshot('t1')?.activity).toBe('working')

    store.clear()
  })

  it('um exit processado na mesma fatia continua exit: a leitura agendada não devolve para working', async () => {
    const bridge = installBridge()
    const store = new TerminalSessionStore()
    store.ensure('t2', { command: 'bash', cwd: '/tmp' })
    await vi.advanceTimersByTimeAsync(20)

    // Saída ainda na fila do xterm quando o processo sai: o store adia o exit
    // até o último pedaço ser escrito (pendingExit), e isso acontece na mesma
    // fatia em que os pedaços anteriores agendaram a leitura da tela.
    for (let index = 0; index < 5; index += 1) {
      bridge.emitData('canvas:t2', `saída final ${index}\r\n`)
    }
    bridge.emitExit('canvas:t2', 0)
    await vi.advanceTimersByTimeAsync(50)

    expect(store.getTranscript('t2').text).toContain('saída final 4')
    expect(store.getSnapshot('t2')?.activity).toBe('exited')
    expect(store.getSnapshot('t2')?.exitCode).toBe(0)

    store.clear()
  })

  it('saída que chega em fatias separadas continua sendo lida em cada uma', async () => {
    const bridge = installBridge()
    const store = new TerminalSessionStore()
    store.ensure('t3', { command: 'bash', cwd: '/tmp' })
    await vi.advanceTimersByTimeAsync(20)
    signatureCalls.count = 0

    bridge.emitData('canvas:t3', 'primeira fatia\r\n')
    await vi.advanceTimersByTimeAsync(20)
    const afterFirst = signatureCalls.count
    bridge.emitData('canvas:t3', 'segunda fatia\r\n')
    await vi.advanceTimersByTimeAsync(20)

    expect(afterFirst).toBe(1)
    expect(signatureCalls.count).toBe(2)

    store.clear()
  })
})

describe('countLineFeeds', () => {
  const antigo = (data: string) => (String(data).match(/\n/g) ?? []).length

  it('conta igual ao match(/\\n/g) anterior, sem alocar o array', () => {
    for (const sample of ['', 'sem quebra', '\n', '\n\n\n', 'a\r\nb\r\nc', '😀\n⠋\n', 'x'.repeat(5000) + '\n']) {
      expect(countLineFeeds(sample)).toBe(antigo(sample))
    }
  })
})
