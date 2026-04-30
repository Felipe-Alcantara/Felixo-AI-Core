const { spawn: spawnChildProcess } = require('node:child_process')

const EXTRA_PATHS = [
  '/home/felipe/.nvm/versions/node/v25.9.0/bin',
  '/home/felipe/.npm-global/bin',
]

class CliProcessManager {
  constructor() {
    this.processes = new Map()
  }

  spawn(sessionId, command, args = [], cwd = process.cwd(), options = {}) {
    this.kill(sessionId)

    const childProcess = spawnChildProcess(command, args, {
      cwd,
      detached: process.platform !== 'win32',
      env: createCliEnv(),
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

function createCliEnv() {
  const pathParts = [
    ...EXTRA_PATHS,
    ...(process.env.PATH ?? '').split(':').filter(Boolean),
  ]
  const path = [...new Set(pathParts)].join(':')

  return {
    ...process.env,
    PATH: path,
  }
}

module.exports = {
  CliProcessManager,
  createCliEnv,
}
