import { afterEach, describe, expect, it } from 'vitest'
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
})
