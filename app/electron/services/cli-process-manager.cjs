const spawnChildProcess = require('cross-spawn')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const CLI_PATHS_ENV_KEY = 'FELIXO_CLI_PATHS'

class CliProcessManager {
  constructor() {
    this.processes = new Map()
  }

  spawn(sessionId, command, args = [], cwd = process.cwd(), options = {}) {
    this.kill(sessionId)
    const env = createCliEnv()

    const childProcess = spawnChildProcess(command, args, {
      cwd,
      detached: process.platform !== 'win32',
      env,
      stdio: [options.openStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    const entry = {
      childProcess,
      killTimer: null,
    }

    this.processes.set(sessionId, entry)

    childProcess.once('exit', () => this.cleanup(sessionId, childProcess))
    childProcess.once('close', () => this.cleanup(sessionId, childProcess))

    return childProcess
  }

  get(sessionId) {
    const childProcess = this.processes.get(sessionId)?.childProcess

    if (!childProcess || childProcess.exitCode !== null) {
      return null
    }

    return childProcess
  }

  has(sessionId) {
    return Boolean(this.get(sessionId))
  }

  write(sessionId, input) {
    const entry = this.processes.get(sessionId)
    const stdin = entry?.childProcess?.stdin

    if (!stdin || stdin.destroyed || stdin.writableEnded) {
      return false
    }

    stdin.write(input)
    return true
  }

  kill(sessionId, options = {}) {
    const entry = this.processes.get(sessionId)

    if (!entry) {
      return false
    }

    const { childProcess } = entry

    if (childProcess.exitCode !== null) {
      this.cleanup(sessionId, childProcess)
      return true
    }

    const signal = options.force ? 'SIGKILL' : 'SIGTERM'

    if (!childProcess.killed || options.force) {
      signalChildProcess(childProcess, signal)
    }

    if (options.force) {
      this.cleanup(sessionId, childProcess)
      return true
    }

    if (!entry.killTimer) {
      entry.killTimer = setTimeout(() => {
        if (childProcess.exitCode === null) {
          signalChildProcess(childProcess, 'SIGKILL')
        }
      }, 5000)
    }

    return true
  }

  killAll(options = {}) {
    for (const sessionId of this.processes.keys()) {
      this.kill(sessionId, options)
    }
  }

  cleanup(sessionId, childProcess) {
    const entry = this.processes.get(sessionId)

    if (!entry || entry.childProcess !== childProcess) {
      return
    }

    if (entry.killTimer) {
      clearTimeout(entry.killTimer)
    }

    this.processes.delete(sessionId)
  }
}

function signalChildProcess(childProcess, signal) {
  if (process.platform === 'win32' || !childProcess.pid) {
    return childProcess.kill(signal)
  }

  try {
    process.kill(-childProcess.pid, signal)
    return true
  } catch (error) {
    if (error?.code === 'ESRCH') {
      return childProcess.kill(signal)
    }

    throw error
  }
}

function createCliEnv(baseEnv = process.env) {
  const pathKey = getPathEnvKey(baseEnv)
  const configuredPaths = getConfiguredCliPaths(baseEnv)
  const userPaths = getUserCliPathCandidates(baseEnv)
  const pathParts = [
    ...configuredPaths,
    ...userPaths,
    ...(baseEnv[pathKey] ?? '').split(path.delimiter).filter(Boolean),
  ]
  const nextEnv = { ...baseEnv }
  const nextPath = uniqueExistingPathParts(pathParts).join(path.delimiter)

  nextEnv[pathKey] = nextPath

  if (pathKey !== 'PATH' && !Object.prototype.hasOwnProperty.call(nextEnv, 'PATH')) {
    nextEnv.PATH = nextPath
  }

  return nextEnv
}

function getPathEnvKey(env) {
  return Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
}

function getConfiguredCliPaths(env) {
  return splitPathList(env[CLI_PATHS_ENV_KEY])
}

function getUserCliPathCandidates(env) {
  const home = env.HOME || env.USERPROFILE || os.homedir()

  if (!home) {
    return getSystemCliPathCandidates()
  }

  if (process.platform === 'win32') {
    return [
      env.APPDATA ? path.join(env.APPDATA, 'npm') : null,
      env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Programs', 'nodejs') : null,
      path.join(home, 'AppData', 'Roaming', 'npm'),
      ...getSystemCliPathCandidates(),
    ]
  }

  return [
    path.join(home, '.local', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.volta', 'bin'),
    path.join(home, '.asdf', 'shims'),
    ...getNvmNodeBinCandidates(path.join(home, '.nvm', 'versions', 'node')),
    ...getSystemCliPathCandidates(),
  ]
}

function getSystemCliPathCandidates() {
  if (process.platform === 'darwin') {
    return ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']
  }

  if (process.platform === 'win32') {
    return [
      'C:\\Program Files\\nodejs',
      'C:\\Program Files (x86)\\nodejs',
    ]
  }

  return ['/usr/local/bin', '/usr/bin', '/bin']
}

function getNvmNodeBinCandidates(nodeVersionsPath) {
  try {
    return fs
      .readdirSync(nodeVersionsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(nodeVersionsPath, entry.name, 'bin'))
      .filter((candidate) => directoryExists(candidate))
      .sort()
      .reverse()
  } catch {
    return []
  }
}

function splitPathList(value) {
  return String(value ?? '')
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean)
}

function uniqueExistingPathParts(pathParts) {
  const seen = new Set()
  const uniqueParts = []

  for (const pathPart of pathParts) {
    if (!pathPart || seen.has(pathPart)) {
      continue
    }

    seen.add(pathPart)

    if (directoryExists(pathPart)) {
      uniqueParts.push(pathPart)
    }
  }

  return uniqueParts
}

function directoryExists(candidate) {
  try {
    return fs.statSync(candidate).isDirectory()
  } catch {
    return false
  }
}

module.exports = {
  CliProcessManager,
  createCliEnv,
}
