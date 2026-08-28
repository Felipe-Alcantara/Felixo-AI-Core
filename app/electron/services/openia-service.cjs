/**
 * Ponte mínima entre o Felixo e o Openia.
 *
 * O registro de interfaces e o catálogo de modelos continuam no Openia. Este
 * serviço só chama os contratos JSON públicos e redige a saída antes de ela
 * atravessar o IPC. A chave tem um caminho separado: entra no processo do
 * Openia pelo stdin de `key set-stdin` e nunca vira argumento, log ou dado do
 * canvas.
 */

const os = require('node:os')
const { ipcMain } = require('electron')
const spawnChildProcess = require('cross-spawn')
const { createCliEnv } = require('./cli-process-manager.cjs')
const { resolveCommandPath } = require('../core/cli-detector.cjs')

const COMMAND_TIMEOUT_MS = 30_000
const OUTPUT_LIMIT = 12000
const DEFAULT_KEY_NAME = 'felixo'

/**
 * @param {object} [dependencies]
 * @param {(args: string[], options?: { input?: string, timeoutMs?: number }) => Promise<object>} [dependencies.runCommand]
 */
function createOpeniaService({ runCommand = runOpeniaCommand } = {}) {
  return {
    listInterfaces: () => listOpeniaInterfaces(runCommand),
    listModels: (options = {}) => listOpeniaModels(runCommand, options),
    keyStatus: () => getOpeniaKeyStatus(runCommand),
    setKey: (params = {}) => setOpeniaKey(runCommand, params),
  }
}

/**
 * Register the renderer-facing Openia API.
 *
 * @param {object} [dependencies]
 * @param {ReturnType<typeof createOpeniaService>} [dependencies.service]
 */
function registerOpeniaIpcHandlers({ service = createOpeniaService() } = {}) {
  ipcMain.handle('openia:list-interfaces', () => service.listInterfaces())
  ipcMain.handle('openia:list-models', (_event, params = {}) => service.listModels(params))
  ipcMain.handle('openia:key-status', () => service.keyStatus())
  ipcMain.handle('openia:set-key', (_event, params = {}) => service.setKey(params))
}

async function listOpeniaInterfaces(runCommand = runOpeniaCommand) {
  const payload = await readJsonContract(
    runCommand,
    ['list', '--json'],
    'Não foi possível carregar as interfaces do Openia.',
  )
  if (!payload.ok) return payload

  const interfaces = Array.isArray(payload.data?.interfaces)
    ? payload.data.interfaces.map(sanitizeInterface).filter(Boolean)
    : []
  return { ok: true, interfaces }
}

async function listOpeniaModels(
  runCommand = runOpeniaCommand,
  { refresh = false } = {},
) {
  const payload = await readJsonContract(
    runCommand,
    ['models', '--json', ...(refresh === true ? ['--refresh'] : [])],
    'Não foi possível carregar os modelos do OpenRouter.',
  )
  if (!payload.ok) return payload

  const models = Array.isArray(payload.data?.models)
    ? payload.data.models.map(sanitizeModel).filter(Boolean)
    : []
  return { ok: true, models }
}

async function getOpeniaKeyStatus(runCommand = runOpeniaCommand) {
  const payload = await readJsonContract(
    runCommand,
    ['key', 'status', '--json'],
    'Não foi possível consultar a configuração do Openia.',
  )
  if (!payload.ok) return payload

  return {
    ok: true,
    configured: payload.data?.configured === true,
    active: sanitizeString(payload.data?.active, 80) || null,
  }
}

async function setOpeniaKey(
  runCommand = runOpeniaCommand,
  { name = DEFAULT_KEY_NAME, key } = {},
) {
  const normalizedName = sanitizeString(name, 40)
  const normalizedKey = typeof key === 'string' ? key.trim() : ''

  if (!normalizedName || !normalizedKey) {
    return {
      ok: false,
      message: 'Informe um nome e uma chave do OpenRouter.',
    }
  }

  let result
  try {
    result = await runCommand(
      ['key', 'set-stdin', normalizedName, '--json'],
      { input: normalizedKey, timeoutMs: COMMAND_TIMEOUT_MS },
    )
  } catch {
    result = { ok: false }
  }

  // Deliberadamente não devolve stdout/stderr: uma versão incompatível ou uma
  // CLI adulterada não pode ecoar a chave de volta para o renderer.
  if (!result?.ok) {
    return {
      ok: false,
      message: 'Não foi possível salvar a chave no Openia. Verifique o Openia e tente novamente.',
    }
  }

  return { ok: true, configured: true }
}

async function readJsonContract(runCommand, args, errorMessage) {
  let result
  try {
    result = await runCommand(args, { timeoutMs: COMMAND_TIMEOUT_MS })
  } catch {
    return { ok: false, message: errorMessage }
  }

  if (!result?.ok) {
    return { ok: false, message: errorMessage }
  }

  try {
    return { ok: true, data: JSON.parse(String(result.stdout ?? '').trim()) }
  } catch {
    return { ok: false, message: errorMessage }
  }
}

function sanitizeInterface(value) {
  if (!value || typeof value !== 'object') return null
  const key = sanitizeString(value.key, 80)
  const name = sanitizeString(value.name, 120)
  if (!key || !name) return null

  return {
    key,
    name,
    description: sanitizeString(value.description, 500),
    ecosystem: sanitizeString(value.ecosystem, 30),
    command: sanitizeString(value.command, 120),
    homepage: sanitizeString(value.homepage, 500),
    modelPrefix: sanitizeString(value.modelPrefix, 80),
    supportsModelSelection: value.supportsModelSelection === true,
    modelSelection: value.modelSelection === 'automatic' ? 'automatic' : 'inside',
    supportsSubscription: value.supportsSubscription === true,
    isCodeAgent: value.isCodeAgent === true,
    emoji: sanitizeString(value.emoji, 20),
  }
}

function sanitizeModel(value) {
  if (!value || typeof value !== 'object') return null
  const id = sanitizeString(value.id, 300)
  if (!id) return null

  const completionPrice = Number(value.completionPrice)
  return {
    id,
    vendor: sanitizeString(value.vendor, 120) || id.split('/', 1)[0],
    name: sanitizeString(value.name, 300) || id,
    completionPrice: Number.isFinite(completionPrice) && completionPrice >= 0
      ? completionPrice
      : 0,
  }
}

function sanitizeString(value, maxLength) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

function runOpeniaCommand(args, { input, timeoutMs = COMMAND_TIMEOUT_MS } = {}) {
  const env = createCliEnv()
  const executable = resolveCommandPath('openia', env, { platform: process.platform }) || 'openia'
  const stdio = input === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe']

  return new Promise((resolve) => {
    let childProcess
    try {
      childProcess = spawnChildProcess(executable, args, {
        cwd: os.homedir(),
        env,
        stdio,
        windowsHide: true,
        ...(process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(executable)
          ? { shell: true }
          : {}),
      })
    } catch {
      resolve({ ok: false })
      return
    }

    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      childProcess.kill('SIGTERM')
      resolve({ ok: false })
    }, timeoutMs)

    childProcess.stdout?.setEncoding('utf8')
    childProcess.stdout?.on('data', (chunk) => {
      stdout = appendLimited(stdout, chunk)
    })
    childProcess.stderr?.setEncoding('utf8')
    childProcess.stderr?.on('data', (chunk) => {
      stderr = appendLimited(stderr, chunk)
    })

    if (input !== undefined && childProcess.stdin) {
      childProcess.stdin.end(input)
    }

    const finish = (ok) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ok, stdout, stderr })
    }

    childProcess.once('error', () => finish(false))
    childProcess.once('close', (code) => finish(code === 0))
  })
}

function appendLimited(current, chunk) {
  return `${current}${chunk}`.slice(-OUTPUT_LIMIT)
}

module.exports = {
  COMMAND_TIMEOUT_MS,
  DEFAULT_KEY_NAME,
  createOpeniaService,
  getOpeniaKeyStatus,
  listOpeniaInterfaces,
  listOpeniaModels,
  registerOpeniaIpcHandlers,
  runOpeniaCommand,
  sanitizeInterface,
  sanitizeModel,
  setOpeniaKey,
}
