import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

/**
 * Activity derived from the output stream — no text parsing, just flow:
 * - `working`: received output very recently (the agent is generating).
 * - `idle`: alive but quiet for a while (waiting for you / finished a turn).
 * - `exited`: the underlying process ended.
 * - `error`: failed to start.
 */
export type SessionActivity = 'starting' | 'working' | 'idle' | 'exited' | 'error'

export type SessionSnapshot = {
  activity: SessionActivity
  /** Last lines of output, for the collapsed card preview. */
  previewLines: string[]
  exitCode?: number
  message?: string
}

type SessionListener = (snapshot: SessionSnapshot) => void

/** Ms of output silence after which a running session is considered idle. */
const IDLE_AFTER_MS = 1500
/** How many trailing lines to keep for the card preview. */
const PREVIEW_LINES = 6

type SessionOptions = {
  command?: string
  args?: string[]
  cwd?: string
}

type Session = {
  id: string
  ptySessionId: string
  terminal: Terminal
  fitAddon: FitAddon
  listeners: Set<SessionListener>
  snapshot: SessionSnapshot
  idleTimer: ReturnType<typeof setTimeout> | null
  offData: () => void
  offExit: () => void
  disposed: boolean
}

/**
 * Owns terminal sessions independently of any React component, so a terminal
 * keeps running while its card is collapsed. The xterm DOM element is moved
 * (attach/detach) between the collapsed preview and the expanded drawer rather
 * than re-created, so scrollback and the live process survive.
 */
export class TerminalSessionStore {
  private sessions = new Map<string, Session>()

  /** Returns the existing session for an id, creating it on first use. */
  ensure(id: string, options: SessionOptions = {}): void {
    if (this.sessions.has(id)) {
      return
    }

    const pty = window.felixo?.pty
    const terminal = new Terminal({
      convertEol: false,
      cursorBlink: true,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      theme: { background: '#0b0f14' },
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    const session: Session = {
      id,
      ptySessionId: `${id}::${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`,
      terminal,
      fitAddon,
      listeners: new Set(),
      snapshot: { activity: 'starting', previewLines: [] },
      idleTimer: null,
      offData: () => {},
      offExit: () => {},
      disposed: false,
    }
    this.sessions.set(id, session)

    if (!pty) {
      this.update(session, { activity: 'error', message: 'Bridge PTY indisponível.' })
      return
    }

    session.offData = pty.onData((event) => {
      if (event.sessionId === session.ptySessionId) {
        terminal.write(event.data)
        this.onOutput(session)
      }
    })

    session.offExit = pty.onExit((event) => {
      if (event.sessionId !== session.ptySessionId) {
        return
      }
      this.clearIdleTimer(session)
      this.update(session, { activity: 'exited', exitCode: event.exitCode })
    })

    // Keyboard → PTY.
    terminal.onData((data) => {
      void pty.write({ sessionId: session.ptySessionId, data })
    })

    void pty
      .spawn({
        sessionId: session.ptySessionId,
        command: options.command,
        args: options.args,
        cwd: options.cwd,
        cols: terminal.cols || 80,
        rows: terminal.rows || 24,
      })
      .then((result) => {
        if (session.disposed) {
          return
        }
        if (result?.ok) {
          this.markWorking(session)
        } else {
          this.update(session, {
            activity: 'error',
            message: result?.message ?? 'Falha ao iniciar o terminal.',
          })
        }
      })
  }

  /** Mounts the session's terminal element into a container. */
  attach(id: string, container: HTMLElement): void {
    const session = this.sessions.get(id)
    if (!session) {
      return
    }

    // The drawer reuses one container across sessions; clear any previously
    // mounted terminal element so switching cards doesn't stack terminals.
    for (const child of Array.from(container.children)) {
      if (child !== session.terminal.element) {
        container.removeChild(child)
      }
    }

    if (!session.terminal.element) {
      session.terminal.open(container)
    } else if (session.terminal.element.parentElement !== container) {
      container.appendChild(session.terminal.element)
    }

    this.fit(session)
  }

  /** Re-fits the terminal to its current container and pushes a PTY resize. */
  fit(id: string): void
  fit(session: Session): void
  fit(target: string | Session): void {
    const session = typeof target === 'string' ? this.sessions.get(target) : target
    if (!session || !session.terminal.element) {
      return
    }

    try {
      session.fitAddon.fit()
      void window.felixo?.pty?.resize({
        sessionId: session.ptySessionId,
        cols: session.terminal.cols,
        rows: session.terminal.rows,
      })
    } catch {
      // Container may be momentarily zero-sized; ignore.
    }
  }

  focus(id: string): void {
    this.sessions.get(id)?.terminal.focus()
  }

  /** Types text into the session's PTY as if the user had typed it. */
  sendText(id: string, text: string): void {
    const session = this.sessions.get(id)
    if (!session) {
      return
    }
    void window.felixo?.pty?.write({ sessionId: session.ptySessionId, data: text })
  }

  /**
   * Copies the current mouse selection to the clipboard. Falls back to the
   * visible viewport text when nothing is selected, so the button is never a
   * no-op. Returns the copied text (empty string if there was nothing).
   */
  async copy(id: string): Promise<string> {
    const session = this.sessions.get(id)
    if (!session) {
      return ''
    }

    const selection = session.terminal.getSelection()
    const text = selection || readViewport(session.terminal)
    if (text) {
      await navigator.clipboard?.writeText(text)
    }
    return text
  }

  getSnapshot(id: string): SessionSnapshot | undefined {
    return this.sessions.get(id)?.snapshot
  }

  subscribe(id: string, listener: SessionListener): () => void {
    const session = this.sessions.get(id)
    if (!session) {
      return () => {}
    }

    session.listeners.add(listener)
    listener(session.snapshot)
    return () => session.listeners.delete(listener)
  }

  /** Permanently ends a session and frees its resources. */
  remove(id: string): void {
    const session = this.sessions.get(id)
    if (!session) {
      return
    }

    session.disposed = true
    this.clearIdleTimer(session)
    session.offData()
    session.offExit()
    void window.felixo?.pty?.kill({ sessionId: session.ptySessionId, force: true })
    session.terminal.dispose()
    this.sessions.delete(id)
  }

  private onOutput(session: Session): void {
    this.markWorking(session)
  }

  private markWorking(session: Session): void {
    this.clearIdleTimer(session)

    // Only emit on the transition into 'working' to avoid a re-render per byte;
    // the preview is refreshed once the session goes idle.
    if (session.snapshot.activity !== 'working') {
      this.update(session, { activity: 'working' })
    }

    session.idleTimer = setTimeout(() => {
      if (!session.disposed && session.snapshot.activity === 'working') {
        // Refresh the preview from the now-settled buffer.
        this.update(session, { activity: 'idle' })
      }
    }, IDLE_AFTER_MS)
  }

  private clearIdleTimer(session: Session): void {
    if (session.idleTimer) {
      clearTimeout(session.idleTimer)
      session.idleTimer = null
    }
  }

  private update(session: Session, patch: Partial<SessionSnapshot>): void {
    session.snapshot = {
      ...session.snapshot,
      ...patch,
      previewLines: computePreview(session.terminal),
    }
    for (const listener of session.listeners) {
      listener(session.snapshot)
    }
  }
}

/**
 * Reads the last non-empty lines straight from xterm's rendered buffer. This
 * is already the clean, parsed text the terminal shows — far more reliable
 * than stripping ANSI from the raw byte stream ourselves.
 */
function computePreview(terminal: Terminal): string[] {
  const buffer = terminal.buffer.active
  const lines: string[] = []

  // Walk upward from the last row, collecting non-empty lines.
  for (let row = buffer.length - 1; row >= 0 && lines.length < PREVIEW_LINES; row -= 1) {
    const text = buffer.getLine(row)?.translateToString(true).trimEnd() ?? ''
    if (text.length > 0) {
      lines.unshift(text)
    }
  }

  return lines
}

/** Reads the currently visible viewport text from the xterm buffer. */
function readViewport(terminal: Terminal): string {
  const buffer = terminal.buffer.active
  const start = buffer.viewportY
  const end = start + terminal.rows
  const lines: string[] = []

  for (let row = start; row < end; row += 1) {
    lines.push(buffer.getLine(row)?.translateToString(true).trimEnd() ?? '')
  }

  return lines.join('\n').replace(/\n+$/, '')
}
