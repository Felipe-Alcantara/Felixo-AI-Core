'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const GRAPHICS_MODES = Object.freeze(['auto', 'hardware', 'software'])
const GRAPHICS_MODE_ENV = 'FELIXO_GRAPHICS_MODE'
const GRAPHICS_MODE_ARG = '--felixo-graphics-mode'
const GRAPHICS_MODE_FILE = 'graphics-mode.json'
const LOW_END_MEMORY_BYTES = 4 * 1024 * 1024 * 1024

/**
 * A aceleração precisa ser decidida antes de `app.whenReady()`: depois que o
 * processo Chromium já criou o serviço de GPU, `disable-gpu` não é uma
 * recuperação confiável para a janela existente.
 */
function resolveGraphicsProfile({
  argv = process.argv,
  environment = process.env,
  userDataPath,
  platformName = process.platform,
  totalMemoryBytes = os.totalmem(),
  cpuCount = os.cpus().length,
  fileSystem = fs,
} = {}) {
  const persistedMode = readPersistedGraphicsMode(userDataPath, fileSystem)
  const cliMode = readModeFromArgv(argv)
  const envMode = normalizeGraphicsMode(environment?.[GRAPHICS_MODE_ENV])
  const mode = cliMode ?? envMode ?? persistedMode ?? 'auto'
  const automaticLowEnd =
    mode === 'auto' &&
    platformName === 'win32' &&
    Number.isFinite(totalMemoryBytes) &&
    totalMemoryBytes > 0 &&
    totalMemoryBytes <= LOW_END_MEMORY_BYTES

  return {
    mode,
    useSoftwareRendering: mode === 'software' || automaticLowEnd,
    automatic: mode === 'auto',
    automaticLowEnd,
    reason: automaticLowEnd
      ? 'windows-low-memory'
      : mode === 'software'
        ? 'manual-software'
        : mode === 'hardware'
          ? 'manual-hardware'
          : 'hardware-default',
    platform: platformName,
    totalMemoryBytes: normalizePositiveInteger(totalMemoryBytes),
    cpuCount: normalizePositiveInteger(cpuCount),
    persistedMode,
    source: cliMode ? 'cli' : envMode ? 'environment' : persistedMode ? 'profile' : 'default',
  }
}

function normalizeGraphicsMode(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return GRAPHICS_MODES.includes(normalized) ? normalized : null
}

function readModeFromArgv(argv = []) {
  for (const argument of argv) {
    if (typeof argument !== 'string') continue

    const prefix = `${GRAPHICS_MODE_ARG}=`
    if (argument.startsWith(prefix)) {
      return normalizeGraphicsMode(argument.slice(prefix.length))
    }
  }

  return null
}

function getGraphicsModePath(userDataPath) {
  if (typeof userDataPath !== 'string' || !userDataPath.trim()) {
    return null
  }

  return path.join(userDataPath, GRAPHICS_MODE_FILE)
}

function readPersistedGraphicsMode(userDataPath, fileSystem = fs) {
  const filePath = getGraphicsModePath(userDataPath)
  if (!filePath) return null

  try {
    const payload = JSON.parse(fileSystem.readFileSync(filePath, 'utf8'))
    return normalizeGraphicsMode(payload?.mode)
  } catch {
    return null
  }
}

function persistGraphicsMode({ userDataPath, mode, fileSystem = fs } = {}) {
  const normalizedMode = normalizeGraphicsMode(mode)
  if (!normalizedMode) {
    throw new Error(`Modo gráfico inválido. Use: ${GRAPHICS_MODES.join(', ')}.`)
  }

  const filePath = getGraphicsModePath(userDataPath)
  if (!filePath) {
    throw new Error('Pasta de dados do app indisponível.')
  }

  fileSystem.mkdirSync(path.dirname(filePath), { recursive: true })
  fileSystem.writeFileSync(
    filePath,
    `${JSON.stringify({ mode: normalizedMode }, null, 2)}\n`,
    'utf8',
  )

  return normalizedMode
}

function normalizePositiveInteger(value) {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null
}

module.exports = {
  GRAPHICS_MODE_ARG,
  GRAPHICS_MODE_ENV,
  GRAPHICS_MODE_FILE,
  GRAPHICS_MODES,
  LOW_END_MEMORY_BYTES,
  getGraphicsModePath,
  normalizeGraphicsMode,
  persistGraphicsMode,
  readModeFromArgv,
  readPersistedGraphicsMode,
  resolveGraphicsProfile,
}
