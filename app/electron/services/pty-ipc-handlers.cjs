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
const { toErrorResult } = require('./ipc-result.cjs')
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
      const reused = Boolean(params.reuseExisting && manager.has?.(sessionId))

      manager.spawn(sessionId, {
        command: params.command,
        args: params.args,
        cwd: params.cwd,
        cols: params.cols,
        rows: params.rows,
        reuseExisting: Boolean(params.reuseExisting),
        fallbackCommand: params.fallbackCommand,
        keepShellOpen: Boolean(params.keepShellOpen),
        // Conta escolhida no configurador do agente; ausente = login do
        // sistema, que é o comportamento de antes desta feature.
        accountId: typeof params.accountId === 'string' ? params.accountId : undefined,
        onData: (data) => send('pty:data', { sessionId, data }),
        onExit: (event) =>
          send('pty:exit', {
            sessionId,
            exitCode: event.exitCode,
            signal: event.signal,
          }),
        onSession: (reference) => send('pty:session', { ptySessionId: sessionId, ...reference }),
      })

      return { ok: true, sessionId, ...(reused ? { reused: true } : {}) }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel iniciar o terminal.')
    }
  })

  ipcMain.handle('pty:write', async (_event, params = {}) => {
    try {
      const sessionId = requireSessionId(params.sessionId)
      const delivered = manager.write(sessionId, String(params.data ?? ''))
      // Só responde depois que a carga saiu de verdade. Texto grande vai
      // fatiado, e quem escreve precisa distinguir "aceito" de "entregue" —
      // senão confere a tela cedo demais e reescreve o que ainda estava saindo.
      if (delivered) {
        await manager.aguardarEscritas?.(sessionId)
      }
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

module.exports = {
  registerPtyIpcHandlers,
  requireSessionId,
  // Reexportado a partir de ./ipc-result.cjs para não quebrar quem já importa
  // daqui (inclusive o teste deste módulo).
  toErrorResult,
}
