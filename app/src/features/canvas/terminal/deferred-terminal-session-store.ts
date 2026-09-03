import type {
  SessionListener,
  SessionOptions,
  SessionSnapshot,
  TerminalSessionStoreApi,
  TerminalTranscript,
} from './terminal-session-api'
import type { ContextFileKind } from '../services/context-file-delivery'
import type { SessionMetadata } from './session-metadata'

const EMPTY_TRANSCRIPT: TerminalTranscript = { text: '' }
const EMPTY_SNAPSHOTS: Record<string, SessionSnapshot> = {}

type PendingListener = {
  active: boolean
  listener: () => void
  unsubscribe?: () => void
}

type PendingSessionListener = {
  active: boolean
  listener: SessionListener
  unsubscribe?: () => void
}

/**
 * Keeps the canvas useful before xterm is needed.
 *
 * A blank canvas does not need to construct a terminal or download its
 * renderer. The first persisted/created terminal calls `ensure`, which starts
 * the local PTY runtime import; calls made while it is loading stay ordered on
 * the same promise. The public surface remains synchronous for React cards and
 * only the implementation behind it is deferred.
 */
export class DeferredTerminalSessionStore implements TerminalSessionStoreApi {
  private realStore: TerminalSessionStoreApi | null = null
  private loading: Promise<TerminalSessionStoreApi> | null = null
  /**
   * Invalidates `ensure()` calls queued before a bulk canvas reset. Without
   * this boundary, clearing while the lazy runtime was importing could let a
   * late card mount recreate a session after the canvas was already empty.
   */
  private clearGeneration = 0
  private pendingAllListeners = new Set<PendingListener>()
  private pendingSessionListeners = new Map<string, Set<PendingSessionListener>>()

  private load(): Promise<TerminalSessionStoreApi> {
    if (this.realStore) return Promise.resolve(this.realStore)
    if (this.loading) return this.loading

    this.loading = import('./terminal-session-store')
      .then(({ TerminalSessionStore }) => {
        const store = new TerminalSessionStore()
        this.realStore = store

        for (const pending of this.pendingAllListeners) {
          if (!pending.active) continue
          pending.unsubscribe = store.subscribeAll(pending.listener)
          pending.listener()
        }

        for (const [sessionId, listeners] of this.pendingSessionListeners) {
          for (const pending of listeners) {
            if (!pending.active) continue
            pending.unsubscribe = store.subscribe(sessionId, pending.listener)
          }
        }

        return store
      })
      .finally(() => {
        this.loading = null
      })

    return this.loading
  }

  private runDeferred(action: (store: TerminalSessionStoreApi) => void): void {
    void this.load().then(action).catch((error: unknown) => {
      console.error(
        '[felixo] não foi possível carregar o runtime do terminal:',
        error,
      )
    })
  }

  restart(id: string, options: SessionOptions = {}): void {
    this.runDeferred((store) => store.restart(id, options))
  }

  ensure(id: string, options: SessionOptions = {}): void {
    const generation = this.clearGeneration
    this.runDeferred((store) => {
      if (generation !== this.clearGeneration) return
      store.ensure(id, options)
    })
  }

  attach(id: string, container: HTMLElement): void {
    this.runDeferred((store) => store.attach(id, container))
  }

  handleFileDrop(id: string, files: Iterable<File>): void {
    this.runDeferred((store) => store.handleFileDrop(id, files))
  }

  fit(id: string): void {
    this.runDeferred((store) => store.fit(id))
  }

  focus(id: string): void {
    this.runDeferred((store) => store.focus(id))
  }

  sendText(
    id: string,
    text: string,
    options: { kind?: ContextFileKind } = {},
  ): Promise<void> {
    return this.load().then((store) => store.sendText(id, text, options))
  }

  copy(id: string): Promise<string> {
    return this.load().then((store) => store.copy(id))
  }

  getTranscript(id: string): TerminalTranscript {
    return this.realStore?.getTranscript(id) ?? EMPTY_TRANSCRIPT
  }

  getShellHistory(id: string): TerminalTranscript {
    return this.realStore?.getShellHistory(id) ?? EMPTY_TRANSCRIPT
  }

  getSnapshot(id: string): SessionSnapshot | undefined {
    return this.realStore?.getSnapshot(id)
  }

  getSessionMetadata(id: string): SessionMetadata | undefined {
    return this.realStore?.getSessionMetadata(id)
  }

  getSnapshots(): Record<string, SessionSnapshot> {
    return this.realStore?.getSnapshots() ?? EMPTY_SNAPSHOTS
  }

  subscribeAll(listener: () => void): () => void {
    if (this.realStore) return this.realStore.subscribeAll(listener)

    const pending: PendingListener = { active: true, listener }
    this.pendingAllListeners.add(pending)
    return () => {
      pending.active = false
      pending.unsubscribe?.()
      this.pendingAllListeners.delete(pending)
    }
  }

  subscribe(id: string, listener: SessionListener): () => void {
    if (this.realStore) return this.realStore.subscribe(id, listener)

    const pending: PendingSessionListener = { active: true, listener }
    const listeners = this.pendingSessionListeners.get(id) ?? new Set()
    listeners.add(pending)
    this.pendingSessionListeners.set(id, listeners)
    return () => {
      pending.active = false
      pending.unsubscribe?.()
      listeners.delete(pending)
      if (listeners.size === 0) this.pendingSessionListeners.delete(id)
    }
  }

  remove(id: string): void {
    if (this.realStore) {
      this.realStore.remove(id)
      return
    }
    this.runDeferred((store) => store.remove(id))
  }

  clear(): void {
    const generation = ++this.clearGeneration
    if (this.realStore) {
      this.realStore.clear()
      return
    }

    // Do not start the lazy runtime just to clear an empty canvas. If an
    // import is already in flight, however, queue the clear after its pending
    // actions so sessions created before the reset are released as well.
    if (this.loading) {
      this.runDeferred((store) => {
        if (generation === this.clearGeneration) {
          store.clear()
        }
      })
    }
  }
}
