/**
 * @module platform/win32
 * Windows platform adapter.
 */

const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')

/** @returns {string} */
function getDefaultShell(env) {
  return findPowerShell(env) || 'cmd.exe'
}

/** @returns {string[]} */
function getShellArgs(shell) {
  const lower = shell.toLowerCase()
  if (lower.includes('powershell') || lower.includes('pwsh')) {
    return ['-NoProfile', '-NonInteractive', '-Command']
  }

  return ['/d', '/s', '/c']
}

/** @returns {string} */
function escapeArg(arg) {
  if (!arg) return '""'

  if (/[" &|<>^%]/.test(arg)) {
    return `"${arg.replace(/"/g, '\\"')}"`
  }

  return arg
}

/** @returns {{ signal: string, canKillGroup: boolean, notes: string }} */
function getTerminationStrategy() {
  return {
    signal: 'SIGTERM',
    canKillGroup: false,
    notes: 'Windows uses TerminateProcess. No process group kill available via Node.js signals.',
  }
}

/** @returns {object} */
function getPlatformInfo() {
  return {
    defaultShell: 'cmd.exe',
    pathSeparator: ';',
    supportsProcessGroups: false,
    supportsAnsiColors: true,
    notes: [
      'CMD uses different quoting rules.',
      'PowerShell is recommended over CMD.',
      'Process group termination requires alternative approach.',
      'PATH uses semicolon separator.',
      'CLIs may use .exe, .cmd, or .ps1 extensions.',
    ],
  }
}

/** @returns {boolean} */
function shouldDetachProcess() {
  return false
}

/**
 * On Windows, process group kill is not available via Node.js signals.
 * Falls back to childProcess.kill() directly.
 */
function killProcess(childProcess, signal) {
  return childProcess.kill(signal)
}

/** @returns {string[]} */
function getSystemCliPaths() {
  const candidates = []
  const env = process.env

  for (const baseName of ['ProgramFiles', 'ProgramFiles(x86)']) {
    const base = env[baseName]
    if (base) {
      candidates.push(path.join(base, 'nodejs'))
    }
  }

  return candidates
}

/**
 * @param {string} home
 * @returns {string[]}
 */
function getUserCliPaths(home) {
  const env = process.env
  const candidates = []

  if (env.APPDATA) {
    candidates.push(path.join(env.APPDATA, 'npm'))
  }

  if (env.LOCALAPPDATA) {
    candidates.push(path.join(env.LOCALAPPDATA, 'Programs', 'nodejs'))
  }

  candidates.push(path.join(home, 'AppData', 'Roaming', 'npm'))

  return candidates
}

/** @returns {string} */
function getCacheBase() {
  return process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
}

/**
 * Build a terminal launch plan using cmd.exe on Windows.
 */
function createTerminalLaunchPlan({ command, args }) {
  const commandLine = [command, ...args]
    .map((arg) => escapeArg(String(arg)))
    .join(' ')

  return {
    ok: true,
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', 'start', '', 'cmd.exe', '/k', commandLine],
  }
}

/** @returns {string[]} */
function getExecutableExtensions() {
  return ['', '.exe', '.cmd', '.bat', '.ps1']
}

/**
 * Resolve the preferred PATH environment variable key.
 * Windows may have "Path" or "PATH" — prefer "Path".
 */
function getPathEnvKey(env) {
  return Object.keys(env).find((key) => key === 'Path')
    ?? Object.keys(env).find((key) => key.toLowerCase() === 'path')
    ?? 'Path'
}

// -- internal helpers --------------------------------------------------------

function findPowerShell(env) {
  const programFiles = env.ProgramFiles || 'C:\\Program Files'
  const candidates = [
    path.join(programFiles, 'PowerShell', '7', 'pwsh.exe'),
    'pwsh.exe',
    'powershell.exe',
  ]

  for (const candidate of candidates) {
    try {
      if (path.isAbsolute(candidate)) {
        if (fs.existsSync(candidate)) return candidate
      } else {
        return candidate
      }
    } catch {
      continue
    }
  }

  return null
}

module.exports = {
  name: 'win32',
  createTerminalLaunchPlan,
  escapeArg,
  getCacheBase,
  getDefaultShell,
  getExecutableExtensions,
  getPathEnvKey,
  getPlatformInfo,
  getShellArgs,
  getSystemCliPaths,
  getTerminationStrategy,
  getUserCliPaths,
  killProcess,
  shouldDetachProcess,
}
