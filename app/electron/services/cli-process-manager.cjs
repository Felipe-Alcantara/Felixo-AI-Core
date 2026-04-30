const { spawn: spawnChildProcess } = require('node:child_process')

const EXTRA_PATHS = [
  '/home/felipe/.nvm/versions/node/v25.9.0/bin',
  '/home/felipe/.npm-global/bin',
]

class CliProcessManager {
  constructor() {
    this.processes = new Map()
  }

  spawn(sessionId, command, args = [], cwd = process.cwd()) {
    this.kill(sessionId)

    const childProcess = spawnChildProcess(command, args, {
      cwd,
      env: createCliEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
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

  write(sessionId, input) {
    const entry = this.processes.get(sessionId)
    const stdin = entry?.childProcess?.stdin

    if (!stdin || stdin.destroyed || stdin.writableEnded) {
      return false
    }

    stdin.write(input)
    return true
  }

  kill(sessionId) {
    const entry = this.processes.get(sessionId)

    if (!entry) {
      return false
    }

    const { childProcess } = entry

    if (childProcess.exitCode !== null) {
      this.cleanup(sessionId, childProcess)
      return true
    }

    if (!childProcess.killed) {
      childProcess.kill('SIGTERM')
    }

    if (!entry.killTimer) {
      entry.killTimer = setTimeout(() => {
        if (childProcess.exitCode === null) {
          childProcess.kill('SIGKILL')
        }
      }, 5000)
    }

    return true
  }

  killAll() {
    for (const sessionId of this.processes.keys()) {
      this.kill(sessionId)
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
