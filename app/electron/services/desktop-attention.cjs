'use strict'

const OPEN_CHANNEL = 'desktop-attention:open'
const MAX_TEXT = 140

function clampText(value) {
  return typeof value === 'string' ? value.slice(0, MAX_TEXT) : ''
}

/**
 * Chama a atenção da pessoa pelo sistema operacional quando um agente precisa
 * dela e o app está fora de foco: notificação nativa, pisca na barra de
 * tarefas (Windows/Linux) e salto/número no Dock (macOS).
 *
 * Quem decide QUANDO avisar é o renderer (foco, preferências, agrupamento);
 * aqui só se executa. O texto vem pronto de lá e nunca leva saída de terminal.
 * shortcut: macOS sem assinatura pode recusar a notificação (o Dock segue
 * funcionando); trocar quando o app for assinado.
 */
function createDesktopAttention({
  app,
  Notification,
  getMainWindow,
  platform = process.platform,
}) {
  // Referência viva: o Electron pode coletar a notificação antes do clique.
  const live = new Set()

  function focusWindow(win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }

  function flash(win) {
    if (platform === 'darwin') {
      app.dock?.bounce('informational')
      return
    }
    win.flashFrame(true)
    // No Windows o sistema para sozinho ao focar; no Linux precisa mandar.
    win.once('focus', () => {
      if (!win.isDestroyed()) win.flashFrame(false)
    })
  }

  return {
    notify({ title, body, nodeId } = {}) {
      const win = getMainWindow()
      if (!win || win.isDestroyed() || win.isFocused()) return { shown: false }
      flash(win)
      if (!Notification.isSupported()) return { shown: false, flashed: true }
      const notification = new Notification({
        title: clampText(title) || 'Felixo AI Core',
        body: clampText(body),
      })
      live.add(notification)
      const release = () => live.delete(notification)
      notification.on('close', release)
      notification.on('failed', release)
      notification.on('click', () => {
        release()
        if (win.isDestroyed()) return
        focusWindow(win)
        if (typeof nodeId === 'string' && nodeId) win.webContents.send(OPEN_CHANNEL, { nodeId })
      })
      notification.show()
      return { shown: true, flashed: true }
    },
    setUnread(count) {
      const n = Number.isFinite(count) ? Math.max(0, Math.min(999, Math.trunc(count))) : 0
      if (platform === 'darwin') app.setBadgeCount(n)
      return { count: n }
    },
  }
}

function registerDesktopAttentionIpcHandlers({ ipcMain, ...deps }) {
  // Instalado, o atalho do instalador já traz o id; no `npm run dev` ele não
  // existe e a notificação do Windows pode não aparecer (limitação do Electron).
  if ((deps.platform ?? process.platform) === 'win32' && deps.app.isPackaged) {
    deps.app.setAppUserModelId?.('com.felixoverse.felixo-ai-core')
  }
  const attention = createDesktopAttention(deps)
  ipcMain.handle('desktop-attention:notify', (_event, payload) => attention.notify(payload))
  ipcMain.handle('desktop-attention:set-unread', (_event, count) => attention.setUnread(count))
  return attention
}

module.exports = { OPEN_CHANNEL, createDesktopAttention, registerDesktopAttentionIpcHandlers }
