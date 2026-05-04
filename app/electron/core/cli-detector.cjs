/**
 * @module cli-detector
 * Detects external CLIs installed on the system.
 *
 * Provides automatic detection, version checking, and status reporting
 * for CLIs used by Felixo AI Core (claude, codex, gemini, git, node, etc).
 */

const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const path = require('node:path')
const fs = require('node:fs')

const execFileAsync = promisify(execFile)

const DETECTION_TIMEOUT_MS = 5000

/**
 * @typedef {object} CliInfo
 * @property {string} name - Human-readable name.
 * @property {string} command - Command to execute.
 * @property {string[]} [windowsAliases] - Alternative names on Windows (.exe, .cmd).
 * @property {string} versionFlag - Flag to get version.
 * @property {string} [authCheckFlag] - Flag to check auth status.
 * @property {string} category - 'ai-provider' | 'tool' | 'runtime'.
 * @property {string} installUrl - URL with install instructions.
 */

/** @type {CliInfo[]} */
const SUPPORTED_CLIS = [
  {
    name: 'Claude Code CLI',
    command: 'claude',
    windowsAliases: ['claude.exe', 'claude.cmd'],
    versionFlag: '--version',
    authCheckFlag: null,
    category: 'ai-provider',
    installUrl: 'https://code.claude.com/docs/en/setup',
  },
  {
    name: 'Codex CLI',
    command: 'codex',
    windowsAliases: ['codex.exe', 'codex.cmd'],
    versionFlag: '--version',
    authCheckFlag: null,
    category: 'ai-provider',
    installUrl: 'https://developers.openai.com/codex/cli',
  },
  {
    name: 'Gemini CLI',
    command: 'gemini',
    windowsAliases: ['gemini.exe', 'gemini.cmd'],
    versionFlag: '--version',
    authCheckFlag: null,
    category: 'ai-provider',
    installUrl: 'https://geminicli.com/docs/get-started/installation/',
  },
  {
    name: 'Git',
    command: 'git',
    windowsAliases: ['git.exe'],
    versionFlag: '--version',
    authCheckFlag: null,
    category: 'tool',
    installUrl: 'https://git-scm.com/downloads',
  },
  {
    name: 'Node.js',
    command: 'node',
    windowsAliases: ['node.exe'],
    versionFlag: '--version',
    authCheckFlag: null,
    category: 'runtime',
    installUrl: 'https://nodejs.org/',
  },
  {
    name: 'Python',
    command: 'python3',
    windowsAliases: ['python.exe', 'python3.exe', 'py.exe'],
    versionFlag: '--version',
    authCheckFlag: null,
    category: 'runtime',
    installUrl: 'https://www.python.org/downloads/',
  },
  {
    name: 'Ollama',
    command: 'ollama',
    windowsAliases: ['ollama.exe'],
    versionFlag: '--version',
    authCheckFlag: null,
    category: 'ai-provider',
    installUrl: 'https://ollama.ai/',
  },
]

/**
 * Detect a single CLI by running its version command.
 *
 * @param {CliInfo} cliInfo
 * @param {Record<string, string>} [env]
 * @returns {Promise<{
 *   name: string,
 *   command: string,
 *   detected: boolean,
 *   version: string | null,
 *   path: string | null,
 *   category: string,
 *   installUrl: string,
 *   error: string | null,
 * }>}
 */
async function detectCli(cliInfo, env) {
  const result = {
    name: cliInfo.name,
    command: cliInfo.command,
    detected: false,
    version: null,
    path: null,
    category: cliInfo.category,
    installUrl: cliInfo.installUrl,
    error: null,
  }

  const commandsToTry = [cliInfo.command]

  if (process.platform === 'win32' && cliInfo.windowsAliases) {
    commandsToTry.push(...cliInfo.windowsAliases)
  }

  for (const command of commandsToTry) {
    try {
      const { stdout, stderr } = await execFileAsync(command, [cliInfo.versionFlag], {
        timeout: DETECTION_TIMEOUT_MS,
        env: env || process.env,
        windowsHide: true,
      })

      const output = (stdout || stderr || '').trim()
      result.detected = true
      result.version = parseVersionFromOutput(output)
      result.path = resolveCommandPath(command, env)
      return result
    } catch {
      continue
    }
  }

  result.error = `${cliInfo.name} não foi encontrado no PATH do sistema.`
  return result
}

/**
 * Detect all supported CLIs.
 *
 * @param {Record<string, string>} [env]
 * @returns {Promise<Array<ReturnType<typeof detectCli>>>}
 */
async function detectAllClis(env) {
  const results = await Promise.all(
    SUPPORTED_CLIS.map((cli) => detectCli(cli, env)),
  )
  return results
}

/**
 * Detect only AI provider CLIs.
 *
 * @param {Record<string, string>} [env]
 * @returns {Promise<Array<ReturnType<typeof detectCli>>>}
 */
async function detectProviderClis(env) {
  const providers = SUPPORTED_CLIS.filter((cli) => cli.category === 'ai-provider')
  return Promise.all(providers.map((cli) => detectCli(cli, env)))
}

/**
 * Generate a human-readable status summary of detected CLIs.
 *
 * @param {Array<Awaited<ReturnType<typeof detectCli>>>} results
 * @returns {string}
 */
function formatDetectionSummary(results) {
  const lines = results.map((r) => {
    const status = r.detected ? '✅' : '❌'
    const version = r.version ? ` (${r.version})` : ''
    const hint = r.detected ? '' : ` — Instale: ${r.installUrl}`
    return `${status} ${r.name}${version}${hint}`
  })
  return lines.join('\n')
}

/**
 * Create a user-friendly message when a CLI is not found.
 *
 * @param {string} cliName
 * @returns {string}
 */
function createCliNotFoundMessage(cliName) {
  const cli = SUPPORTED_CLIS.find(
    (c) => c.name === cliName || c.command === cliName,
  )

  if (!cli) {
    return `A CLI "${cliName}" não foi encontrada no sistema. Verifique se está instalada e disponível no PATH.`
  }

  return `${cli.name} não foi encontrado no sistema. Para instalar, acesse: ${cli.installUrl}`
}

/**
 * Parse version string from CLI output.
 *
 * @param {string} output
 * @returns {string | null}
 */
function parseVersionFromOutput(output) {
  if (!output) return null

  // Match common version patterns like "v1.2.3", "1.2.3", "version 1.2.3"
  const match = output.match(/v?(\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?)/)
  return match ? match[1] : output.split('\n')[0].trim().slice(0, 50)
}

/**
 * Try to resolve the full path of a command.
 *
 * @param {string} command
 * @param {Record<string, string>} [env]
 * @param {object} [options]
 * @param {string} [options.platform]
 * @param {(candidate: string) => boolean} [options.exists]
 * @returns {string | null}
 */
function resolveCommandPath(command, env, options = {}) {
  const currentPlatform = options.platform || process.platform
  const exists = options.exists || fs.existsSync
  const currentEnv = env || process.env
  const platformPath = currentPlatform === 'win32' ? path.win32 : path
  const pathKey =
    Object.keys(currentEnv).find((key) => key.toLowerCase() === 'path') ??
    (currentPlatform === 'win32' ? 'Path' : 'PATH')
  const pathEnv = currentEnv[pathKey] || ''
  const dirs = pathEnv.split(platformPath.delimiter)

  const extensions = currentPlatform === 'win32'
    ? ['', '.exe', '.cmd', '.bat', '.ps1']
    : ['']

  for (const dir of dirs) {
    for (const ext of extensions) {
      const fullPath = platformPath.join(dir, command + ext)
      try {
        if (exists(fullPath)) {
          return fullPath
        }
      } catch {
        continue
      }
    }
  }

  return null
}

module.exports = {
  SUPPORTED_CLIS,
  createCliNotFoundMessage,
  detectAllClis,
  detectCli,
  detectProviderClis,
  formatDetectionSummary,
  parseVersionFromOutput,
  resolveCommandPath,
}
