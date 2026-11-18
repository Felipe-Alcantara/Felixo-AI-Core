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
const {
  createAgentUsageSessionCapture,
} = require('./agent-usage-session-capture.cjs')
const { scanClaudeUsage, loadPricing, parsePricing } = require('./claude-usage-history.cjs')
const { createAiPricingCatalog, toCostPricing } = require('./ai-pricing.cjs')

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
  createSessionCapture = createAgentUsageSessionCapture,
  createScheduler = createAgentUsageRefreshScheduler,
  getActiveSessions = () => [],
  powerMonitor = null,
  onSchedulerMetrics = () => {},
  getClaudeRoots = () => [],
  claudePricingFile = path.join(getAppPaths().userData, 'claude-pricing.json'),
  aiPricing = createAiPricingCatalog({ rateCacheFile: path.join(getAppPaths().userData, 'ai-pricing-rate.json') }),
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

  // Número novo vai sempre; leitura repetida (só o `measuredAt` avança) vai só com o painel ou o
  // modal visível, para a hora da medição e o selo de desatualizado seguirem certos. Ao abrir, o
  // painel relê o banco, que já tem a confirmação.
  async function notifyAccountChanged(result) {
    if (!result || (result.kind === 'confirmed' && !scheduler.isConsumerVisible())) {
      return
    }

    const account = await service.describeAccount(result.accountId)
    const window = getMainWindow()
    if (!account || !window || window.isDestroyed?.()) {
      return
    }
    window.webContents?.send('agent-usage:account-changed', account)
  }

  // Mantém o fallback local atualizado assim que o arquivo muda, em vez de
  // esperar a interface perguntar. A atualização ao vivo principal continua
  // no refresh explícito do painel, que consulta o `/status` por conta/perfil.
  const watcher = createWatcher({
    claudeStatuslineDir: statuslineDir,
    onChange: async (providerId) => {
      try {
        await notifyAccountChanged(await service.refreshLocal(providerId))
      } catch {
        // Uma leitura que falhou não derruba o observador: o arquivo seguinte
        // volta a tentar.
      }
    },
  })

  // Consumo por terminal (Claude): a janela da conta vai para a conta do terminal; o consumo da
  // sessão fica em memória e sai ao renderer em lote (no máximo um por segundo, o passo do poll).
  const sessionCapture = createSessionCapture({
    sessionsDir: statusline.sessionsDir ?? path.join(statuslineDir, 'sessions'),
    listSessions: getActiveSessions,
    recordWindows: async (reading) => {
      await notifyAccountChanged(
        await service.refreshLocal(reading.providerId, {
          accountId: reading.accountId,
          reading: {
            ok: true,
            collectedAt: reading.measuredAt,
            metrics: reading.accountWindows,
            identity: null,
          },
        }),
      )
    },
    onChanged: (batch) => {
      const window = getMainWindow()
      if (!window || window.isDestroyed?.()) return
      window.webContents?.send('agent-usage:session-changed', batch)
    },
  })

  ipcMain.handle('agent-usage:sessions', () => sessionCapture.list())

  // Custo equivalente por dia, projeto e modelo, lido das conversas locais. Preço: o arquivo do
  // usuário, se existir, manda; senão a tabela de preços (online ou a embutida).
  ipcMain.handle('agent-usage:claude-cost-history', async (_event, params = {}) => {
    try {
      const days = Number.isFinite(params?.days) ? Math.min(Math.max(Math.trunc(params.days), 1), 400) : 30
      const sinceMs = Date.now() - days * 86400000
      let pricing = loadPricing(claudePricingFile)
      if (!pricing) {
        const { table, origin } = await aiPricing.get()
        pricing = table ? parsePricing(toCostPricing(table, origin)) : null
      }
      const history = await scanClaudeUsage({ roots: getClaudeRoots(), pricing, sinceMs })
      return { ok: true, ...history }
    } catch (error) {
      return usageErrorResult(error, 'Não foi possível ler o histórico de custo do Claude.')
    }
  })

  // Tabela de preços de modelos e assinaturas, com a cotação do dólar e do yuan; `force` ignora o cache de 1 hora.
  ipcMain.handle('agent-usage:ai-pricing', async (_event, params = {}) => {
    try {
      return { ok: true, ...(await aiPricing.get({ force: params?.force === true })) }
    } catch (error) {
      return usageErrorResult(error, 'Não foi possível ler a tabela de preços.')
    }
  })

  watcher.start()
  sessionCapture.start()

  function stopWatching() {
    watcher.stop()
    sessionCapture.stop()
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
