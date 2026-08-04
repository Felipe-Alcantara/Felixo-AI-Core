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
const path = require('node:path')
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
const WINDOWS_SHELL_PATH_ERROR = /(?:cannot find the path specified|sistema não pode encontrar o caminho especificado)/i
const SHELL_STARTUP_RECOVERY_WINDOW_MS = 3000

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
   * @param {{ warn?: (...args: unknown[]) => void }} [dependencies.logger] - Diagnostic logger.
   * @param {(command: string, env: Record<string, string>) => string | null} [dependencies.resolveCodexPath] - Injectable Codex resolver.
   * @param {() => boolean} [dependencies.isDebugSession] - Whether detailed local diagnostics are enabled.
   */
  constructor({ spawnPty, now, platform: platformAdapter, logger, resolveCodexPath, isDebugSession } = {}) {
    this.sessions = new Map()
    this.injectedSpawnPty = spawnPty ?? null
    this.now = now ?? (() => Date.now())
    this.platform = platformAdapter ?? platform
    this.logger = logger ?? console
    this.resolveCodexPath = resolveCodexPath ?? resolveWindowsCodexPath
    this.isDebugSession = isDebugSession ?? (() => process.env.FELIXO_DEBUG_SESSION === '1')
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
   * @param {string} [options.defaultShell] - Internal Windows fallback shell.
   * @param {boolean} [isFallbackRetry] - Internal: true when this call is a
   *   recovery retry after an early exit or Windows PTY backend error. Callers
   *   should never pass this themselves.
   * @param {boolean} [useConpty] - Internal Windows backend override. `false`
   *   retries through WinPTY after a ConPTY startup-path error.
   * @returns {PtyHandle}
   */
  spawn(
    sessionId,
    options = {},
    isFallbackRetry = false,
    allowEmergencyShellFallback = true,
    useConpty,
  ) {
    if (!isFallbackRetry) {
      this.kill(sessionId, { force: true })
    }

    const spawnPty = this.resolveSpawnPty()
    const env = createCliEnv()
    const args = Array.isArray(options.args) ? options.args : []
    const defaultShell = options.defaultShell || this.platform.getDefaultShell(env)
    const requestedCommand = options.command || defaultShell
    const command = resolvePtyCommand(
      requestedCommand,
      Boolean(options.command),
      env,
      this.platform,
      this.resolveCodexPath,
    )
    const launch = options.command
      ? createPtyLaunchSpec(command, args, env, this.platform)
      : { command, args: getDefaultPtyShellArgs(command, this.platform) }
    const cols = normalizeDimension(options.cols, DEFAULT_COLS)
    const rows = normalizeDimension(options.rows, DEFAULT_ROWS)
    const cwd = resolveWorkingDirectory(options.cwd)

    if (typeof options.cwd === 'string' && options.cwd.trim() && cwd !== options.cwd) {
      this.reportLayer(
        options,
        'diretório de trabalho',
        'O caminho salvo não está disponível; usando a pasta do usuário.',
        'invalid-cwd',
      )
    }

    // Only a first attempt with a real command + extra args, on the platform
    // where the argv-quoting fallback applies (see EARLY_EXIT_THRESHOLD_MS
    // above), gets a retry — a bare shell, a command with no args, or the
    // retry itself has nothing simpler left to fall back to.
    const allowFallback =
      !isFallbackRetry &&
      this.platform.name === 'win32' &&
      Boolean(options.command) &&
      args.length > 0
    const allowWindowsBackendFallback =
      !isFallbackRetry &&
      this.platform.name === 'win32' &&
      useConpty !== false
    const allowCodexPathFallback =
      !isFallbackRetry &&
      this.platform.name === 'win32' &&
      Boolean(options.command) &&
      isCodexCommand(requestedCommand)
    let windowsBackendFallbackRetried = false

    let ptyProcess
    try {
      ptyProcess = spawnPty(launch.command, launch.args, {
        name: 'xterm-256color',
        cols,
        rows,
        // No project selected → open in the user's home, like a fresh terminal,
        // instead of inheriting the app's working directory.
        cwd,
        env,
        ...(useConpty === false ? { useConpty: false } : {}),
      })
    } catch {
      this.reportLayer(
        options,
        'inicialização do PTY',
        'Não foi possível criar a sessão do terminal.',
        'pty-spawn-error',
      )
      throw new Error('Camada de inicialização do PTY: não foi possível criar a sessão.')
    }

    const entry = {
      ptyProcess,
      cols,
      rows,
      killTimer: null,
      spawnedAt: this.now(),
    }

    this.sessions.set(sessionId, entry)

    if (typeof options.onData === 'function') {
      ptyProcess.onData((data) => {
        // ConPTY can start a default shell successfully and only then report
        // an invalid path. Only handle the platform's own startup text here:
        // a CLI may legitimately print "File not found" for its work, and
        // treating that as a shell failure used to kill Codex sessions.
        if (
          allowWindowsBackendFallback &&
          !windowsBackendFallbackRetried &&
          this.now() - entry.spawnedAt <= SHELL_STARTUP_RECOVERY_WINDOW_MS &&
          WINDOWS_SHELL_PATH_ERROR.test(String(data))
        ) {
          windowsBackendFallbackRetried = true
          this.reportWindowsShellStartupDiagnostic(launch, cwd, data, useConpty)
          this.reportLayer(
            options,
            'backend PTY do Windows',
            'A camada de terminal reportou um erro de caminho; tentando o backend alternativo.',
            'shell-path-error',
          )
          this.safeKill(ptyProcess, 'SIGKILL')
          this.cleanup(sessionId, ptyProcess)
          this.spawn(
            sessionId,
            { ...options, cwd },
            true,
            allowEmergencyShellFallback,
            false,
          )
          return
        }
        options.onData(data)
      })
    }

    ptyProcess.onExit((event) => {
      // A kill()/re-spawn may have already replaced this session's entry by
      // the time this fires — only the still-current attempt gets to retry
      // or report its exit; a superseded attempt's exit is not this session's
      // outcome anymore.
      const isCurrentAttempt = this.sessions.get(sessionId) === entry
      this.cleanup(sessionId, ptyProcess)

      const exitedEarly =
        isCurrentAttempt &&
        this.platform.name === 'win32' &&
        event.exitCode !== 0 &&
        this.now() - entry.spawnedAt < EARLY_EXIT_THRESHOLD_MS

      if (exitedEarly) {
        if (!isFallbackRetry && allowCodexPathFallback) {
          const resolvedCodexPath = this.resolveCodexPath(requestedCommand, env)
          if (resolvedCodexPath && resolvedCodexPath !== command) {
            this.reportLayer(
              options,
              'localização do Codex',
              'O Codex falhou cedo; um executável local foi encontrado e será usado.',
              'codex-path-resolved',
            )
            this.spawn(
              sessionId,
              { ...options, command: resolvedCodexPath },
              true,
              allowEmergencyShellFallback,
            )
            return
          }
          this.reportLayer(
            options,
            'localização do Codex',
            'O Codex falhou cedo e não foi localizado nos caminhos conhecidos.',
            'codex-path-not-found',
          )
        }

        if (!isFallbackRetry && allowFallback) {
          this.reportLayer(
            options,
            'argumentos da CLI',
            'A CLI encerrou cedo; tentando iniciar sem os argumentos adicionais.',
            'early-exit-args-retry',
          )
          this.spawn(sessionId, { ...options, args: [] }, true, allowEmergencyShellFallback)
          return
        }

        if (allowEmergencyShellFallback) {
          this.reportLayer(
            options,
            'shell de emergência',
            'As tentativas da CLI falharam; abrindo um shell limpo do Windows.',
            'emergency-shell-fallback',
          )
          this.spawn(
            sessionId,
            { cwd: os.homedir(), onData: options.onData, onExit: options.onExit },
            true,
            false,
          )
          return
        }
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

  /**
   * Keep diagnostics best-effort: logging must never prevent a terminal from
   * starting, especially in packaged builds where console methods may be absent.
   * Paths are intentionally omitted from the log payload.
   *
   * @param {string} message
   * @param {Record<string, string>} details
   */
  warn(message, details) {
    try {
      this.logger?.warn?.(message, details)
    } catch {
      // Diagnostics are never part of the terminal's control flow.
    }
  }

  /**
   * Reports the recovery layer to diagnostics and the visible terminal.
   * Paths and command arguments are intentionally omitted from the notice.
   *
   * @param {object} options
   * @param {string} layer
   * @param {string} notice
   * @param {string} reason
   */
  reportLayer(options, layer, notice, reason) {
    this.warn(`PTY: ${notice}`, { reason, platform: this.platform.name })
    try {
      options.onData?.(`\r\n[Felixo] Camada: ${layer}. ${notice}\r\n`)
    } catch {
      // A renderer listener must not alter the PTY recovery path.
    }
  }

  /**
   * The dedicated launcher console is explicitly for local diagnosis, so it
   * may contain the actual shell, cwd and startup text. Normal app launches
   * keep the existing path-free diagnostic to avoid leaking local locations.
   */
  reportWindowsShellStartupDiagnostic(launch, cwd, data, useConpty) {
    if (!this.isDebugSession()) {
      return
    }

    this.warn('PTY: Diagnóstico bruto do shell Windows.', {
      reason: 'shell-path-error',
      platform: this.platform.name,
      backend: useConpty === false ? 'winpty' : 'conpty/auto',
      shell: launch.command,
      args: launch.args,
      cwd,
      output: String(data).replaceAll('\0', '').slice(0, 4000),
    })
  }
}

/**
 * Resolve a Windows Codex shim before creating the PTY. Unlike an interactive
 * user terminal, node-pty launches through CreateProcess and may not inherit
 * the same PATHEXT/PATH resolution behaviour. An absolute codex.cmd removes
 * that environmental difference while preserving the normal bare command when
 * no known shim exists.
 *
 * @param {string} command
 * @param {boolean} isExplicitCommand
 * @param {Record<string, string>} env
 * @param {typeof platform} adapter
 * @param {(command: string, env: Record<string, string>) => string | null} resolveCodexPath
 * @returns {string}
 */
function resolvePtyCommand(command, isExplicitCommand, env, adapter, resolveCodexPath) {
  if (!isExplicitCommand || adapter.name !== 'win32' || !isCodexCommand(command)) {
    return command
  }

  return resolveCodexPath(command, env) ?? command
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
 * A PTY needs a persistent shell, unlike one-shot shell command execution.
 * On Windows start it without AutoRun/profile scripts, which can emit startup
 * errors or immediately exit before the user has a usable terminal.
 *
 * @param {string} command
 * @param {typeof platform} adapter
 * @returns {string[]}
 */
function getDefaultPtyShellArgs(command, adapter) {
  if (adapter.name !== 'win32') {
    return []
  }

  if (typeof adapter.getShellArgs === 'function') {
    return adapter.getShellArgs(command)
  }

  return /(?:powershell|pwsh)/i.test(command) ? ['-NoLogo', '-NoProfile'] : ['/d']
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

/**
 * Locate the Windows Codex shim without invoking a shell. This covers PATH
 * entries plus the npm global directory used by the standard Windows install.
 *
 * @param {string} command
 * @param {Record<string, string>} env
 * @param {(candidate: string) => boolean} [exists]
 * @returns {string | null}
 */
function resolveWindowsCodexPath(command, env, exists = fs.existsSync) {
  if (!isCodexCommand(command)) {
    return null
  }

  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path')
  const pathEntries = String(pathKey ? env[pathKey] : '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
  const home = env.USERPROFILE || env.HOME || os.homedir()
  const knownDirectories = [
    ...pathEntries,
    env.APPDATA ? path.win32.join(env.APPDATA, 'npm') : null,
    env.LOCALAPPDATA ? path.win32.join(env.LOCALAPPDATA, 'npm') : null,
    home ? path.win32.join(home, 'AppData', 'Roaming', 'npm') : null,
  ].filter(Boolean)
  const commandName = path.win32.basename(command).replace(/\.(?:cmd|exe|bat|ps1)$/i, '')

  for (const directory of [...new Set(knownDirectories)]) {
    for (const extension of ['.cmd', '.exe', '.bat', '.ps1', '']) {
      const candidate = path.win32.join(directory, `${commandName}${extension}`)
      try {
        if (exists(candidate)) {
          return candidate
        }
      } catch {
        continue
      }
    }
  }

  return null
}

function isCodexCommand(command) {
  return path.win32
    .basename(String(command ?? ''))
    .replace(/\.(?:cmd|exe|bat|ps1)$/i, '')
    .toLowerCase() === 'codex'
}

module.exports = {
  PtyProcessManager,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  createPtyLaunchSpec,
  getDefaultPtyShellArgs,
  resolvePtyCommand,
  resolveWorkingDirectory,
  resolveWindowsCodexPath,
}
