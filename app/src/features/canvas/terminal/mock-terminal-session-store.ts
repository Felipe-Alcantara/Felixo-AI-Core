import type { AgentSessionReference } from '../services/agent-session'
import type { ContextFileKind } from '../services/context-file-delivery'
import type { SessionMetadata } from './session-metadata'
import type {
  SendTextResult,
  SessionListener,
  SessionOptions,
  SessionSnapshot,
  TerminalSessionStoreApi,
  TerminalTranscript,
} from './terminal-session-api'

type MockSession = {
  snapshot: SessionSnapshot
  metadata: SessionMetadata
  transcript: string
  shellHistory: string
  subscribers: Set<SessionListener>
  terminalElement?: HTMLTextAreaElement
}

/**
 * PTY fake used only by the isolated DevTools smoke (`FELIXO_DEVTOOLS_MOCK_PTY`).
 * It keeps the same public contract as the real store so drawer focus, copy,
 * keyboard and close flows run through the UI without starting a shell or a
 * vendor CLI in CI.
 */
export class MockTerminalSessionStore implements TerminalSessionStoreApi {
  private readonly sessions = new Map<string, MockSession>()
  private readonly pendingListeners = new Map<string, Set<SessionListener>>()
  private readonly allSubscribers = new Set<() => void>()
  // useSyncExternalStore requires the snapshot object to stay referentially
  // stable until the store actually changes. Rebuilding it on every read
  // would make React detect a change forever during the smoke boot.
  private snapshotsCache: Record<string, SessionSnapshot> = {}

  restart(id: string, options: SessionOptions = {}): void {
    this.sessions.delete(id)
    this.ensure(id, options)
  }

  ensure(id: string, options: SessionOptions = {}): void {
    if (this.sessions.has(id)) {
      return
    }

    const startedAt = options.startedAt ?? Date.now()
    const label = options.sourceLabel ?? options.command ?? 'Terminal mock'
    const session: MockSession = {
      snapshot: {
        activity: 'idle',
        previewLines: ['[mock] terminal pronto', 'Nenhum processo externo foi iniciado.'],
        generation: 1,
      },
      metadata: {
        elementId: id,
        ptySessionId: `mock-${id}`,
        activity: 'idle',
        startedAt,
        cwd: options.cwd,
        command: options.command,
        args: options.args ?? [],
        label,
        agentSession: options.agentSession as AgentSessionReference | undefined,
      },
      transcript: options.initialText ? String(options.initialText) : '[mock] terminal pronto\n',
      shellHistory: '',
      subscribers: new Set(),
    }
    this.sessions.set(id, session)
    const pending = this.pendingListeners.get(id)
    pending?.forEach((listener) => session.subscribers.add(listener))
    this.pendingListeners.delete(id)
    this.notify(session)
  }

  attach(id: string, container: HTMLElement): void {
    this.ensure(id)
    const session = this.sessions.get(id)
    if (!session) return

    const textarea = document.createElement('textarea')
    textarea.className = 'xterm nodrag nowheel nopan h-full w-full resize-none bg-transparent p-2 font-mono text-xs text-zinc-300 outline-none'
    textarea.setAttribute('aria-label', `Terminal ${session.metadata.label ?? 'mock'}`)
    textarea.setAttribute('data-felixo-mock-terminal', id)
    textarea.value = session.transcript
    textarea.spellcheck = false
    textarea.readOnly = false
    container.replaceChildren(textarea)
    session.terminalElement = textarea
  }

  handleFileDrop(id: string, files: Iterable<File>): void {
    // A smoke fixture does not grant file permissions to a mock process.
    void id
    void files
  }

  fit(id: string): void {
    // Textarea layout needs no xterm fit addon.
    void id
  }

  focus(id: string): void {
    this.sessions.get(id)?.terminalElement?.focus()
  }

  async sendText(
    id: string,
    text: string,
    options: { kind?: ContextFileKind } = {},
  ): Promise<SendTextResult> {
    void options
    const session = this.sessions.get(id)
    if (!session) {
      return { delivered: false, reason: 'no-session' }
    }

    const value = String(text)
    session.transcript += value
    session.shellHistory += value
    session.snapshot = {
      ...session.snapshot,
      activity: 'idle',
      lastPrompt: value.trim(),
      previewLines: [`[mock] ${value.trim()}`],
    }
    if (session.terminalElement) {
      session.terminalElement.value = session.transcript
    }
    this.notify(session)
    return { delivered: true }
  }

  async copy(id: string): Promise<string> {
    return this.sessions.get(id)?.transcript ?? ''
  }

  getTranscript(id: string): TerminalTranscript {
    return { text: this.sessions.get(id)?.transcript ?? '' }
  }

  getShellHistory(id: string): TerminalTranscript {
    return { text: this.sessions.get(id)?.shellHistory ?? '' }
  }

  getSnapshot(id: string): SessionSnapshot | undefined {
    return this.sessions.get(id)?.snapshot
  }

  getSessionMetadata(id: string): SessionMetadata | undefined {
    return this.sessions.get(id)?.metadata
  }

  getSnapshots(): Record<string, SessionSnapshot> {
    return this.snapshotsCache
  }

  private refreshSnapshotsCache(): void {
    this.snapshotsCache = Object.fromEntries(
      [...this.sessions].map(([id, session]) => [id, session.snapshot]),
    )
  }

  subscribeAll(listener: () => void): () => void {
    this.allSubscribers.add(listener)
    listener()
    return () => this.allSubscribers.delete(listener)
  }

  subscribe(id: string, listener: SessionListener): () => void {
    const session = this.sessions.get(id)
    if (!session) {
      listener({ activity: 'starting', previewLines: [] })
      const pending = this.pendingListeners.get(id) ?? new Set<SessionListener>()
      pending.add(listener)
      this.pendingListeners.set(id, pending)
      return () => {
        pending.delete(listener)
        if (pending.size === 0) this.pendingListeners.delete(id)
      }
    }
    session.subscribers.add(listener)
    listener(session.snapshot)
    return () => session.subscribers.delete(listener)
  }

  remove(id: string): void {
    this.pendingListeners.delete(id)
    if (!this.sessions.delete(id)) return
    this.refreshSnapshotsCache()
    this.allSubscribers.forEach((listener) => listener())
  }

  clear(): void {
    this.sessions.clear()
    this.pendingListeners.clear()
    this.refreshSnapshotsCache()
    this.allSubscribers.forEach((listener) => listener())
  }

  private notify(session: MockSession): void {
    this.refreshSnapshotsCache()
    session.subscribers.forEach((listener) => listener(session.snapshot))
    this.allSubscribers.forEach((listener) => listener())
  }
}
