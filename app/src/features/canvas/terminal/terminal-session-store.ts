import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { splitTerminalSubmission } from './terminal-input'
import { isSubmissionPending } from './terminal-submission'
import {
  computePreview,
  computeSignature,
  readBuffer,
  readViewport,
} from './terminal-buffer-reader'
import {
  cleanPrompt,
  hasCodexInteractivePrompt,
  isBusyScreen,
  isCodexTrustPrompt,
  looksLikeApprovalPrompt,
} from './terminal-screen-state'

/**
 * Activity derived from the output stream:
 * - `working`: received output very recently (the agent is generating).
 * - `idle`: alive but quiet for a while (waiting for you / finished a turn).
 * - `waiting_approval`: quiet, and the settled buffer looks like an
 *   interactive decision prompt (approval, question, plan confirmation).
 * - `exited`: the underlying process ended.
 * - `error`: failed to start.
 */
export type SessionActivity =
  | 'starting'
  | 'working'
  | 'idle'
  | 'waiting_approval'
  | 'exited'
  | 'error'

export type SessionSnapshot = {
  activity: SessionActivity
  /** Last lines of output, for the collapsed card preview. */
  previewLines: string[]
  exitCode?: number
  message?: string
  /** The most recent prompt submitted to the session (typed or programmatic). */
  lastPrompt?: string
}

export type TerminalTranscript = {
  /** Text currently available in xterm's active scrollback buffer. */
  text: string
}

type SessionListener = (snapshot: SessionSnapshot) => void

/** Ms of output silence after which a running session is considered idle. */
const IDLE_AFTER_MS = 1500
/** A configured agent should not terminate silently immediately after launch. */
const SILENT_EARLY_EXIT_MS = 5000
const DEFAULT_INITIAL_TEXT_DELAY_MS = 1200
/** Minimum quiet period after the CLI starts emitting output before input. */
const INITIAL_TEXT_READY_QUIET_MS = 500
/** Safety fallback for CLIs that do not emit a startup banner. */
const INITIAL_TEXT_MAX_WAIT_MS = 10000
const CLAUDE_TRUST_ACCEPT_DELAY_MS = 800
const CLAUDE_INITIAL_TEXT_DELAY_MS = 1800
const CODEX_INITIAL_TEXT_DELAY_MS = 1800
/** Lets the Codex TUI process pasted text before it receives the Enter key. */
const INITIAL_TEXT_SUBMIT_DELAY_MS = 75
/**
 * O Enter pode se perder quando o TUI ainda está redesenhando — sob carga (o
 * app reiniciando com vários agentes), o texto fica escrito na linha de entrada
 * esperando submissão. Estas constantes governam a reconferência: se o texto
 * ainda estiver na linha de entrada, o Enter é reenviado.
 */
const SUBMIT_RETRY_DELAY_MS = 600
const SUBMIT_RETRY_LIMIT = 3
const CODEX_TRUST_ACCEPT_DELAY_MS = 150
const CODEX_POST_TRUST_INITIAL_TEXT_DELAY_MS = 2500
const CODEX_TRUST_BUFFER_LIMIT = 12000

type SessionOptions = {
  command?: string
  args?: string[]
  cwd?: string
  /** Text submitted to the PTY shortly after spawn (e.g. a standing instruction). */
  initialText?: string
  /** Interpreter to try when `command` isn't installed (Windows `py`/`python`). */
  fallbackCommand?: string
  /** Keeps the terminal interactive after the command exits (run-a-file). */
  keepShellOpen?: boolean
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
  startedAt: number
  receivedOutput: boolean
  pendingWrites: number
  pendingExit?: { exitCode: number; signal?: number }
  command?: string
  /** Printable keystrokes typed since the last submit, to capture the prompt. */
  inputBuffer: string
  /** Buffer signature at the last idle check, to ignore in-place UI redraws. */
  lastSignature: string
  /** When output last changed the buffer in a meaningful way. */
  lastMeaningfulAt: number
  args: string[]
  initialText?: string
  initialTextTimer: ReturnType<typeof setTimeout> | null
  /** Reconferência de que o prompt inicial foi submetido, não só digitado. */
  submitRetryTimer: ReturnType<typeof setTimeout> | null
  initialTextSent: boolean
  codexTrustBuffer: string
  codexTrustHandled: boolean
}

/**
 * Owns terminal sessions independently of any React component, so a terminal
 * keeps running while its card is collapsed. The xterm DOM element is moved
 * (attach/detach) between the collapsed preview and the expanded drawer rather
 * than re-created, so scrollback and the live process survive.
 */
export class TerminalSessionStore {
  private sessions = new Map<string, Session>()
  private listeners = new Map<string, Set<SessionListener>>()
  private allListeners = new Set<() => void>()
  /** Immutable cache used by React's external-store subscription. */
  private snapshots: Record<string, SessionSnapshot> = {}

  /**
   * Ends an exited/errored session and immediately re-creates it with the
   * same launch options — e.g. after a Codex login attempt closes the CLI,
   * so the user can retry without deleting and re-adding the terminal node.
   */
  restart(id: string, options: SessionOptions = {}): void {
    const listeners = this.listeners.get(id)
    this.remove(id)
    if (listeners) {
      this.listeners.set(id, listeners)
    }
    this.ensure(id, options)
  }

  /** Returns the existing session for an id, creating it on first use. */
  ensure(id: string, options: SessionOptions = {}): void {
    if (this.sessions.has(id)) {
      return
    }

    const pty = window.felixo?.pty
    const terminal = new Terminal({
      convertEol: false,
      cursorBlink: true,
      // HMR/navigation can recreate the renderer while the Electron PTY keeps
      // running. A generous scrollback lets the replacement renderer restore
      // enough context for both review and responsibility handoff.
      scrollback: 20_000,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      theme: { background: '#0b0f14' },
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    const session: Session = {
      id,
      // The id must survive renderer HMR, navigation to Chat and a drawer
      // remount. The Electron process uses it to reattach instead of spawning
      // a second CLI in the same project.
      ptySessionId: `canvas:${id}`,
      terminal,
      fitAddon,
      listeners: this.listeners.get(id) ?? new Set(),
      snapshot: { activity: 'starting', previewLines: [] },
      idleTimer: null,
      offData: () => {},
      offExit: () => {},
      disposed: false,
      startedAt: Date.now(),
      receivedOutput: false,
      pendingWrites: 0,
      command: options.command,
      inputBuffer: '',
      lastSignature: '',
      lastMeaningfulAt: Date.now(),
      args: options.args ?? [],
      initialText: options.initialText,
      initialTextTimer: null,
      submitRetryTimer: null,
      initialTextSent: false,
      codexTrustBuffer: '',
      codexTrustHandled: false,
    }
    this.listeners.set(id, session.listeners)
    this.sessions.set(id, session)
    this.snapshots = { ...this.snapshots, [id]: session.snapshot }
    this.notifyAll()

    if (!pty) {
      this.update(session, { activity: 'error', message: 'Bridge PTY indisponível.' })
      return
    }

    session.offData = pty.onData((event) => {
      if (event.sessionId === session.ptySessionId) {
        session.receivedOutput ||= event.data.length > 0
        session.pendingWrites += 1
        this.handleCodexTrustPrompt(session, event.data)
        terminal.write(event.data, () => {
          session.pendingWrites -= 1
          if (session.disposed) {
            return
          }

          if (session.pendingWrites === 0 && session.pendingExit) {
            const pendingExit = session.pendingExit
            session.pendingExit = undefined
            this.finishExit(session, pendingExit)
            return
          }

          this.onOutput(session)
        })
      }
    })

    session.offExit = pty.onExit((event) => {
      if (event.sessionId !== session.ptySessionId) {
        return
      }
      this.clearIdleTimer(session)
      if (session.pendingWrites > 0) {
        session.pendingExit = event
        return
      }
      this.finishExit(session, event)
    })

    // Shift+Enter inserts a newline instead of submitting. xterm sends plain
    // CR ('\r') for both Enter and Shift+Enter, so the agent CLI can't tell
    // them apart. We intercept Shift+Enter here and send a bare LF ('\n'),
    // which Claude Code treats as "new line, don't send" (CR is "send").
    // Returning false stops xterm's default handling so it doesn't also emit a
    // CR via onData, which would submit.
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown' && event.key === 'Enter' && event.shiftKey) {
        void pty.write({ sessionId: session.ptySessionId, data: '\n' })
        return false
      }
      return true
    })

    // Keyboard → PTY. We also track what's typed so we can surface the last
    // submitted prompt. The PTY is raw, so we reconstruct the current line:
    // accumulate printable chars, handle backspace, and on CR (Enter = submit)
    // commit the buffer as the last prompt. Shift+Enter sends LF via the custom
    // handler above and never reaches here, so it correctly keeps building.
    terminal.onData((data) => {
      void pty.write({ sessionId: session.ptySessionId, data })
      this.trackTypedInput(session, data)
    })

    void pty
      .spawn({
        sessionId: session.ptySessionId,
        command: options.command,
        args: options.args,
        cwd: options.cwd,
        cols: terminal.cols || 80,
        rows: terminal.rows || 24,
        reuseExisting: true,
        fallbackCommand: options.fallbackCommand,
        keepShellOpen: options.keepShellOpen,
      })
      .then((result) => {
        if (session.disposed) {
          return
        }
        if (result?.ok && session.snapshot.activity === 'starting') {
          if (result.reused) {
            // The PTY already contains the original agent turn. Replaying the
            // initial instruction here would submit a duplicate task after a
            // renderer reload, which was the development reset bug.
            session.initialTextSent = true
            this.clearInitialTextTimer(session)
            this.markWorking(session)
            return
          }

          this.markWorking(session)

          // Claude's `--dangerously-skip-permissions` shows a "Yes, I accept"
          // trust screen on every fresh process start, so a yolo terminal looks
          // like it "reverted to normal" after an app restart. Auto-accept it:
          // the screen defaults to "No", so we send Down Arrow + Enter to pick
          // "Yes, I accept" before typing anything else. Only for Claude yolo.
          const needsTrustAccept =
            options.command === 'claude' &&
            (options.args ?? []).includes('--dangerously-skip-permissions')
          if (needsTrustAccept) {
            setTimeout(() => {
              if (!session.disposed) {
                void window.felixo?.pty?.write({
                  sessionId: session.ptySessionId,
                  data: '\x1b[B\r',
                })
              }
            }, CLAUDE_TRUST_ACCEPT_DELAY_MS)
          }

          // Give the agent a moment to start its REPL before typing the
          // standing instruction, so it lands in the prompt and not mid-boot.
          // When we auto-accept the trust screen, wait a bit longer so the
          // instruction lands on the real prompt and not mid-acceptance.
          this.scheduleInitialText(
            session,
            needsTrustAccept
              ? CLAUDE_INITIAL_TEXT_DELAY_MS
              : getInitialTextDelay(session),
          )
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
    const prompt = cleanPrompt(text)
    if (prompt) {
      this.update(session, { lastPrompt: prompt })
    }
  }

  /**
   * Reconstruct the line being typed so we can capture it on submit. xterm emits
   * one `onData` per keystroke (or a chunk for paste): printable text appends,
   * backspace (\x7f / \b) deletes, and CR (\r) submits — at which point we store
   * the line as the last prompt and reset. Control sequences (arrows, etc.) are
   * best-effort ignored; this is a convenience label, not a perfect transcript.
   */
  private trackTypedInput(session: Session, data: string): void {
    for (const char of data) {
      if (char === '\r') {
        const prompt = cleanPrompt(session.inputBuffer)
        session.inputBuffer = ''
        if (prompt) {
          this.update(session, { lastPrompt: prompt })
        }
      } else if (char === '\x7f' || char === '\b') {
        session.inputBuffer = session.inputBuffer.slice(0, -1)
      } else if (char === '\n') {
        // Shift+Enter newline inside the prompt — keep it as a line break.
        session.inputBuffer += '\n'
      } else if (char >= ' ') {
        // Printable character (skips other control/escape bytes).
        session.inputBuffer += char
      }
    }
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

  /** Returns the complete text available in the active xterm scrollback. */
  getTranscript(id: string): TerminalTranscript {
    const session = this.sessions.get(id)
    return { text: session ? readBuffer(session.terminal) : '' }
  }

  getSnapshot(id: string): SessionSnapshot | undefined {
    return this.sessions.get(id)?.snapshot
  }

  getSnapshots(): Record<string, SessionSnapshot> {
    return this.snapshots
  }

  subscribeAll(listener: () => void): () => void {
    this.allListeners.add(listener)
    return () => this.allListeners.delete(listener)
  }

  subscribe(id: string, listener: SessionListener): () => void {
    let listeners = this.listeners.get(id)
    if (!listeners) {
      listeners = new Set()
      this.listeners.set(id, listeners)
    }

    listeners.add(listener)
    const snapshot = this.getSnapshot(id)
    if (snapshot) {
      listener(snapshot)
    }
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0 && !this.sessions.has(id)) {
        this.listeners.delete(id)
      }
    }
  }

  /** Permanently ends a session and frees its resources. */
  remove(id: string): void {
    const session = this.sessions.get(id)
    if (!session) {
      return
    }

    session.disposed = true
    this.clearIdleTimer(session)
    this.clearInitialTextTimer(session)
    this.clearSubmitRetryTimer(session)
    session.offData()
    session.offExit()
    void window.felixo?.pty?.kill({ sessionId: session.ptySessionId, force: true })
    session.terminal.dispose()
    this.sessions.delete(id)
    this.listeners.delete(id)
    if (id in this.snapshots) {
      const remainingSnapshots = { ...this.snapshots }
      delete remainingSnapshots[id]
      this.snapshots = remainingSnapshots
      this.notifyAll()
    }
  }

  /** Permanently ends every terminal session owned by the canvas. */
  clear(): void {
    for (const id of Array.from(this.sessions.keys())) {
      this.remove(id)
    }
  }

  private onOutput(session: Session): void {
    // Agent CLIs animate a spinner/timer while idle, emitting bytes every frame.
    // Treat output as real "work" only when the buffer changes beyond that
    // in-place animation; otherwise a waiting agent would look busy forever.
    const signature = computeSignature(session.terminal)
    if (signature !== session.lastSignature) {
      session.lastSignature = signature
      session.lastMeaningfulAt = Date.now()
      this.markWorking(session)
    } else {
      // Only the animation moved — make sure an idle check is scheduled so we
      // eventually settle even though bytes keep arriving.
      this.scheduleIdleCheck(session)
    }
  }

  private finishExit(
    session: Session,
    event: { exitCode: number; signal?: number },
  ): void {
    this.clearInitialTextTimer(session)
    const silentEarlyExit =
      Boolean(session.command) &&
      !session.receivedOutput &&
      Date.now() - session.startedAt < SILENT_EARLY_EXIT_MS
    const message = silentEarlyExit
      ? `O comando "${session.command}" encerrou sem produzir saída. Verifique a instalação e a autenticação da CLI.`
      : undefined

    this.update(session, {
      activity: silentEarlyExit ? 'error' : 'exited',
      exitCode: event.exitCode,
      message,
    })
  }

  private markWorking(session: Session): void {
    // Only emit on the transition into 'working' to avoid a re-render per byte;
    // the preview is refreshed once the session goes idle.
    if (session.snapshot.activity !== 'working') {
      this.update(session, { activity: 'working' })
    }
    this.scheduleIdleCheck(session)
  }

  /**
   * (Re)arms the idle check. The session only settles to `idle` once the buffer
   * has gone IDLE_AFTER_MS without a *meaningful* change — animation frames
   * (spinner/timer) bump no clock here, so a waiting agent reaches idle even
   * while it keeps repainting its prompt.
   */
  private scheduleIdleCheck(session: Session): void {
    if (session.idleTimer || session.disposed) {
      return
    }
    session.idleTimer = setTimeout(() => {
      session.idleTimer = null
      if (session.disposed || session.snapshot.activity !== 'working') {
        return
      }
      const quietFor = Date.now() - session.lastMeaningfulAt
      if (quietFor >= IDLE_AFTER_MS) {
        const viewport = readViewport(session.terminal)
        if (isBusyScreen(viewport)) {
          // The CLI is still showing its "working" banner — only its elapsed-time
          // counter is ticking, which the signature check normalizes away. Stay
          // 'working' instead of settling to idle/green while it's still busy.
          this.scheduleIdleCheck(session)
          return
        }
        // Refresh the preview from the now-settled buffer. A settled prompt
        // that looks like a decision/approval screen gets its own state so
        // it's visually distinct from "finished a turn, ready for more".
        const activity = looksLikeApprovalPrompt(viewport) ? 'waiting_approval' : 'idle'
        this.update(session, { activity })
      } else {
        this.scheduleIdleCheck(session)
      }
    }, IDLE_AFTER_MS)
  }

  private clearIdleTimer(session: Session): void {
    if (session.idleTimer) {
      clearTimeout(session.idleTimer)
      session.idleTimer = null
    }
  }

  private scheduleInitialText(
    session: Session,
    delayMs: number,
    waitStartedAt = Date.now(),
  ): void {
    if (!session.initialText || session.initialTextSent || session.disposed) {
      return
    }

    this.clearInitialTextTimer(session)
    session.initialTextTimer = setTimeout(() => {
      session.initialTextTimer = null
      if (
        session.disposed ||
        session.initialTextSent ||
        session.snapshot.activity === 'exited' ||
        session.snapshot.activity === 'error'
      ) {
        return
      }

      const elapsed = Date.now() - waitStartedAt
      const quietFor = Date.now() - session.lastMeaningfulAt
      const codexPromptReady =
        session.command !== 'codex' || hasCodexInteractivePrompt(readViewport(session.terminal))
      const processLooksReady =
        session.receivedOutput && quietFor >= INITIAL_TEXT_READY_QUIET_MS && codexPromptReady
      const fallbackReady = elapsed >= INITIAL_TEXT_MAX_WAIT_MS

      // A PTY can be created successfully before the CLI has reached its
      // interactive prompt. Wait for actual startup output to settle instead
      // of typing into the process while it is still booting. The fallback
      // keeps silent CLIs usable and is deliberately bounded.
      if (!processLooksReady && !fallbackReady) {
        this.scheduleInitialText(
          session,
          Math.min(250, INITIAL_TEXT_READY_QUIET_MS),
          waitStartedAt,
        )
        return
      }

      session.initialTextSent = true
      const submission = splitTerminalSubmission(session.initialText ?? '')
      void window.felixo?.pty?.write({
        sessionId: session.ptySessionId,
        data: submission.text,
      })

      // Sem Enter, o prompt é contexto: fica escrito na entrada da CLI e quem
      // decide executar é o usuário, que ainda vai digitar a tarefa depois
      // dele. Nada de confirmação de envio aqui — não há envio a confirmar.
      const submit = submission.submit
      if (!submit) {
        return
      }

      // Codex occasionally treats an immediate CR appended to a programmatic
      // paste as a line break. Delivering the key separately mirrors a real
      // user submission after the TUI has consumed the text.
      setTimeout(() => {
        if (!session.disposed) {
          void window.felixo?.pty?.write({
            sessionId: session.ptySessionId,
            data: submit,
          })
          this.confirmSubmission(session, submission.text, submit)
        }
      }, INITIAL_TEXT_SUBMIT_DELAY_MS)
    }, delayMs)
  }

  /**
   * Confere se o prompt inicial foi realmente submetido e reenvia o Enter
   * enquanto o texto continuar parado na linha de entrada.
   *
   * O Enter é entregue numa escrita separada do texto (ver acima), e essa
   * segunda escrita pode chegar enquanto o TUI ainda redesenha — aí a tecla se
   * perde e o `/resume` fica escrito, esperando. O intervalo fixo não tem como
   * saber disso; o conteúdo da tela tem.
   *
   * Reenviar Enter é seguro justamente porque só acontece quando o texto ainda
   * está pendente: se a CLI já submeteu, a linha de entrada está limpa e nada
   * é enviado.
   */
  private confirmSubmission(
    session: Session,
    text: string,
    submit: string,
    attempt = 1,
  ): void {
    if (attempt > SUBMIT_RETRY_LIMIT) {
      return
    }

    session.submitRetryTimer = setTimeout(() => {
      session.submitRetryTimer = null
      if (session.disposed || !isSubmissionPending(readViewport(session.terminal), text)) {
        return
      }

      void window.felixo?.pty?.write({ sessionId: session.ptySessionId, data: submit })
      this.confirmSubmission(session, text, submit, attempt + 1)
    }, SUBMIT_RETRY_DELAY_MS)
  }

  private clearSubmitRetryTimer(session: Session): void {
    if (session.submitRetryTimer) {
      clearTimeout(session.submitRetryTimer)
      session.submitRetryTimer = null
    }
  }

  private clearInitialTextTimer(session: Session): void {
    if (session.initialTextTimer) {
      clearTimeout(session.initialTextTimer)
      session.initialTextTimer = null
    }
  }

  private handleCodexTrustPrompt(session: Session, data: string): void {
    if (session.command !== 'codex' || session.codexTrustHandled || !data) {
      return
    }

    session.codexTrustBuffer = (
      session.codexTrustBuffer + data
    ).slice(-CODEX_TRUST_BUFFER_LIMIT)

    if (!isCodexTrustPrompt(session.codexTrustBuffer)) {
      return
    }

    session.codexTrustHandled = true
    this.clearInitialTextTimer(session)

    const canAutoAccept = session.args.includes(
      '--dangerously-bypass-approvals-and-sandbox',
    )
    if (!canAutoAccept) {
      return
    }

    setTimeout(() => {
      if (!session.disposed) {
        void window.felixo?.pty?.write({
          sessionId: session.ptySessionId,
          data: '\r',
        })
      }
    }, CODEX_TRUST_ACCEPT_DELAY_MS)

    this.scheduleInitialText(session, CODEX_POST_TRUST_INITIAL_TEXT_DELAY_MS)
  }

  private update(session: Session, patch: Partial<SessionSnapshot>): void {
    session.snapshot = {
      ...session.snapshot,
      ...patch,
      previewLines: computePreview(session.terminal),
    }
    this.snapshots = { ...this.snapshots, [session.id]: session.snapshot }
    for (const listener of session.listeners) {
      listener(session.snapshot)
    }
    this.notifyAll()
  }

  private notifyAll(): void {
    for (const listener of this.allListeners) {
      listener()
    }
  }
}

/** Cada CLI precisa de um tempo diferente até aceitar entrada programática. */
function getInitialTextDelay(session: Session): number {
  return session.command === 'codex'
    ? CODEX_INITIAL_TEXT_DELAY_MS
    : DEFAULT_INITIAL_TEXT_DELAY_MS
}
