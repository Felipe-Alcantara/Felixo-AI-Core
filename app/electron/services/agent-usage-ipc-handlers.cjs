'use strict'

const { ipcMain } = require('electron')
const { toErrorResult } = require('./ipc-result.cjs')
const { redactSecrets } = require('./official-cli-account-status.cjs')
const path = require('node:path')
const { createAgentUsageService } = require('./agent-usage-service.cjs')
const {
  createAgentUsageRefreshScheduler,
} = require('./agent-usage-refresh-scheduler.cjs')
const { getAppPaths } = require('../core/app-paths.cjs')
const {
  createClaudeStatuslineService,
} = require('./claude-statusline-service.cjs')
const { createAgentUsageWatcher } = require('./agent-usage-watcher.cjs')

/**
 * Erro devolvido ao renderer. A mensagem de uma exceção pode trazer texto de CLI
 * ou do ambiente (`OPENAI_API_KEY=…`, URL com senha): passa pelo mesmo redator
 * da saída das CLIs, e o motivo continua legível.
 */
function usageErrorResult(error, fallbackMessage) {
  const result = toErrorResult(error, fallbackMessage)
  return { ...result, message: redactSecrets(result.message) }
}

/**
 * A superfície IPC do painel é pequena de propósito: listar, atualizar,
 * adicionar e arquivar. Nenhuma saída de CLI atravessa este módulo.
 */
function registerAgentUsageIpcHandlers({
  service = createAgentUsageService(),
  statuslineDir = path.join(getAppPaths().userData, 'claude-statusline'),
  statusline = createClaudeStatuslineService({ baseDir: statuslineDir }),
  getMainWindow = () => null,
  createWatcher = createAgentUsageWatcher,
  createScheduler = createAgentUsageRefreshScheduler,
  getActiveSessions = () => [],
  powerMonitor = null,
  onSchedulerMetrics = () => {},
} = {}) {
  const sendDashboard = (dashboard) => {
    const window = getMainWindow()
    if (!window || window.isDestroyed?.()) return
    window.webContents?.send('agent-usage:changed', dashboard)
  }
  const scheduler = createScheduler({
    service,
    getActiveSessions,
    getSystemIdleTime: () => powerMonitor?.getSystemIdleTime?.() ?? 0,
    isOnBatteryPower: () => powerMonitor?.isOnBatteryPower?.() === true,
    isWindowVisible: () => {
      const window = getMainWindow()
      return Boolean(window && !window.isDestroyed?.() && window.isVisible?.() !== false)
    },
    onDashboard: sendDashboard,
    onMetrics: onSchedulerMetrics,
  })

  async function runManualRefresh(operation, scope = {}) {
    const startedAt = await scheduler.manualRefreshStarted()
    try {
      const dashboard = await operation()
      scheduler.manualRefreshFinished(dashboard, { startedAt, ...scope })
      return dashboard
    } catch (error) {
      scheduler.manualRefreshFinished(null, { startedAt, ...scope })
      throw error
    }
  }

  const consumerIds = new Set(['canvas-panel', 'chat-modal'])
  const onSchedulerState = (event, consumerId, state) => {
    const window = getMainWindow()
    if (
      !window ||
      window.isDestroyed?.() ||
      event?.sender !== window.webContents ||
      !consumerIds.has(consumerId) ||
      !state ||
      typeof state !== 'object'
    ) {
      return
    }

    scheduler.setConsumerState(`${event.sender.id}:${consumerId}`, state)
  }
  ipcMain.on?.('agent-usage:scheduler-state', onSchedulerState)

  const window = getMainWindow()
  const onWindowHide = () => scheduler.setWindowVisible(false)
  const onWindowShow = () => scheduler.setWindowVisible(true)
  window?.on?.('hide', onWindowHide)
  window?.on?.('show', onWindowShow)
  window?.on?.('minimize', onWindowHide)
  window?.on?.('restore', onWindowShow)

  const powerListeners = []
  const listenPowerEvent = (eventName, listener) => {
    if (typeof powerMonitor?.on !== 'function') return
    powerMonitor.on(eventName, listener)
    powerListeners.push([eventName, listener])
  }
  listenPowerEvent('on-ac', () => scheduler.refreshPowerPolicy())
  listenPowerEvent('on-battery', () => scheduler.refreshPowerPolicy())
  listenPowerEvent('user-did-become-active', () => scheduler.refreshPowerPolicy())
  listenPowerEvent('user-did-resign-active', () => scheduler.refreshPowerPolicy())
  listenPowerEvent('suspend', () => scheduler.setSuspended(true))
  listenPowerEvent('resume', () => scheduler.setSuspended(false))

  ipcMain.handle('agent-usage:list', async () => {
    try {
      return await service.list()
    } catch (error) {
      return usageErrorResult(error, 'Não foi possível carregar o uso dos agentes.')
    }
  })

  ipcMain.handle('agent-usage:refresh', async () => {
    try {
      return await runManualRefresh(() => service.refresh())
    } catch (error) {
      return usageErrorResult(error, 'Não foi possível atualizar o uso dos agentes.')
    }
  })

  // O botão "Atualizar" de uma conta: só a consulta dela, em vez de uma por conta.
  ipcMain.handle('agent-usage:refresh-account', async (_event, accountId) => {
    try {
      const id = requireString(accountId, 'ID da conta de agente inválido.')
      return await runManualRefresh(
        () => service.refreshAccount(id),
        { accountId: id },
      )
    } catch (error) {
      return usageErrorResult(error, 'Não foi possível atualizar esta conta.')
    }
  })

  // Abandona a rodada em andamento (encerra a consulta travada) e refaz do
  // zero: a saída que antes exigia reiniciar o app.
  ipcMain.handle('agent-usage:reconnect', async () => {
    try {
      return await runManualRefresh(() => service.reconnect())
    } catch (error) {
      return usageErrorResult(error, 'Não foi possível reconectar o monitor de uso.')
    }
  })

  ipcMain.handle('agent-usage:add-account', async (_event, params = {}) => {
    try {
      return await service.addAccount({
        providerId: requireString(params?.providerId, 'Provider de agente inválido.'),
        label: requireString(params?.label, 'Nome da conta de agente inválido.'),
        identityHint:
          params?.identityHint === undefined || params?.identityHint === null
            ? undefined
            : requireString(
                params.identityHint,
                'Identificador da conta de agente inválido.',
              ),
      })
    } catch (error) {
      return usageErrorResult(error, 'Não foi possível adicionar a conta de agente.')
    }
  })

  // A coleta do Claude altera ~/.claude/settings.json, que é configuração da
  // pessoa: só acontece por pedido explícito da interface.
  ipcMain.handle('agent-usage:claude-statusline-status', async () => {
    try {
      return { ok: true, ...statusline.status() }
    } catch (error) {
      return usageErrorResult(error, 'Não foi possível ler o estado da coleta.')
    }
  })

  ipcMain.handle('agent-usage:enable-claude-statusline', async () => {
    try {
      const result = statusline.install()
      return { ...result, ...statusline.status() }
    } catch (error) {
      return usageErrorResult(error, 'Não foi possível ligar a coleta do Claude.')
    }
  })

  ipcMain.handle('agent-usage:disable-claude-statusline', async () => {
    try {
      const result = statusline.uninstall()
      return { ...result, ...statusline.status() }
    } catch (error) {
      return usageErrorResult(error, 'Não foi possível desligar a coleta do Claude.')
    }
  })

  ipcMain.handle('agent-usage:remove-account', async (_event, accountId) => {
    try {
      return await service.removeAccount(
        requireString(accountId, 'ID da conta de agente inválido.'),
      )
    } catch (error) {
      return usageErrorResult(error, 'Não foi possível remover a conta de agente.')
    }
  })

  ipcMain.handle('agent-usage:consume-reset-credit', async (_event, params = {}) => {
    try {
      return await service.consumeResetCredit({
        accountId: requireString(
          params?.accountId,
          'ID da conta de agente inválido.',
        ),
        creditId: requireString(params?.creditId, 'ID do reset inválido.'),
      })
    } catch (error) {
      return usageErrorResult(error, 'Não foi possível usar o reset da conta.')
    }
  })

  // Mantém o fallback local atualizado assim que o arquivo muda, em vez de
  // esperar a interface perguntar. A atualização ao vivo principal continua
  // no refresh explícito do painel, que consulta o `/status` por conta/perfil.
  const watcher = createWatcher({
    claudeStatuslineDir: statuslineDir,
    onChange: async (providerId) => {
      try {
        const result = await service.refreshLocal(providerId)

        // Número novo vai sempre; leitura repetida (só o `measuredAt` avança) vai só com o
        // painel ou o modal visível, para a hora da medição e o selo de desatualizado
        // seguirem certos. Ao abrir, o painel relê o banco, que já tem a confirmação.
        if (!result || (result.kind === 'confirmed' && !scheduler.isConsumerVisible())) {
          return
        }

        const account = await service.describeAccount(result.accountId)
        const window = getMainWindow()
        if (!account || !window || window.isDestroyed?.()) {
          return
        }
        window.webContents?.send('agent-usage:account-changed', account)
      } catch {
        // Uma leitura que falhou não derruba o observador: o arquivo seguinte
        // volta a tentar.
      }
    },
  })

  watcher.start()

  function stopWatching() {
    watcher.stop()
    scheduler.stop()
    ipcMain.removeListener?.('agent-usage:scheduler-state', onSchedulerState)
    window?.removeListener?.('hide', onWindowHide)
    window?.removeListener?.('show', onWindowShow)
    window?.removeListener?.('minimize', onWindowHide)
    window?.removeListener?.('restore', onWindowShow)
    for (const [eventName, listener] of powerListeners) {
      powerMonitor?.removeListener?.(eventName, listener)
    }
  }

  return { stopWatching, scheduler }
}

function requireString(value, message) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(message)
  }
  return value.trim()
}

module.exports = {
  registerAgentUsageIpcHandlers,
}
