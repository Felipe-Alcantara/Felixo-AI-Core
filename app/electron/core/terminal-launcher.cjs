const fs = require('node:fs')
const path = require('node:path')
const spawnChildProcess = require('cross-spawn')
const { escapeShellArg } = require('./shell-adapter.cjs')

function createTerminalLaunchPlan({
  command,
  args = [],
  cwd = process.env.HOME || process.cwd(),
  env = process.env,
  platform = process.platform,
  exists = fs.existsSync,
} = {}) {
  if (!command) {
    return {
      ok: false,
      message: 'Comando invalido para abrir login da CLI.',
    }
  }

  if (platform === 'darwin') {
    const commandLine = createShellCommandLine(command, args, cwd, platform)
    return {
      ok: true,
      command: 'osascript',
      args: [
        '-e',
        `tell application "Terminal" to do script ${JSON.stringify(commandLine)}`,
      ],
    }
  }

  if (platform === 'win32') {
    const commandLine = [command, ...args]
      .map((arg) => escapeShellArg(String(arg), platform))
      .join(' ')

    return {
      ok: true,
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'start', '', 'cmd.exe', '/k', commandLine],
    }
  }

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

function launchCommandInTerminal(options = {}) {
  const plan = createTerminalLaunchPlan(options)

  if (!plan.ok) {
    return plan
  }

  const childProcess = spawnChildProcess(plan.command, plan.args, {
    cwd: options.cwd || process.env.HOME || process.cwd(),
    detached: true,
    env: options.env || process.env,
    stdio: 'ignore',
    windowsHide: false,
  })

  childProcess.unref()

  return {
    ok: true,
    command: plan.command,
    args: plan.args,
  }
}

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
      createArgs: ({ command, args, cwd }) => [
        '--hold',
        '--working-directory',
        cwd,
        '--command',
        [command, ...args].map((arg) => escapeShellArg(String(arg))).join(' '),
      ],
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
    commandExists(candidate.command, env, exists),
  )
}

function commandExists(command, env, exists) {
  if (path.isAbsolute(command)) {
    return exists(command)
  }

  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
  const pathParts = String(env[pathKey] ?? '')
    .split(path.delimiter)
    .filter(Boolean)

  return pathParts.some((pathPart) => exists(path.join(pathPart, command)))
}

function createShellCommandLine(command, args, cwd, platform) {
  const cd = `cd ${escapeShellArg(cwd, platform)}`
  const commandLine = [command, ...args]
    .map((arg) => escapeShellArg(String(arg), platform))
    .join(' ')

  return `${cd} && ${commandLine}`
}

module.exports = {
  createTerminalLaunchPlan,
  launchCommandInTerminal,
}
