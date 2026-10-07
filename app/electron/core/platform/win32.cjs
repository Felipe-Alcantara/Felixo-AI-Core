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

/**
 * Flags para rodar um `.ps1` resolvido no PATH.
 *
 * O `cmd.exe` não executa `.ps1` (`.PS1` não está no PATHEXT padrão) e o
 * `child_process` também não; quem roda é o PowerShell, com `-File`.
 * `-ExecutionPolicy Bypass` vale só para este processo: a política padrão de
 * uma máquina cliente recusa script local não assinado, e o script já foi
 * escolhido pela pessoa ao colocá-lo no PATH. `-NoProfile`, como nos
 * terminais do canvas: um `$PROFILE` com `cd`/erro não pode decidir se a CLI
 * existe. Decisão do Felipe (07/10/2026): suportar o alias `.ps1` do Openia.
 */
const POWERSHELL_SCRIPT_FLAGS = Object.freeze(['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass'])

/** @returns {boolean} */
function isPowerShellScript(executable) {
  return typeof executable === 'string' && /\.ps1$/i.test(executable)
}

/**
 * Comando e argumentos para rodar um `.ps1` pelo PowerShell.
 *
 * `interactive: false` (detecção, contratos `--json`) acrescenta
 * `-NonInteractive`, para um script que pergunte algo falhar em vez de ficar
 * esperando até o tempo limite. No terminal do canvas o script conversa com a
 * pessoa, então a flag fica de fora; `keepOpen` mantém o PowerShell vivo
 * depois do script, como o `/k` do `cmd.exe` numa sessão de "rodar arquivo".
 *
 * @param {string} scriptPath - Caminho absoluto do `.ps1`.
 * @param {string[]} args - Argumentos repassados ao script.
 * @param {Record<string, string>} [env]
 * @param {{ interactive?: boolean, keepOpen?: boolean, exists?: (candidate: string) => boolean }} [options]
 * @returns {{ command: string, args: string[] } | null} `null` sem PowerShell na máquina.
 */
function createPowerShellScriptLaunch(scriptPath, args = [], env = process.env, options = {}) {
  const powerShell = findPowerShell(env || {}, options.exists ?? fs.existsSync)
  if (!powerShell) return null

  return {
    command: powerShell,
    args: [
      ...POWERSHELL_SCRIPT_FLAGS,
      ...(options.interactive ? [] : ['-NonInteractive']),
      ...(options.keepOpen ? ['-NoExit'] : []),
      '-File',
      scriptPath,
      ...args,
    ],
  }
}

module.exports = {
  name: 'win32',
  POWERSHELL_SCRIPT_FLAGS,
  createPowerShellScriptLaunch,
  createTerminalLaunchPlan,
  isPowerShellScript,
  escapeArg,
  getCacheBase,
  getDefaultShell,
  getExecutableExtensions,
  getPathEnvKey,
  getShellArgs,
  getSystemCliPaths,
  getUserCliPaths,
  killProcess,
  shouldDetachProcess,
}
