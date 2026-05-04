const fs = require('node:fs/promises')
const path = require('node:path')
const {
  createSettingsRepository,
} = require('./storage/settings-repository.cjs')

const ORCHESTRATOR_SETTINGS_FILE = 'orchestrator-settings.json'
const ORCHESTRATOR_SETTINGS_KEY = 'orchestrator.settings'
const MAX_SETTINGS_BYTES = 256 * 1024

function createOrchestratorSettingsStore(options) {
  const configDir = requireConfigDir(options?.configDir)
  const filePath = path.join(configDir, ORCHESTRATOR_SETTINGS_FILE)
  const settingsRepository = options?.database
    ? createSettingsRepository(options.database)
    : null

  return {
    filePath,
    async load() {
      if (settingsRepository) {
        const settings = settingsRepository.get(ORCHESTRATOR_SETTINGS_KEY)

        if (settings !== null) {
          return normalizeSettingsPayload(settings)
        }

        const legacySettings = await loadOrchestratorSettingsFile(filePath)

        if (legacySettings) {
          settingsRepository.set(ORCHESTRATOR_SETTINGS_KEY, legacySettings)
          return legacySettings
        }

        return null
      }

      return loadOrchestratorSettingsFile(filePath)
    },
    async save(settings) {
      if (settingsRepository) {
        return settingsRepository.set(
          ORCHESTRATOR_SETTINGS_KEY,
          normalizeSettingsPayload(settings),
        )
      }

      return saveOrchestratorSettingsFile(filePath, settings)
    },
  }
}

async function loadOrchestratorSettingsFile(filePath) {
  try {
    const rawSettings = await fs.readFile(filePath, 'utf8')
    const parsedSettings = JSON.parse(rawSettings)

    if (!isPlainObject(parsedSettings)) {
      throw new Error('Arquivo de configuracoes do orquestrador invalido.')
    }

    return parsedSettings
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null
    }

    throw error
  }
}

async function saveOrchestratorSettingsFile(filePath, settings) {
  const payload = normalizeSettingsPayload(settings)
  const serializedPayload = `${JSON.stringify(payload, null, 2)}\n`
  const tempPath = `${filePath}.${process.pid}.tmp`

  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(tempPath, serializedPayload, 'utf8')
  await fs.rename(tempPath, filePath)

  return payload
}

function normalizeSettingsPayload(settings) {
  if (!isPlainObject(settings)) {
    throw new Error('Configuracoes do orquestrador devem ser um objeto.')
  }

  const serializedSettings = JSON.stringify(settings)

  if (Buffer.byteLength(serializedSettings, 'utf8') > MAX_SETTINGS_BYTES) {
    throw new Error('Configuracoes do orquestrador excedem o limite permitido.')
  }

  return JSON.parse(serializedSettings)
}

function requireConfigDir(configDir) {
  if (typeof configDir !== 'string' || !configDir.trim()) {
    throw new Error('Diretorio de configuracao invalido.')
  }

  return configDir
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

module.exports = {
  ORCHESTRATOR_SETTINGS_FILE,
  ORCHESTRATOR_SETTINGS_KEY,
  createOrchestratorSettingsStore,
  loadOrchestratorSettingsFile,
  normalizeSettingsPayload,
  saveOrchestratorSettingsFile,
}
