/**
 * @module platform/win32
 * Windows platform adapter.
 */

const os = require('node:os')
// `path.win32`, e nao `path`: este adaptador descreve o Windows, e as regras
// de caminho tem que ser as do alvo mesmo quando o codigo roda noutro SO —
// senao os caminhos saiam com barras trocadas ("C:\Program Files/PowerShell")
// e o PATH era separado por ":" em vez de ";".
const path = require('node:path').win32
const fs = require('node:fs')

/** @returns {string} */
function getDefaultShell(env, exists = fs.existsSync) {
  return findPowerShell(env, exists) || 'cmd.exe'
}

/** @returns {string[]} */
function getShellArgs(shell) {
  const lower = shell.toLowerCase()
  if (lower.includes('powershell') || lower.includes('pwsh')) {
    // Keep a PTY interactive, but avoid user profiles that may contain a
    // stale `cd` or startup script and make the terminal fail at launch.
    return ['-NoLogo', '-NoProfile']
  }

  // Disable CMD AutoRun registry commands for the same reason. Do not add
  // `/c`: an interactive PTY must keep the shell process alive.
  return ['/d']
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

/**
 * Ordem em que testamos as extensões de um comando no Windows.
 *
 * `''` fica por último de propósito: o npm cria, para cada CLI instalada
 * globalmente, três arquivos com o mesmo nome base — `claude` (shim POSIX,
 * sem extensão), `claude.cmd` e `claude.ps1`. Com `''` primeiro, o resolvedor
 * achava o shim POSIX antes do `.cmd` e devolvia esse caminho; `detectCli` só
 * liga `shell: true` para caminho terminado em `.cmd`/`.bat`, então o
 * `execFile` tentava rodar um script Unix como binário nativo do Windows e
 * falhava — a CLI aparecia como "não instalada" mesmo instalada de verdade
 * (medido ao vivo: `claude`/`codex`/`gemini` instaladas via npm, todas
 * reportando `detected: false`).
 *
 * @returns {string[]}
 */
function getExecutableExtensions() {
  return ['.exe', '.cmd', '.bat', '.ps1', '']
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

// `exists` é injetável para os testes poderem descrever uma máquina sem
// PowerShell: os candidatos caem em C:\Program Files mesmo com env vazio, e
// checar o disco real fazia o teste do fallback depender de quem instalou o
// quê na máquina que roda a suíte.
function findPowerShell(env, exists = fs.existsSync) {
  const systemRoot = env.SystemRoot || env.WINDIR || 'C:\\Windows'
  const programFiles = env.ProgramFiles || 'C:\\Program Files'
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path')
  const pathEntries = String(pathKey ? env[pathKey] : '')
    .split(';')
    .filter(Boolean)
  const candidates = [
    path.join(programFiles, 'PowerShell', '7', 'pwsh.exe'),
    path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ...pathEntries.flatMap((entry) => [
      path.join(entry, 'pwsh.exe'),
      path.join(entry, 'powershell.exe'),
    ]),
  ]

  for (const candidate of candidates) {
    try {
      if (exists(candidate)) return candidate
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
