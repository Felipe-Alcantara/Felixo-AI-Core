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
const platform = require('./platform/index.cjs')

const execFileAsync = promisify(execFile)

/**
 * Tempo limite de `<cli> --version`.
 *
 * Eram 5 s, apertado demais: o Gemini CLI leva ~3 s para responder numa
 * máquina ociosa, e a detecção roda logo depois da abertura do app, quando a
 * CPU está disputada. Estourar o limite fazia a CLI passar por ausente — e o
 * instalador automático reinstalar o que já estava lá. O limite continua
 * existindo para uma CLI travada não segurar a rotina.
 */
const DETECTION_TIMEOUT_MS = 15000

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
    name: 'Openia (launcher OpenRouter)',
    command: 'openia',
    windowsAliases: ['openia.exe', 'openia.cmd', 'openia.ps1'],
    versionFlag: '--version',
    authCheckFlag: null,
    category: 'ai-provider',
    installUrl: 'https://github.com/Felipe-Alcantara/Openia',
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
 * @param {object} [options]
 * @param {string} [options.platformName]
 * @param {(command: string, env?: Record<string, string>, options?: object) => string | null} [options.resolvePath]
 * @param {(command: string, args: string[], options: object) => Promise<{ stdout?: string, stderr?: string }>} [options.execute]
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
async function detectCli(cliInfo, env, options = {}) {
  const adapter = platform.getAdapter(options.platformName || platform.name)
  const execute = options.execute || execFileAsync
  const resolvePath = options.resolvePath || resolveCommandPath
  const result = {
    name: cliInfo.name,
    command: cliInfo.command,
    detected: false,
    version: null,
    path: null,
    category: cliInfo.category,
    installUrl: cliInfo.installUrl,
    error: null,
    reason: null,
    attempts: [],
  }

  const attempts = []
  const commandsToTry = [cliInfo.command]

  if (adapter.name === 'win32' && cliInfo.windowsAliases) {
    commandsToTry.push(...cliInfo.windowsAliases)
  }

  for (const command of commandsToTry) {
    // Declaradas fora do `try` para o registro de tentativas enxergar o que
    // foi resolvido mesmo quando o exec falha logo depois.
    let commandPath = null
    let useShell = false
    try {
      commandPath = adapter.name === 'win32'
        ? resolvePath(command, env, { platform: adapter.name })
        : null
      const executable = commandPath || command
      useShell = adapter.name === 'win32' && /\.(?:cmd|bat)$/i.test(executable)
      // `execFile` com `shell: true` no Windows concatena o comando cru para o
      // `cmd.exe /c` em vez de citá-lo — sem aspas, um caminho com espaço (ex.:
      // "C:\Users\Felipe Martins\...") quebra ao meio e cmd.exe tenta rodar só
      // o pedaço antes do espaço. Medido ao vivo: `claude`/`codex` instaladas
      // via npm reportavam "não instalada" só numa conta cujo nome de usuário
      // do Windows tem espaço.
      //
      // A flag vai dentro da linha de comando, e nao no array de argumentos,
      // quando o shell entra: com `shell: true` o Node concatena os
      // argumentos crus na linha do `cmd.exe` de qualquer jeito, e avisa
      // disso (DEP0190, que um dia vira erro). Fazendo a juncao aqui o
      // comando final e identico — o executavel ja vai citado logo acima e a
      // flag e uma constante de SUPPORTED_CLIS, nunca entrada de usuario —,
      // mas sem depender de um comportamento que o Node deprecou. Fora do
      // shell o array continua, que e a forma segura e a unica no POSIX.
      const commandToRun = useShell
        ? `"${executable}" ${cliInfo.versionFlag}`
        : executable
      const commandArgs = useShell ? [] : [cliInfo.versionFlag]
      const { stdout, stderr } = await execute(commandToRun, commandArgs, {
        timeout: DETECTION_TIMEOUT_MS,
        env: env || process.env,
        windowsHide: true,
        ...(useShell ? { shell: true } : {}),
      })

      const output = (stdout || stderr || '').trim()
      result.detected = true
      result.version = parseVersionFromOutput(output)
      result.path = commandPath || resolvePath(command, env, { platform: adapter.name })
      attempts.push({ command, resolvedPath: commandPath, viaShell: useShell, outcome: 'ok', reason: null })
      result.attempts = attempts
      return result
    } catch (error) {
      // Só o código de motivo é guardado: a mensagem crua do erro pode trazer
      // saída da CLI, e este registro é copiado para suporte.
      attempts.push({
        command,
        resolvedPath: commandPath,
        viaShell: useShell,
        outcome: 'failed',
        reason: classifyExecutionFailure(error),
      })
      continue
    }
  }

  result.attempts = attempts
  result.reason = summarizeFailureReason(attempts)
  result.error = `${cliInfo.name} não foi executado: nenhum comando compatível respondeu a ${cliInfo.versionFlag}. Verifique o PATH e o instalador da CLI.`
  return result
}

/**
 * Motivos de falha de execução que a interface sabe explicar.
 *
 * Fechado de propósito: quem consome faz `switch` sobre estes valores para
 * escolher a próxima ação, e um valor novo e silencioso cairia no genérico.
 */
const FAILURE_REASONS = Object.freeze({
  NOT_FOUND: 'not-found',
  PERMISSION: 'permission',
  TIMEOUT: 'timeout',
  SHIM_BROKEN: 'shim-broken',
  EXIT_ERROR: 'exit-error',
  UNKNOWN: 'unknown',
})

const SHIM_FAILURE_OUTPUT =
  /(?:is not recognized|não é reconhecido|cannot find the path|não pode encontrar o caminho|no such file or directory.*(?:node|env))/i

/**
 * Classifica por que `<cli> --version` não respondeu.
 *
 * Olha o código do erro do Node antes do texto: texto muda com idioma e versão
 * da CLI, o código não. O texto só entra para separar "a CLI rodou e falhou"
 * de "o atalho `.cmd` não achou o Node que ele mesmo chama".
 *
 * @param {any} error
 * @returns {string} Um valor de {@link FAILURE_REASONS}.
 */
function classifyExecutionFailure(error) {
  const code = error?.code

  if (code === 'ENOENT') return FAILURE_REASONS.NOT_FOUND
  if (code === 'EACCES' || code === 'EPERM') return FAILURE_REASONS.PERMISSION
  // EINVAL: o Node recusa spawn de `.cmd`/`.bat` sem shell desde a correção da
  // CVE-2024-27980 — o atalho existe, mas quem executa não sabe rodá-lo.
  if (code === 'EINVAL') return FAILURE_REASONS.SHIM_BROKEN
  if (code === 'ETIMEDOUT' || error?.killed === true) return FAILURE_REASONS.TIMEOUT

  if (typeof code === 'number') {
    const output = `${error?.stderr ?? ''}\n${error?.stdout ?? ''}`
    return SHIM_FAILURE_OUTPUT.test(output)
      ? FAILURE_REASONS.SHIM_BROKEN
      : FAILURE_REASONS.EXIT_ERROR
  }

  return FAILURE_REASONS.UNKNOWN
}

/**
 * Motivo que melhor explica um conjunto de tentativas que falharam.
 *
 * Um "não achei" só vale quando NENHUMA tentativa encontrou algo no disco: se
 * uma variante resolveu para um arquivo e falhou ao executar, o problema é o
 * arquivo, e é ele que a pessoa precisa ouvir.
 *
 * @param {Array<{ resolvedPath: string | null, reason: string | null }>} attempts
 * @returns {string | null}
 */
function summarizeFailureReason(attempts) {
  if (attempts.length === 0) return null

  const foundOnDisk = attempts.find(
    (attempt) => attempt.resolvedPath && attempt.reason !== FAILURE_REASONS.NOT_FOUND,
  )
  if (foundOnDisk) return foundOnDisk.reason

  const specific = attempts.find(
    (attempt) => attempt.reason && attempt.reason !== FAILURE_REASONS.NOT_FOUND,
  )
  return specific ? specific.reason : FAILURE_REASONS.NOT_FOUND
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
  const adapter = options.platform
    ? platform.getAdapter(options.platform)
    : platform
  const exists = options.exists || fs.existsSync
  const currentEnv = env || process.env
  const platformPath = adapter.name === 'win32' ? path.win32 : path
  const pathKey = adapter.getPathEnvKey(currentEnv)
  const pathEnv = currentEnv[pathKey] || ''
  const dirs = pathEnv.split(platformPath.delimiter)
  const extensions = adapter.getExecutableExtensions()

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
  FAILURE_REASONS,
  SUPPORTED_CLIS,
  classifyExecutionFailure,
  createCliNotFoundMessage,
  summarizeFailureReason,
  detectAllClis,
  detectCli,
  detectProviderClis,
  formatDetectionSummary,
  parseVersionFromOutput,
  resolveCommandPath,
}
