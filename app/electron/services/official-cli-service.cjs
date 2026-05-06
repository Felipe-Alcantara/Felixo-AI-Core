const os = require('node:os')
const spawnChildProcess = require('cross-spawn')
const platform = require('../core/platform/index.cjs')
const { createCliEnv } = require('./cli-process-manager.cjs')
const { detectCli } = require('../core/cli-detector.cjs')
const {
  getOfficialAiCli,
  listOfficialAiClis,
} = require('../core/official-cli-catalog.cjs')
const {
  launchCommandInTerminal,
} = require('../core/terminal-launcher.cjs')

const INSTALL_TIMEOUT_MS = 10 * 60 * 1000
const AUTH_COMMAND_TIMEOUT_MS = 30 * 1000
const OUTPUT_LIMIT = 12000

async function listOfficialCliCatalog() {
  const env = createCliEnv()
  const clis = await Promise.all(
    listOfficialAiClis().map(async (cli) => {
      const detection = await detectCli(cli, env)

      return createCatalogItem(cli, detection)
    }),
  )

  return clis
}

async function installOfficialCli(id) {
  const cli = getOfficialAiCli(id)

  if (!cli) {
    return {
      ok: false,
      message: 'CLI oficial desconhecida.',
    }
  }

  const installCommand = getPlatformCommand(cli.install)
  const installResult = await runBufferedCommand({
    command: installCommand,
    args: cli.install.args,
    cwd: os.homedir(),
    env: createCliEnv(),
    timeoutMs: INSTALL_TIMEOUT_MS,
  })
  const detection = await detectCli(cli, createCliEnv())

  return {
    ...installResult,
    cli: createCatalogItem(cli, detection),
    models: cli.models.map((model) => ({ ...model })),
  }
}

function openOfficialCliLogin(id) {
  const cli = getOfficialAiCli(id)

  if (!cli) {
    return {
      ok: false,
      message: 'CLI oficial desconhecida.',
    }
  }

  const result = launchCommandInTerminal({
    command: cli.login.command,
    args: cli.login.args,
    cwd: os.homedir(),
    env: createCliEnv(),
  })

  if (!result.ok) {
    return {
      ...result,
      manualCommand: cli.login.label,
    }
  }

  return {
    ok: true,
    message: `Login oficial de ${cli.name} aberto no terminal.`,
    command: result.command,
    args: result.args,
  }
}

async function getOfficialCliAccountStatus(id) {
  const cli = getOfficialAiCli(id)

  if (!cli) {
    return {
      ok: false,
      message: 'CLI oficial desconhecida.',
    }
  }

  if (!cli.accountSwitch?.status) {
    return {
      ok: false,
      message: `${cli.name} não tem consulta de conta configurada.`,
    }
  }

  const command = getPlatformCommand(cli.accountSwitch.status)
  const result = await runBufferedCommand({
    command,
    args: cli.accountSwitch.status.args,
    cwd: os.homedir(),
    env: createCliEnv(),
    timeoutMs: AUTH_COMMAND_TIMEOUT_MS,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()

  return {
    ...result,
    authStatus: parseCodexLoginStatus(output),
    message: output || result.message,
  }
}

async function switchOfficialCliAccount(id) {
  const cli = getOfficialAiCli(id)

  if (!cli) {
    return {
      ok: false,
      message: 'CLI oficial desconhecida.',
    }
  }

  if (!cli.accountSwitch?.logout) {
    return {
      ok: false,
      message: `${cli.name} não tem troca de conta configurada.`,
    }
  }

  const command = getPlatformCommand(cli.accountSwitch.logout)
  const logoutResult = await runBufferedCommand({
    command,
    args: cli.accountSwitch.logout.args,
    cwd: os.homedir(),
    env: createCliEnv(),
    timeoutMs: AUTH_COMMAND_TIMEOUT_MS,
  })

  if (!logoutResult.ok) {
    return logoutResult
  }

  const loginResult = openOfficialCliLogin(id)

  if (!loginResult.ok) {
    return {
      ...loginResult,
      logout: logoutResult,
    }
  }

  return {
    ok: true,
    message: `Conta de ${cli.name} desconectada. Login oficial aberto no terminal.`,
    command: loginResult.command,
    args: loginResult.args,
    logout: logoutResult,
  }
}

function createCatalogItem(cli, detection) {
  return {
    id: cli.id,
    name: cli.name,
    provider: cli.provider,
    command: cli.command,
    detected: Boolean(detection.detected),
    version: detection.version,
    path: detection.path,
    error: detection.error,
    installCommand: cli.install.label,
    loginCommand: cli.login.label,
    statusCommand: cli.accountSwitch?.status?.label,
    switchAccountCommand: cli.accountSwitch?.logout?.label,
    supportsAccountSwitch: Boolean(cli.accountSwitch),
    installUrl: cli.installUrl,
    authUrl: cli.authUrl,
    models: cli.models.map((model) => ({ ...model })),
  }
}

function getPlatformCommand(descriptor) {
  if (platform.name === 'win32' && descriptor.windowsCommand) {
    return descriptor.windowsCommand
  }

  return descriptor.command
}

function runBufferedCommand({
  command,
  args = [],
  cwd = os.homedir(),
  env = process.env,
  timeoutMs = INSTALL_TIMEOUT_MS,
}) {
  return new Promise((resolve) => {
    const childProcess = spawnChildProcess(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    let didSettle = false
    const timer = setTimeout(() => {
      if (didSettle) {
        return
      }

      didSettle = true
      childProcess.kill('SIGTERM')
      resolve({
        ok: false,
        message: `${command} excedeu o tempo limite de execucao.`,
        stdout,
        stderr,
      })
    }, timeoutMs)

    childProcess.stdout.setEncoding('utf8')
    childProcess.stdout.on('data', (chunk) => {
      stdout = appendLimited(stdout, chunk)
    })

    childProcess.stderr.setEncoding('utf8')
    childProcess.stderr.on('data', (chunk) => {
      stderr = appendLimited(stderr, chunk)
    })

    childProcess.on('error', (error) => {
      if (didSettle) {
        return
      }

      didSettle = true
      clearTimeout(timer)
      resolve({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        stdout,
        stderr,
      })
    })

    childProcess.on('close', (code, signal) => {
      if (didSettle) {
        return
      }

      didSettle = true
      clearTimeout(timer)

      if (code === 0) {
        resolve({
          ok: true,
          message: 'Comando concluido.',
          stdout,
          stderr,
        })
        return
      }

      resolve({
        ok: false,
        message: createInstallErrorMessage(command, code, signal, stderr),
        stdout,
        stderr,
      })
    })
  })
}

function appendLimited(current, chunk) {
  return `${current}${chunk}`.slice(-OUTPUT_LIMIT)
}

function createInstallErrorMessage(command, code, signal, stderr) {
  const detail = String(stderr ?? '').trim()
  const status = signal ? `sinal ${signal}` : `codigo ${code}`

  if (!detail) {
    return `${command} encerrou com ${status}.`
  }

  return `${command} encerrou com ${status}: ${detail.slice(0, 1000)}`
}

function parseCodexLoginStatus(output) {
  const normalizedOutput = String(output ?? '').trim().toLowerCase()

  if (!normalizedOutput) {
    return 'unknown'
  }

  if (
    normalizedOutput.includes('not logged in') ||
    normalizedOutput.includes('not authenticated') ||
    normalizedOutput.includes('no login') ||
    normalizedOutput.includes('logged out')
  ) {
    return 'logged_out'
  }

  if (normalizedOutput.includes('logged in')) {
    return 'logged_in'
  }

  return 'unknown'
}

module.exports = {
  createCatalogItem,
  getOfficialCliAccountStatus,
  installOfficialCli,
  listOfficialCliCatalog,
  openOfficialCliLogin,
  parseCodexLoginStatus,
  runBufferedCommand,
  switchOfficialCliAccount,
}
