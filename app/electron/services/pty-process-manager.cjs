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

const platform = require('../core/platform/index.cjs')
const { createCliEnv } = require('./cli-process-manager.cjs')

const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24
const FORCE_KILL_DELAY_MS = 5000

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
   */
  constructor({ spawnPty } = {}) {
    this.sessions = new Map()
    this.injectedSpawnPty = spawnPty ?? null
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
   * @returns {PtyHandle}
   */
  spawn(sessionId, options = {}) {
    this.kill(sessionId, { force: true })

    const spawnPty = this.resolveSpawnPty()
    const env = createCliEnv()
    const command = options.command || platform.getDefaultShell(process.env)
    const args = Array.isArray(options.args) ? options.args : []
    const cols = normalizeDimension(options.cols, DEFAULT_COLS)
    const rows = normalizeDimension(options.rows, DEFAULT_ROWS)

    const ptyProcess = spawnPty(command, args, {
      name: 'xterm-color',
      cols,
      rows,
      cwd: options.cwd || process.cwd(),
      env,
    })

    const entry = {
      ptyProcess,
      cols,
      rows,
      killTimer: null,
    }

    this.sessions.set(sessionId, entry)

    if (typeof options.onData === 'function') {
      ptyProcess.onData((data) => options.onData(data))
    }

    ptyProcess.onExit((event) => {
      if (typeof options.onExit === 'function') {
        options.onExit(event)
      }

      this.cleanup(sessionId, ptyProcess)
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

module.exports = {
  PtyProcessManager,
  DEFAULT_COLS,
  DEFAULT_ROWS,
}
