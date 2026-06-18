/**
 * @module pty-ipc-handlers
 * IPC bridge for interactive PTY terminal sessions.
 *
 * Wires the renderer (xterm.js views) to {@link module:pty-process-manager}.
 * Raw PTY bytes are streamed to the renderer via `pty:data`; exits via
 * `pty:exit`. Keystrokes, resizes and lifecycle come back through invokable
 * `pty:*` channels. This path is deliberately separate from the JSONL `cli:*`
 * orchestration path — here we never parse output, we just move bytes.
 */

const { ipcMain } = require('electron')
const { PtyProcessManager } = require('./pty-process-manager.cjs')

/**
 * @param {() => (import('electron').BrowserWindow | null)} getMainWindow
 * @param {object} [dependencies]
 * @param {PtyProcessManager} [dependencies.manager] - Injectable for tests.
 * @returns {{ manager: PtyProcessManager, dispose: () => void }}
 */
function registerPtyIpcHandlers(getMainWindow, dependencies = {}) {
  const manager = dependencies.manager ?? new PtyProcessManager()

  const send = (channel, payload) => {
    const window = getMainWindow()

    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }

  ipcMain.handle('pty:spawn', (_event, params = {}) => {
    try {
      const sessionId = requireSessionId(params.sessionId)

      manager.spawn(sessionId, {
        command: params.command,
        args: params.args,
        cwd: params.cwd,
        cols: params.cols,
        rows: params.rows,
        onData: (data) => send('pty:data', { sessionId, data }),
        onExit: (event) =>
          send('pty:exit', {
            sessionId,
            exitCode: event.exitCode,
            signal: event.signal,
          }),
      })

      return { ok: true, sessionId }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel iniciar o terminal.')
    }
  })

  ipcMain.handle('pty:write', (_event, params = {}) => {
    try {
      const sessionId = requireSessionId(params.sessionId)
      const delivered = manager.write(sessionId, String(params.data ?? ''))
      return { ok: true, delivered }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel enviar dados ao terminal.')
    }
  })

  ipcMain.handle('pty:resize', (_event, params = {}) => {
    try {
      const sessionId = requireSessionId(params.sessionId)
      const applied = manager.resize(sessionId, params.cols, params.rows)
      return { ok: true, applied }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel redimensionar o terminal.')
    }
  })

  ipcMain.handle('pty:kill', (_event, params = {}) => {
    try {
      const sessionId = requireSessionId(params.sessionId)
      const killed = manager.kill(sessionId, { force: Boolean(params.force) })
      return { ok: true, killed }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel encerrar o terminal.')
    }
  })

  const dispose = () => {
    manager.killAll({ force: true })
  }

  return { manager, dispose }
}

function requireSessionId(sessionId) {
  if (typeof sessionId !== 'string' || sessionId.trim() === '') {
    throw new Error('sessionId is required.')
  }

  return sessionId
}

function toErrorResult(error, fallbackMessage) {
  return {
    ok: false,
    message: error instanceof Error ? error.message : fallbackMessage,
  }
}

module.exports = {
  registerPtyIpcHandlers,
  requireSessionId,
  toErrorResult,
}
