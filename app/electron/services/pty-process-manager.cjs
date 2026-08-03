/**
 * @module pty-process-manager
 * Interactive PTY session lifecycle for terminal nodes.
 *
 * Unlike {@link module:cli-process-manager}, which spawns CLIs through pipes
 * and parses their JSONL output for orchestration, this manager runs each CLI
 * inside a real pseudo-terminal (PTY). The raw bytes are streamed verbatim to
 * an xterm.js view in the renderer, so interactive CLIs behave exactly as they
 * would in a native terminal — no output parsing, no masking.
 *
 * The two managers intentionally coexist: the pipe-based path keeps powering
 * structured orchestration, while this path powers human-driven terminal nodes.
 *
 * `node-pty` is a native addon compiled against a specific ABI. To keep this
 * module loadable under both the test runner (Node) and the app (Electron), the
 * binding is required lazily and can be replaced with an injected factory in
 * tests, so unit tests never touch the native binary.
 */

const os = require('node:os')
const fs = require('node:fs')
const platform = require('../core/platform/index.cjs')
const { createCliEnv } = require('./cli-process-manager.cjs')

const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24
const FORCE_KILL_DELAY_MS = 5000

// Windows-only safety net for the argv-quoting fix in createPtyLaunchSpec below:
// if a PTY launched there with extra args (e.g. codex --model ... -c ...) exits
// this fast, the CLI almost certainly never started — cmd.exe/CreateProcess
// choked on the command line rather than the CLI itself exiting. Retrying with
// the plain command (no extra args) trades those flags for a session that
// actually opens, instead of leaving the user with a frozen pane. Scoped to
// win32 only: on other platforms args are passed straight through (no argv
// re-joining to go wrong), so a fast exit there is a real CLI outcome — e.g.
// `--version`/`--help` — that must reach the caller as-is, not be retried away.
const EARLY_EXIT_THRESHOLD_MS = 800

/**
 * @typedef {object} PtyHandle
 * @property {number} pid
 * @property {(data: string) => void} write
 * @property {(cols: number, rows: number) => void} resize
 * @property {(signal?: string) => void} kill
 * @property {(listener: (data: string) => void) => void} onData
 * @property {(listener: (event: { exitCode: number, signal?: number }) => void) => void} onExit
 */

/**
 * @typedef {(file: string, args: string[], options: object) => PtyHandle} PtyFactory
 */

class PtyProcessManager {
  /**
   * @param {object} [dependencies]
   * @param {PtyFactory} [dependencies.spawnPty] - Injectable PTY factory (tests).
   * @param {() => number} [dependencies.now] - Injectable clock (tests).
   * @param {typeof platform} [dependencies.platform] - Injectable platform adapter (tests).
   */
  constructor({ spawnPty, now, platform: platformAdapter } = {}) {
    this.sessions = new Map()
    this.injectedSpawnPty = spawnPty ?? null
    this.now = now ?? (() => Date.now())
    this.platform = platformAdapter ?? platform
  }

  /**
   * Start an interactive PTY session and stream its raw output.
   *
   * @param {string} sessionId
   * @param {object} [options]
   * @param {string} [options.command] - Binary to run; defaults to the user shell.
   * @param {string[]} [options.args]
   * @param {string} [options.cwd]
   * @param {number} [options.cols]
   * @param {number} [options.rows]
   * @param {(data: string) => void} [options.onData] - Raw output sink.
   * @param {(event: { exitCode: number, signal?: number }) => void} [options.onExit]
   * @param {boolean} [isFallbackRetry] - Internal: true when this call is the
   *   automatic bare-command retry after an early exit (see class docs above).
   *   Callers should never pass this themselves.
   * @returns {PtyHandle}
   */
  spawn(sessionId, options = {}, isFallbackRetry = false) {
    if (!isFallbackRetry) {
      this.kill(sessionId, { force: true })
    }

    const spawnPty = this.resolveSpawnPty()
    const env = createCliEnv()
    const args = Array.isArray(options.args) ? options.args : []
    const command = options.command || this.platform.getDefaultShell(process.env)
    const launch = options.command
      ? createPtyLaunchSpec(command, args, env, this.platform)
      : { command, args }
    const cols = normalizeDimension(options.cols, DEFAULT_COLS)
    const rows = normalizeDimension(options.rows, DEFAULT_ROWS)
    const cwd = resolveWorkingDirectory(options.cwd)

    // Only a first attempt with a real command + extra args, on the platform
    // where the argv-quoting fallback applies (see EARLY_EXIT_THRESHOLD_MS
    // above), gets a retry — a bare shell, a command with no args, or the
    // retry itself has nothing simpler left to fall back to.
    const allowFallback =
      !isFallbackRetry &&
      this.platform.name === 'win32' &&
      Boolean(options.command) &&
      args.length > 0

    const ptyProcess = spawnPty(launch.command, launch.args, {
      name: 'xterm-256color',
      cols,
      rows,
      // No project selected → open in the user's home, like a fresh terminal,
      // instead of inheriting the app's working directory.
      cwd,
      env,
    })

    const entry = {
      ptyProcess,
      cols,
      rows,
      killTimer: null,
      spawnedAt: this.now(),
    }

    this.sessions.set(sessionId, entry)

    if (typeof options.onData === 'function') {
      ptyProcess.onData((data) => options.onData(data))
    }

    ptyProcess.onExit((event) => {
      // A kill()/re-spawn may have already replaced this session's entry by
      // the time this fires — only the still-current attempt gets to retry
      // or report its exit; a superseded attempt's exit is not this session's
      // outcome anymore.
      const isCurrentAttempt = this.sessions.get(sessionId) === entry
      this.cleanup(sessionId, ptyProcess)

      if (
        isCurrentAttempt &&
        allowFallback &&
        this.now() - entry.spawnedAt < EARLY_EXIT_THRESHOLD_MS
      ) {
        this.spawn(sessionId, { ...options, args: [] }, true)
        return
      }

      if (typeof options.onExit === 'function') {
        options.onExit(event)
      }
    })

    return ptyProcess
  }

  /**
   * @param {string} sessionId
   * @returns {PtyHandle | null}
   */
  get(sessionId) {
    return this.sessions.get(sessionId)?.ptyProcess ?? null
  }

  /**
   * @param {string} sessionId
   * @returns {boolean}
   */
  has(sessionId) {
    return this.sessions.has(sessionId)
  }

  /**
   * Forward user keystrokes (or programmatic input) to the PTY.
   *
   * @param {string} sessionId
   * @param {string} input
   * @returns {boolean} Whether the input was delivered.
   */
  write(sessionId, input) {
    const entry = this.sessions.get(sessionId)

    if (!entry) {
      return false
    }

    entry.ptyProcess.write(input)
    return true
  }

  /**
   * Resize the PTY so the CLI redraws for the current view dimensions.
   *
   * @param {string} sessionId
   * @param {number} cols
   * @param {number} rows
   * @returns {boolean} Whether the resize was applied.
   */
  resize(sessionId, cols, rows) {
    const entry = this.sessions.get(sessionId)

    if (!entry) {
      return false
    }

    const nextCols = normalizeDimension(cols, entry.cols)
    const nextRows = normalizeDimension(rows, entry.rows)

    if (nextCols === entry.cols && nextRows === entry.rows) {
      return true
    }

    entry.cols = nextCols
    entry.rows = nextRows
    entry.ptyProcess.resize(nextCols, nextRows)
    return true
  }

  /**
   * Terminate a session. A graceful SIGTERM is escalated to SIGKILL after a
   * delay; `force` kills immediately and drops the session right away.
   *
   * @param {string} sessionId
   * @param {object} [options]
   * @param {boolean} [options.force]
   * @returns {boolean}
   */
  kill(sessionId, options = {}) {
    const entry = this.sessions.get(sessionId)

    if (!entry) {
      return false
    }

    if (options.force) {
      this.safeKill(entry.ptyProcess, 'SIGKILL')
      this.cleanup(sessionId, entry.ptyProcess)
      return true
    }

    this.safeKill(entry.ptyProcess, 'SIGTERM')

    if (!entry.killTimer) {
      entry.killTimer = setTimeout(() => {
        const current = this.sessions.get(sessionId)

        if (current === entry) {
          this.safeKill(entry.ptyProcess, 'SIGKILL')
        }
      }, FORCE_KILL_DELAY_MS)

      if (typeof entry.killTimer.unref === 'function') {
        entry.killTimer.unref()
      }
    }

    return true
  }

  killAll(options = {}) {
    for (const sessionId of [...this.sessions.keys()]) {
      this.kill(sessionId, options)
    }
  }

  /**
   * @param {string} sessionId
   * @param {PtyHandle} ptyProcess
   */
  cleanup(sessionId, ptyProcess) {
    const entry = this.sessions.get(sessionId)

    if (!entry || entry.ptyProcess !== ptyProcess) {
      return
    }

    if (entry.killTimer) {
      clearTimeout(entry.killTimer)
    }

    this.sessions.delete(sessionId)
  }

  /**
   * Resolve the PTY factory: injected one in tests, lazily required `node-pty`
   * in production. The require is deferred so importing this module never loads
   * the native binary unless a real session is actually started.
   *
   * @returns {PtyFactory}
   */
  resolveSpawnPty() {
    if (this.injectedSpawnPty) {
      return this.injectedSpawnPty
    }

    const nodePty = require('node-pty')
    return (file, args, options) => nodePty.spawn(file, args, options)
  }

  /**
   * @param {PtyHandle} ptyProcess
   * @param {string} signal
   */
  safeKill(ptyProcess, signal) {
    try {
      ptyProcess.kill(signal)
    } catch {
      // The PTY may already be gone; treating kill as idempotent keeps the
      // lifecycle predictable for callers.
    }
  }
}

/**
 * Wrap an explicit CLI command so the OS can actually find and launch it.
 *
 * - macOS: GUI apps inherit a reduced environment from LaunchServices, so we run
 *   through the user's interactive login shell to mirror Terminal.app and load
 *   version-manager setup from the shell configuration.
 * - Windows: `node-pty` spawns via `CreateProcess`, which does NOT honour
 *   `PATHEXT` or search the way a shell does — so a bare `claude` (installed as
 *   `claude.cmd`) fails with "Cannot create process, error code: 2". Launching
 *   through `cmd.exe /c` lets the shell resolve the `.cmd`/`.exe`/`.ps1` shim and
 *   the full PATH, exactly like typing the command in a real terminal.
 * - Linux: the binary is on PATH as-is, so the command runs directly.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {Record<string, string>} env
 * @param {typeof platform} [adapter]
 * @returns {{ command: string, args: string[] }}
 */
function createPtyLaunchSpec(command, args, env, adapter = platform) {
  if (adapter.name === 'darwin') {
    const shell = adapter.getDefaultShell(env)
    const commandLine = [command, ...args]
      .map((value) => adapter.escapeArg(String(value)))
      .join(' ')

    return {
      command: shell,
      args: ['-l', '-i', '-c', `exec ${commandLine}`],
    }
  }

  if (adapter.name === 'win32') {
    // cmd.exe resolves PATHEXT (.cmd/.exe/.ps1) and searches PATH; `/d /s /c`
    // skips AutoRun and runs the command that follows. Passed as separate argv
    // entries (not pre-joined into one string) so node-pty's own Windows
    // command-line builder — which already quotes each argument correctly for
    // CreateProcess/ConPTY — does the joining, instead of risking a second,
    // divergent round of escaping here.
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', command, ...args],
    }
  }

  return { command, args }
}

/**
 * Clamp a terminal dimension to a sane positive integer.
 *
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function normalizeDimension(value, fallback) {
  const numeric = Number(value)

  if (!Number.isFinite(numeric) || numeric < 1) {
    return fallback
  }

  return Math.floor(numeric)
}

/**
 * A canvas project can be moved or deleted after a terminal node is saved.
 * node-pty fails before the shell starts when cwd no longer exists, which is
 * especially opaque on Windows (the pane only shows "path not found").
 * Starting in the user's home keeps the terminal usable and lets the user
 * navigate to the project again.
 *
 * @param {unknown} requested
 * @returns {string}
 */
function resolveWorkingDirectory(requested) {
  const fallback = os.homedir()
  if (typeof requested !== 'string' || !requested.trim()) {
    return fallback
  }

  try {
    return fs.statSync(requested).isDirectory() ? requested : fallback
  } catch {
    return fallback
  }
}

module.exports = {
  PtyProcessManager,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  createPtyLaunchSpec,
  resolveWorkingDirectory,
}
