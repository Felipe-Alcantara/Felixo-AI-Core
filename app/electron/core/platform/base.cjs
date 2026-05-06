/**
 * @module platform/base
 * Base platform adapter contract.
 *
 * Every platform adapter (linux, darwin, win32) must implement these methods.
 * This module also serves as the fallback for unknown platforms, using
 * sensible Linux-like defaults.
 */

const os = require('node:os')
const path = require('node:path')

/** @returns {string} */
function getDefaultShell(env) {
  return env.SHELL || '/bin/bash'
}

/** @returns {string[]} */
function getShellArgs(_shell) {
  return ['-c']
}

/** @returns {string} */
function escapeArg(arg) {
  if (!arg) return '""'

  if (/[' "&|<>()$`\\!#*?[\]{}~;]/.test(arg) || arg.includes(' ')) {
    return `'${arg.replace(/'/g, "'\\''")}'`
  }

  return arg
}

/** @returns {{ signal: string, canKillGroup: boolean, notes: string }} */
function getTerminationStrategy() {
  return {
    signal: 'SIGTERM',
    canKillGroup: true,
    notes: 'Unix supports process group kill via -pid negative PID.',
  }
}

/** @returns {object} */
function getPlatformInfo() {
  return {
    defaultShell: '/bin/bash',
    pathSeparator: ':',
    supportsProcessGroups: true,
    supportsAnsiColors: true,
    notes: [
      'Most CLIs work natively.',
      'Permissions are file-based (chmod).',
      'AppImage may have restricted PATH.',
    ],
  }
}

/** @returns {boolean} */
function shouldDetachProcess() {
  return true
}

/**
 * Kill a child process, using process group kill when available.
 * @param {import('node:child_process').ChildProcess} childProcess
 * @param {string} signal
 * @returns {boolean}
 */
function killProcess(childProcess, signal) {
  if (!childProcess.pid) {
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

/** @returns {string[]} Additional PATH candidates for discovering CLI binaries. */
function getSystemCliPaths() {
  return ['/usr/local/bin', '/usr/bin', '/bin']
}

/**
 * @param {string} home
 * @returns {string[]}
 */
function getUserCliPaths(home) {
  return [
    path.join(home, '.local', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.volta', 'bin'),
    path.join(home, '.asdf', 'shims'),
  ]
}

/** @returns {string} */
function getCacheBase() {
  return process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache')
}

/**
 * Build a terminal launch plan for opening a command in a graphical terminal.
 * @param {object} options
 * @param {string} options.command
 * @param {string[]} options.args
 * @param {string} options.cwd
 * @param {Record<string, string>} options.env
 * @param {(candidate: string) => boolean} options.exists
 * @returns {{ ok: boolean, command?: string, args?: string[], message?: string }}
 */
function createTerminalLaunchPlan({ command, args, cwd, env, exists }) {
  const terminal = findLinuxTerminal(env, exists)

  if (!terminal) {
    return {
      ok: false,
      message:
        'Nenhum terminal grafico conhecido foi encontrado para abrir o login. Rode o comando manualmente no terminal.',
    }
  }

  return {
    ok: true,
    command: terminal.command,
    args: terminal.createArgs({ command, args, cwd }),
  }
}

/**
 * @param {string} command
 * @returns {string[]} File extensions to try when resolving a command path.
 */
function getExecutableExtensions() {
  return ['']
}

/**
 * Resolve the preferred PATH environment variable key.
 * @returns {string}
 */
function getPathEnvKey(env) {
  return Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
}

// -- internal helpers --------------------------------------------------------

function findLinuxTerminal(env, exists) {
  const candidates = [
    {
      command: 'konsole',
      createArgs: ({ command, args, cwd }) => [
        '--hold',
        '--workdir',
        cwd,
        '-e',
        command,
        ...args,
      ],
    },
    {
      command: 'gnome-terminal',
      createArgs: ({ command, args, cwd }) => [
        `--working-directory=${cwd}`,
        '--',
        command,
        ...args,
      ],
    },
    {
      command: 'xfce4-terminal',
      createArgs: ({ command, args, cwd }) => {
        const escapeForShell = require('./base.cjs').escapeArg
        return [
          '--hold',
          '--working-directory',
          cwd,
          '--command',
          [command, ...args].map((a) => escapeForShell(String(a))).join(' '),
        ]
      },
    },
    {
      command: 'xterm',
      createArgs: ({ command, args }) => ['-hold', '-e', command, ...args],
    },
    {
      command: 'x-terminal-emulator',
      createArgs: ({ command, args }) => ['-e', command, ...args],
    },
  ]

  return candidates.find((candidate) =>
    commandExistsInPath(candidate.command, env, exists),
  )
}

function commandExistsInPath(command, env, exists) {
  if (path.isAbsolute(command)) {
    return exists(command)
  }

  const pathKey = getPathEnvKey(env)
  const pathParts = String(env[pathKey] ?? '')
    .split(path.delimiter)
    .filter(Boolean)

  return pathParts.some((pathPart) => exists(path.join(pathPart, command)))
}

module.exports = {
  name: 'linux',
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
