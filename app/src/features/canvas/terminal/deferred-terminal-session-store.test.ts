import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeferredTerminalSessionStore } from './deferred-terminal-session-store'

const waitForMicrotasks = async () => {
  await new Promise<void>((resolve) => queueMicrotask(resolve))
  await new Promise<void>((resolve) => queueMicrotask(resolve))
}

describe('DeferredTerminalSessionStore', () => {
  const previousWindow = (globalThis as { window?: unknown }).window

  afterEach(() => {
    ;(globalThis as { window?: unknown }).window = previousWindow
  })

  it('não recria uma sessão enfileirada depois de limpar o canvas', async () => {
    const dataListeners = new Set<(event: { sessionId: string; data: string }) => void>()
    const exitListeners = new Set<(event: { sessionId: string; exitCode: number }) => void>()
    const sessionListeners = new Set<(event: object) => void>()
    ;(globalThis as { window?: unknown }).window = {
      felixo: {
        pty: {
          onData: (listener: (event: { sessionId: string; data: string }) => void) => {
            dataListeners.add(listener)
            return () => dataListeners.delete(listener)
          },
          onExit: (listener: (event: { sessionId: string; exitCode: number }) => void) => {
            exitListeners.add(listener)
            return () => exitListeners.delete(listener)
          },
          onSession: (listener: (event: object) => void) => {
            sessionListeners.add(listener)
            return () => sessionListeners.delete(listener)
          },
          spawn: async () => ({ ok: true }),
          write: async () => {},
          resize: async () => {},
          kill: async () => {},
        },
        contextFiles: {
          release: async () => ({ ok: true }),
        },
      },
    }

    const store = new DeferredTerminalSessionStore()
    store.ensure('terminal-queued', { command: 'sh', cwd: '/tmp' })
    store.clear()
    await waitForMicrotasks()

    expect(store.getSnapshot('terminal-queued')).toBeUndefined()
    expect(dataListeners.size).toBe(0)
    expect(exitListeners.size).toBe(0)
    expect(sessionListeners.size).toBe(0)
  })

  /** Ponte falsa que conta ouvintes, spawns e kills. */
  function instalarPonte() {
    const listeners = { data: new Set<unknown>(), exit: new Set<unknown>(), session: new Set<unknown>() }
    const spawns: Array<{ sessionId: string; reuseExisting?: boolean }> = []
    const kills: string[] = []
    const assinar = (set: Set<unknown>) => (listener: unknown) => {
      set.add(listener)
      return () => set.delete(listener)
    }
    ;(globalThis as { window?: unknown }).window = {
      felixo: {
        pty: {
          onData: assinar(listeners.data),
          onExit: assinar(listeners.exit),
          onSession: assinar(listeners.session),
          spawn: async (params: { sessionId: string; reuseExisting?: boolean }) => {
            spawns.push(params)
            return { ok: true }
          },
          write: async () => ({ ok: true, delivered: true }),
          resize: async () => {},
          kill: async ({ sessionId }: { sessionId: string }) => {
            kills.push(sessionId)
          },
        },
        contextFiles: { release: async () => ({ ok: true }) },
      },
    }
    const ativos = () => listeners.data.size + listeners.exit.size + listeners.session.size
    return { spawns, kills, ativos }
  }

  it('detachAll antes de o runtime carregar cancela o ensure enfileirado (o desmonte simulado do StrictMode)', async () => {
    const ponte = instalarPonte()
    const store = new DeferredTerminalSessionStore()
    store.ensure('terminal-strict', { command: 'sh', cwd: '/tmp' })
    store.detachAll()
    await waitForMicrotasks()

    expect(store.getSnapshot('terminal-strict')).toBeUndefined()
    expect(ponte.spawns).toEqual([])
    expect(ponte.kills).toEqual([])
    expect(ponte.ativos()).toBe(0)

    // A remontagem do StrictMode chama ensure de novo no mesmo store: essa vale.
    store.ensure('terminal-strict', { command: 'sh', cwd: '/tmp' })
    await vi.waitFor(() => expect(store.getSnapshot('terminal-strict')).toBeDefined())
    expect(ponte.spawns).toHaveLength(1)
    store.clear()
  })

  it('detachAll com o runtime carregado solta as sessões e os ouvintes da ponte, sem kill', async () => {
    const ponte = instalarPonte()
    const store = new DeferredTerminalSessionStore()
    store.ensure('terminal-vivo', { command: 'sh', cwd: '/tmp' })
    await vi.waitFor(() => expect(store.getSnapshot('terminal-vivo')).toBeDefined())
    expect(ponte.ativos()).toBe(3)

    store.detachAll()

    expect(store.getSnapshot('terminal-vivo')).toBeUndefined()
    expect(ponte.ativos()).toBe(0)
    expect(ponte.kills).toEqual([])
    expect(ponte.spawns.every((spawn) => spawn.reuseExisting === true)).toBe(true)
  })
})
