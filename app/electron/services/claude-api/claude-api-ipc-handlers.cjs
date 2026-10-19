'use strict'

/**
 * Borda IPC do bloco de conversa do Claude por chave de API. Só confere o
 * formato e repassa os campos conhecidos ao gerenciador; quem decide é ele.
 *
 * Canais: `claude-api:start | send | respond-permission | interrupt | stop`,
 * e o evento `claude-api:event` ({ sessionId, event }) para o renderer.
 */

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value, max = 400) {
  return typeof value === 'string' && value.length <= max ? value : undefined
}

function safeCall(fn, fallback) {
  try {
    return fn()
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0].trim() : ''
    return { ok: false, message: message || fallback }
  }
}

/**
 * @param {{ ipcMain: { handle: Function }, manager: ReturnType<typeof import('./claude-api-session-manager.cjs').createClaudeApiSessionManager> }} deps
 */
function registerClaudeApiIpcHandlers({ ipcMain, manager, sessions }) {
  const invalid = { ok: false, message: 'Pedido inválido.' }

  // `/resume` do bloco: conversas anteriores da conta neste projeto.
  ipcMain.handle('claude-api:list-sessions', (_event, payload) => {
    if (!isRecord(payload) || !str(payload.accountId, 200) || !str(payload.cwd, 4096) || !sessions) return invalid
    return safeCall(
      () => ({ ok: true, sessions: sessions.list({ accountId: payload.accountId, cwd: payload.cwd }) }),
      'Não foi possível listar as conversas.',
    )
  })

  ipcMain.handle('claude-api:read-transcript', (_event, payload) => {
    if (!isRecord(payload) || !str(payload.accountId, 200) || !str(payload.cwd, 4096) || !str(payload.sessionId, 100) || !sessions) {
      return invalid
    }
    return safeCall(() => {
      const entries = sessions.read({ accountId: payload.accountId, cwd: payload.cwd, sessionId: payload.sessionId })
      return entries ? { ok: true, entries } : { ok: false, message: 'Essa conversa não existe nesta conta e projeto.' }
    }, 'Não foi possível ler a conversa.')
  })

  ipcMain.handle('claude-api:start', (_event, payload) => {
    if (!isRecord(payload)) return invalid
    return safeCall(
      () =>
        manager.start({
          sessionId: str(payload.sessionId, 200),
          accountId: str(payload.accountId, 200),
          cwd: str(payload.cwd, 4096),
          model: str(payload.model, 100),
          effort: str(payload.effort, 20),
          yolo: payload.yolo === true,
          resumeSessionId: str(payload.resumeSessionId, 100),
          systemContext: str(payload.systemContext, 500_000),
          warm: payload.warm === true,
        }),
      'Não foi possível abrir a conversa.',
    )
  })

  ipcMain.handle('claude-api:send', (_event, payload) => {
    if (!isRecord(payload) || typeof payload.sessionId !== 'string' || typeof payload.text !== 'string') {
      return invalid
    }
    return safeCall(() => manager.send(payload.sessionId, payload.text), 'Não foi possível enviar.')
  })

  ipcMain.handle('claude-api:respond-permission', (_event, payload) => {
    if (!isRecord(payload) || typeof payload.sessionId !== 'string' || typeof payload.requestId !== 'string') {
      return invalid
    }
    return safeCall(
      () =>
        manager.respondPermission(payload.sessionId, payload.requestId, {
          allow: payload.allow === true,
          input: isRecord(payload.input) ? payload.input : undefined,
          message: str(payload.message, 2000),
        }),
      'Não foi possível responder.',
    )
  })

  ipcMain.handle('claude-api:interrupt', (_event, sessionId) =>
    typeof sessionId === 'string' ? safeCall(() => manager.interrupt(sessionId), 'Não foi possível interromper.') : invalid,
  )

  ipcMain.handle('claude-api:stop', (_event, sessionId) =>
    typeof sessionId === 'string' ? safeCall(() => manager.stop(sessionId), 'Não foi possível fechar.') : invalid,
  )
}

module.exports = { registerClaudeApiIpcHandlers }
