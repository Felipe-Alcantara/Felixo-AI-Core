'use strict'

const path = require('node:path')
const { ipcMain } = require('electron')
const {
  createSettingsRepository,
} = require('./storage/settings-repository.cjs')
const {
  createSystemDesignRepository,
} = require('./storage/system-design-repository.cjs')
const {
  DEFAULT_BRANCH,
  DEFAULT_REPO_URL,
  syncSystemDesignRepository,
} = require('./system-design-service.cjs')
const { logQaEvent } = require('./qa-logger.cjs')

const SYSTEM_DESIGN_CONFIG_KEY = 'system-design.config'

function defaultConfig() {
  return {
    enabled: false,
    repoUrl: DEFAULT_REPO_URL,
    branch: DEFAULT_BRANCH,
    lastSha: null,
    lastSyncedAt: null,
    lastError: null,
  }
}

function normalizeConfig(value) {
  const base = defaultConfig()
  if (!value || typeof value !== 'object') {
    return base
  }
  return {
    enabled: value.enabled === true,
    repoUrl:
      typeof value.repoUrl === 'string' && value.repoUrl.trim()
        ? value.repoUrl.trim()
        : base.repoUrl,
    branch:
      typeof value.branch === 'string' && value.branch.trim()
        ? value.branch.trim()
        : base.branch,
    lastSha: typeof value.lastSha === 'string' ? value.lastSha : null,
    lastSyncedAt:
      typeof value.lastSyncedAt === 'string' ? value.lastSyncedAt : null,
    lastError: typeof value.lastError === 'string' ? value.lastError : null,
  }
}

function registerSystemDesignIpcHandlers(appPaths, options = {}) {
  const settingsRepository = createSettingsRepository(options.database)
  const systemDesignRepository = createSystemDesignRepository(options.database)
  const cacheDir = path.join(appPaths.config, 'system-design')

  function loadConfig() {
    const raw = settingsRepository.get(SYSTEM_DESIGN_CONFIG_KEY)
    return normalizeConfig(raw)
  }

  function saveConfig(config) {
    const normalized = normalizeConfig(config)
    settingsRepository.set(SYSTEM_DESIGN_CONFIG_KEY, normalized)
    return normalized
  }

  ipcMain.handle('system-design:get-config', () => {
    try {
      return { ok: true, config: loadConfig() }
    } catch (error) {
      return toErrorResult(error, 'Falha ao carregar configuracao do System Design.')
    }
  })

  ipcMain.handle('system-design:save-config', (_event, partial) => {
    try {
      const current = loadConfig()
      const next = saveConfig({ ...current, ...partial })
      return { ok: true, config: next }
    } catch (error) {
      return toErrorResult(error, 'Falha ao salvar configuracao do System Design.')
    }
  })

  ipcMain.handle('system-design:list-documents', () => {
    try {
      return { ok: true, documents: systemDesignRepository.list() }
    } catch (error) {
      return toErrorResult(error, 'Falha ao listar documentos do System Design.')
    }
  })

  ipcMain.handle('system-design:get-document', (_event, documentPath) => {
    try {
      const document = systemDesignRepository.get(documentPath)
      return document
        ? { ok: true, document }
        : { ok: false, message: 'Documento nao encontrado.' }
    } catch (error) {
      return toErrorResult(error, 'Falha ao carregar documento do System Design.')
    }
  })

  ipcMain.handle('system-design:sync', async () => {
    try {
      const current = loadConfig()
      const result = await syncSystemDesignRepository({
        repoUrl: current.repoUrl,
        branch: current.branch,
        cacheDir,
        repository: systemDesignRepository,
        logger: {
          warn: (message) =>
            logQaEvent({
              level: 'warn',
              scope: 'system-design:sync',
              message,
            }),
        },
      })
      const updatedConfig = saveConfig({
        ...current,
        lastSha: result.headSha,
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
      })
      logQaEvent({
        level: 'info',
        scope: 'system-design:sync',
        message: `Sincronizado ${result.indexedCount} doc(s) (sha=${result.headSha.slice(0, 7)}, removidos=${result.removedCount}).`,
      })
      return {
        ok: true,
        config: updatedConfig,
        indexedCount: result.indexedCount,
        removedCount: result.removedCount,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha desconhecida.'
      try {
        const current = loadConfig()
        saveConfig({ ...current, lastError: message })
      } catch {
        // ignore
      }
      logQaEvent({
        level: 'error',
        scope: 'system-design:sync',
        message: `Sync falhou: ${message}`,
      })
      return { ok: false, message }
    }
  })

  ipcMain.handle('system-design:reset-cache', () => {
    try {
      const cleared = systemDesignRepository.clear()
      const current = loadConfig()
      const updatedConfig = saveConfig({
        ...current,
        lastSha: null,
        lastSyncedAt: null,
      })
      return { ok: true, cleared, config: updatedConfig }
    } catch (error) {
      return toErrorResult(error, 'Falha ao limpar cache do System Design.')
    }
  })
}

function toErrorResult(error, fallbackMessage) {
  return {
    ok: false,
    message: error instanceof Error ? error.message : fallbackMessage,
  }
}

module.exports = {
  registerSystemDesignIpcHandlers,
  SYSTEM_DESIGN_CONFIG_KEY,
  defaultConfig: defaultConfig,
  normalizeConfig,
}
