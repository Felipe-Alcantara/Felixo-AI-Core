import type {
  ClaudeAutoContinueCancelResult,
  SendTextResult,
  SendTextInput,
  SessionListener,
  SessionOptions,
  SessionSnapshot,
  TerminalReadingSource,
  TerminalSessionStoreApi,
  TerminalTranscript,
} from './terminal-session-api'
import type { SessionMetadata } from './session-metadata'
import {
  HIDDEN_CLAUDE_SCROLL_RAIL,
  type ClaudeScrollAction,
  type ClaudeScrollRailState,
} from './terminal-claude-scroll'

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
   * Invalidates `ensure()` calls queued before a bulk canvas reset or a
   * `detachAll()`. Without this boundary, clearing while the lazy runtime was
   * importing could let a late card mount recreate a session after the canvas
   * was already empty — and, no desmonte simulado do StrictMode, o `ensure` da
   * primeira montagem subiria depois do desligamento.
   */
  private clearGeneration = 0
  private pendingAllListeners = new Set<PendingListener>()
  private pendingSessionListeners = new Map<string, Set<PendingSessionListener>>()
  private pendingOutputListeners = new Map<string, Set<PendingListener>>()

  /**
   * A falha de importar o runtime vira estado no bloco (`error` + mensagem), em vez de ficar só no console com o
   * bloco em "iniciando" para sempre. O objeto é um só (o `useSyncExternalStore` compara por referência). A
   * tentativa seguinte (Reiniciar, ou outro `ensure`) importa de novo e, se der certo, apaga a falha.
   */
  private loadFailure: SessionSnapshot | null = null

  private load(): Promise<TerminalSessionStoreApi> {
    if (this.realStore) return Promise.resolve(this.realStore)
    if (this.loading) return this.loading

    this.loading = import('./terminal-session-store')
      .then(({ TerminalSessionStore }) => {
        const store = new TerminalSessionStore()
        this.realStore = store
        this.loadFailure = null

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

        for (const [sessionId, listeners] of this.pendingOutputListeners) {
          for (const pending of listeners) {
            if (!pending.active) continue
            pending.unsubscribe = store.subscribeOutput(sessionId, pending.listener)
            pending.listener()
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
      this.reportLoadFailure()
    })
  }

  private reportLoadFailure(): void {
    if (this.realStore || this.loadFailure) return
    const failure: SessionSnapshot = {
      activity: 'error',
      previewLines: [],
      message: 'Não foi possível carregar o terminal. Use Reiniciar para tentar de novo.',
    }
    this.loadFailure = failure
    for (const pending of this.pendingAllListeners) if (pending.active) pending.listener()
    for (const listeners of this.pendingSessionListeners.values()) {
      for (const pending of listeners) if (pending.active) pending.listener(failure)
    }
    for (const listeners of this.pendingOutputListeners.values()) {
      for (const pending of listeners) if (pending.active) pending.listener()
    }
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

  moveTo(id: string, container: HTMLElement): boolean {
    if (this.realStore) return this.realStore.moveTo(id, container)
    // Runtime ainda não carregou: não há xterm vivo para mover; aplica quando chegar.
    this.runDeferred((store) => {
      store.moveTo(id, container)
    })
    return false
  }

  hostOf(id: string): HTMLElement | null {
    return this.realStore?.hostOf(id) ?? null
  }

  release(id: string): void {
    // Sem runtime não há xterm vivo em janela nenhuma: nada a adiar.
    this.realStore?.release(id)
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
    options: SendTextInput = {},
  ): Promise<SendTextResult> {
    return this.load().then((store) => store.sendText(id, text, options))
  }

  typeText(id: string, text: string): Promise<SendTextResult> {
    return this.load().then((store) => store.typeText(id, text))
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

  getReadingSource(id: string): TerminalReadingSource | undefined {
    return this.realStore?.getReadingSource(id)
  }

  subscribeOutput(id: string, listener: () => void): () => void {
    if (this.realStore) return this.realStore.subscribeOutput(id, listener)

    const pending: PendingListener = { active: true, listener }
    const listeners = this.pendingOutputListeners.get(id) ?? new Set()
    listeners.add(pending)
    this.pendingOutputListeners.set(id, listeners)
    return () => {
      pending.active = false
      pending.unsubscribe?.()
      listeners.delete(pending)
      if (listeners.size === 0) this.pendingOutputListeners.delete(id)
    }
  }

  getSnapshot(id: string): SessionSnapshot | undefined {
    return this.realStore ? this.realStore.getSnapshot(id) : (this.loadFailure ?? undefined)
  }

  getSessionMetadata(id: string): SessionMetadata | undefined {
    return this.realStore?.getSessionMetadata(id)
  }

  getClaudeScrollRail(id: string): ClaudeScrollRailState {
    return this.realStore?.getClaudeScrollRail(id) ?? HIDDEN_CLAUDE_SCROLL_RAIL
  }

  scrollClaude(id: string, action: ClaudeScrollAction): void {
    this.runDeferred((store) => store.scrollClaude(id, action))
  }

  cancelClaudeAutoContinue(id: string): Promise<ClaudeAutoContinueCancelResult> {
    return this.load().then((store) => store.cancelClaudeAutoContinue(id))
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

  detachAll(): void {
    const generation = ++this.clearGeneration
    if (this.realStore) {
      this.realStore.detachAll()
      return
    }
    // Sem runtime carregado não há xterm a soltar; com o import em voo, solta
    // depois das ações já enfileiradas, como o `clear`.
    if (this.loading) {
      this.runDeferred((store) => {
        if (generation === this.clearGeneration) {
          store.detachAll()
        }
      })
    }
  }
}
