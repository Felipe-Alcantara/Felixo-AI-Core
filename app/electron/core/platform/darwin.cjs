/**
 * @module platform/darwin
 * macOS platform adapter.
 */

const os = require('node:os')
const path = require('node:path')
const base = require('./base.cjs')

/** @returns {string} */
function getDefaultShell(env) {
  return env.SHELL || '/bin/zsh'
}

/** @returns {object} */
function getPlatformInfo() {
  return {
    defaultShell: '/bin/zsh',
    pathSeparator: ':',
    supportsProcessGroups: true,
    supportsAnsiColors: true,
    notes: [
      'Zsh is the default shell since macOS Catalina.',
      'Gatekeeper may block unsigned apps.',
      'Homebrew installs to /opt/homebrew on Apple Silicon.',
    ],
  }
}

/** @returns {string[]} */
function getSystemCliPaths() {
  return ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']
}

/** @returns {string} */
function getCacheBase() {
  return path.join(os.homedir(), 'Library', 'Caches')
}

/**
 * Build a terminal launch plan using macOS Terminal.app via osascript.
 */
function createTerminalLaunchPlan({ command, args, cwd }) {
  const commandLine = createShellCommandLine(command, args, cwd)
  return {
    ok: true,
    command: 'osascript',
    args: [
      '-e',
      `tell application "Terminal" to do script ${JSON.stringify(commandLine)}`,
    ],
  }
}

function createShellCommandLine(command, args, cwd) {
  const cd = `cd ${base.escapeArg(cwd)}`
  const commandLine = [command, ...args]
    .map((arg) => base.escapeArg(String(arg)))
    .join(' ')

  return `${cd} && ${commandLine}`
}

module.exports = {
  ...base,
  name: 'darwin',
  createTerminalLaunchPlan,
  getCacheBase,
  getDefaultShell,
  getPlatformInfo,
  getSystemCliPaths,
}
