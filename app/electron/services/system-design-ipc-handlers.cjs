'use strict'

const path = require('node:path')
const { ipcMain } = require('electron')
const {
  createSettingsRepository,
} = require('./storage/settings-repository.cjs')
const {
  createSystemDesignRepository,
} = require('./storage/system-design-repository.cjs')
const { syncSystemDesignRepository } = require('./system-design-service.cjs')
const {
  applyConfigChange,
  migrateStoredConfig,
  recordClearedCache,
  recordFailedSync,
  recordSuccessfulSync,
  resolveConfiguredSource,
  toPublicConfig,
} = require('../core/system-design-source.cjs')
const { logQaEvent } = require('./qa-logger.cjs')
const { toErrorResult } = require('./ipc-result.cjs')
const {
  createRedactedGitError,
  sanitizeGitErrorText,
} = require('./git-secret-redaction.cjs')

const SYSTEM_DESIGN_CONFIG_KEY = 'system-design.config'

/**
 * Forma que o renderer lê quando nada foi gravado. O default vive em
 * `core/system-design-source.cjs` — aqui não há mais cópia dele.
 */
function defaultConfig() {
  return toPublicConfig(migrateStoredConfig(null))
}

/** Lê qualquer coisa gravada (v1 legado, v2 ou lixo) na forma que o renderer lê. */
function normalizeConfig(value) {
  return toPublicConfig(migrateStoredConfig(value))
}

function registerSystemDesignIpcHandlers(appPaths, options = {}) {
  const activeIpcMain = options.ipcMain ?? ipcMain
  const syncRepository =
    options.syncSystemDesignRepository ?? syncSystemDesignRepository
  const settingsRepository = createSettingsRepository(options.database)
  const systemDesignRepository = createSystemDesignRepository(options.database)
  const cacheDir = path.join(appPaths.config, 'system-design')

  /**
   * Lê o que está gravado já na forma v2.
   *
   * A migração do v1 é gravada de volta na primeira leitura (é idempotente):
   * além de sanear credenciais que uma versão anterior possa ter deixado, ela
   * marca de uma vez quem segue o padrão e quem escolheu uma fonte, antes que
   * qualquer mudança de default do app possa reinterpretar o v1.
   */
  function loadStored() {
    const raw = settingsRepository.get(SYSTEM_DESIGN_CONFIG_KEY)
    const stored = migrateStoredConfig(raw)

    if (raw && typeof raw === 'object' && JSON.stringify(raw) !== JSON.stringify(stored)) {
      settingsRepository.set(SYSTEM_DESIGN_CONFIG_KEY, stored)
    }

    return stored
  }

  function saveStored(stored) {
    settingsRepository.set(SYSTEM_DESIGN_CONFIG_KEY, stored)
    return stored
  }

  function loadConfig() {
    return toPublicConfig(loadStored())
  }

  activeIpcMain.handle('system-design:get-config', () => {
    try {
      return { ok: true, config: loadConfig() }
    } catch (error) {
      return toErrorResult(error, 'Falha ao carregar configuracao do System Design.')
    }
  })

  activeIpcMain.handle('system-design:save-config', (_event, partial) => {
    try {
      const change = applyConfigChange(loadStored(), partial)
      if (!change.ok) {
        return { ok: false, message: change.message }
      }

      return { ok: true, config: toPublicConfig(saveStored(change.stored)) }
    } catch (error) {
      return toErrorResult(error, 'Falha ao salvar configuracao do System Design.')
    }
  })

  activeIpcMain.handle('system-design:list-documents', () => {
    try {
      return { ok: true, documents: systemDesignRepository.list() }
    } catch (error) {
      return toErrorResult(error, 'Falha ao listar documentos do System Design.')
    }
  })

  activeIpcMain.handle('system-design:get-document', (_event, documentPath) => {
    try {
      const document = systemDesignRepository.get(documentPath)
      return document
        ? { ok: true, document }
        : { ok: false, message: 'Documento nao encontrado.' }
    } catch (error) {
      return toErrorResult(error, 'Falha ao carregar documento do System Design.')
    }
  })

  activeIpcMain.handle('system-design:sync', async () => {
    // A fonte usada é a de AGORA; se a pessoa mudar a configuração durante o
    // clone (leva até um minuto), a entrega é registrada com a fonte que de
    // fato foi sincronizada, não com a que estiver gravada quando terminar.
    let source = null

    try {
      source = resolveConfiguredSource(loadStored())
      const result = await syncRepository({
        repoUrl: source.repoUrl,
        branch: source.branch,
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
      const updatedConfig = toPublicConfig(
        saveStored(
          recordSuccessfulSync(loadStored(), {
            repoUrl: source.repoUrl,
            branch: source.branch,
            sha: result.headSha,
            syncedAt: new Date().toISOString(),
          }),
        ),
      )
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
      const message = error?.isRedactedGitError
        ? sanitizeGitErrorText(error.message)
        : createRedactedGitError(error, {
            stage: error?.stage ?? 'sincronização',
            repoUrl: source?.repoUrl,
            branch: source?.branch,
          }).message
      try {
        saveStored(recordFailedSync(loadStored(), message))
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

  activeIpcMain.handle('system-design:reset-cache', () => {
    try {
      const cleared = systemDesignRepository.clear()
      const updatedConfig = toPublicConfig(saveStored(recordClearedCache(loadStored())))
      return { ok: true, cleared, config: updatedConfig }
    } catch (error) {
      return toErrorResult(error, 'Falha ao limpar cache do System Design.')
    }
  })
}

module.exports = {
  registerSystemDesignIpcHandlers,
  SYSTEM_DESIGN_CONFIG_KEY,
  defaultConfig: defaultConfig,
  normalizeConfig,
}
