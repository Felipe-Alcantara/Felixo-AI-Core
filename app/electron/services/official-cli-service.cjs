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
const {
  parseCodexAccountStatus,
  parseCodexLoginStatus,
  redactSecrets,
} = require('./official-cli-account-status.cjs')

const INSTALL_TIMEOUT_MS = 10 * 60 * 1000
const AUTH_COMMAND_TIMEOUT_MS = 30 * 1000
const OUTPUT_LIMIT = 12000
/** Prefixo que o canvas usa no id de sessão de PTY de cada terminal seu. */
const CANVAS_SESSION_PREFIX = 'canvas:'
/**
 * Debian 12+/Ubuntu 23.04+ (inclui a 24.04 LTS) recusam `pip install` fora de
 * venv com esse erro (PEP 668). Como a instalação já é `--user` — não mexe em
 * pacote de sistema —, repetir uma vez com `--break-system-packages` é seguro
 * e evita que a pessoa precise editar o comando na mão (achado de 28/08/2026).
 */
const EXTERNALLY_MANAGED_ENVIRONMENT_PATTERN = /externally-managed-environment/i
const BREAK_SYSTEM_PACKAGES_FLAG = '--break-system-packages'

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

async function installOfficialCli(
  id,
  {
    confirmed = false,
    runCommand = runBufferedCommand,
    detect = detectCli,
    platformName = platform.name,
  } = {},
) {
  const cli = getOfficialAiCli(id)

  if (!cli) {
    return {
      ok: false,
      message: 'CLI oficial desconhecida.',
    }
  }

  if (cli.install.requiresConfirmation && !confirmed) {
    return {
      ok: false,
      requiresConfirmation: true,
      message: `${cli.name} instala código remoto e exige confirmação explícita.`,
    }
  }

  const installCommand = getPlatformCommand(cli.install, platformName)
  let installResult = await runCommand({
    command: installCommand,
    args: cli.install.args,
    cwd: os.homedir(),
    env: createCliEnv(),
    timeoutMs: INSTALL_TIMEOUT_MS,
  })

  const retriedWithBreakSystemPackages =
    isExternallyManagedEnvironmentError(installResult) && isPipInstallCommand(cli.install.args)

  if (retriedWithBreakSystemPackages) {
    installResult = await runCommand({
      command: installCommand,
      args: [...cli.install.args, BREAK_SYSTEM_PACKAGES_FLAG],
      cwd: os.homedir(),
      env: createCliEnv(),
      timeoutMs: INSTALL_TIMEOUT_MS,
    })
  }

  const detection = await detect(cli, createCliEnv())

  return {
    ...installResult,
    message: composeInstallMessage(installResult, retriedWithBreakSystemPackages),
    retriedWithBreakSystemPackages,
    cli: createCatalogItem(cli, detection),
    models: cli.models.map((model) => ({ ...model })),
  }
}

/**
 * @param {{ ok?: boolean, stderr?: string }} result
 */
function isExternallyManagedEnvironmentError(result) {
  return (
    Boolean(result) &&
    result.ok === false &&
    EXTERNALLY_MANAGED_ENVIRONMENT_PATTERN.test(String(result.stderr ?? ''))
  )
}

/** @param {string[]} args */
function isPipInstallCommand(args) {
  return Array.isArray(args) && args.includes('pip') && args.includes('install')
}

/**
 * @param {{ ok?: boolean, message?: string }} installResult
 * @param {boolean} retriedWithBreakSystemPackages
 */
function composeInstallMessage(installResult, retriedWithBreakSystemPackages) {
  if (!retriedWithBreakSystemPackages) {
    return installResult.message
  }

  if (installResult.ok) {
    return 'Instalação concluída. O Python deste sistema bloqueia instalação fora de venv (PEP 668); repetimos automaticamente com --break-system-packages, sem mexer em nenhum pacote do sistema.'
  }

  return `Mesmo repetindo com --break-system-packages (o Python deste sistema bloqueia instalação fora de venv — PEP 668), a instalação falhou: ${installResult.message}`
}

function openOfficialCliLogin(
  id,
  { launchTerminal = launchCommandInTerminal, platformName = platform.name } = {},
) {
  const cli = getOfficialAiCli(id)

  if (!cli) {
    return {
      ok: false,
      message: 'CLI oficial desconhecida.',
    }
  }

  const result = launchTerminal({
    command: getPlatformCommand(cli.login, platformName),
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

/**
 * @param {string} id
 * @param {object} [dependencies]
 * @param {typeof runBufferedCommand} [dependencies.runCommand] - Injetável para teste.
 */
async function getOfficialCliAccountStatus(
  id,
  { runCommand = runBufferedCommand } = {},
) {
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
  const result = await runCommand({
    command,
    args: cli.accountSwitch.status.args,
    cwd: os.homedir(),
    env: createCliEnv(),
    timeoutMs: AUTH_COMMAND_TIMEOUT_MS,
  })
  const output = redactSecrets(
    `${result.stdout ?? ''}${result.stderr ?? ''}`,
  ).trim()
  const accountStatus = parseCodexAccountStatus(output)

  // `stdout`/`stderr` crus ficam neste processo. O renderer recebe o texto já
  // redigido e os campos que a CLI declarou — nada que precise ser filtrado de
  // novo do outro lado da ponte.
  return {
    ok: result.ok,
    ...accountStatus,
    statusCommand: cli.accountSwitch.status.label,
    output,
    message: output || result.message,
  }
}

/**
 * Sessões de terminal vivas que rodam a CLI cuja conta será trocada.
 *
 * Existe para que a confirmação de troca possa nomear o que está em risco em
 * vez de avisar genericamente. Um terminal ausente desta lista não é afetado;
 * um terminal presente pode perder a autorização no meio do trabalho.
 *
 * @param {string} id
 * @param {object} [dependencies]
 * @param {() => Array<{ sessionId: string, command: string | null, cwd?: string, startedAt?: number }>} [dependencies.listSessions]
 * @param {string} [dependencies.platformName]
 */
function listOfficialCliAccountSessions(
  id,
  { listSessions = () => [], platformName = platform.name } = {},
) {
  const cli = getOfficialAiCli(id)

  if (!cli) {
    return { ok: false, message: 'CLI oficial desconhecida.', sessions: [] }
  }

  const aliases = new Set(
    [cli.command, ...(platformName === 'win32' ? cli.windowsAliases ?? [] : [])].map(
      (alias) => alias.toLowerCase(),
    ),
  )
  const sessions = listSessions()
    .filter((session) => aliases.has(commandBasename(session.command)))
    .map((session) => ({
      sessionId: session.sessionId,
      // O canvas identifica cada terminal pelo id do elemento; o `canvas:` é
      // prefixo de transporte, e mostrar ele na UI não ajudaria ninguém.
      elementId: String(session.sessionId).startsWith(CANVAS_SESSION_PREFIX)
        ? String(session.sessionId).slice(CANVAS_SESSION_PREFIX.length)
        : null,
      cwd: session.cwd ?? '',
      startedAt: session.startedAt ?? null,
    }))

  return { ok: true, sessions }
}

/**
 * Nome do executável sem diretório nem extensão de shim do Windows.
 *
 * @param {unknown} command
 * @returns {string}
 */
function commandBasename(command) {
  const normalized = String(command ?? '')
    .trim()
    .replace(/\\/g, '/')
  const base = normalized.slice(normalized.lastIndexOf('/') + 1)

  return base.toLowerCase()
}

/**
 * Desconecta a conta atual e abre o login oficial para a próxima.
 *
 * Só executa com `confirmed === true`. O logout é destrutivo do ponto de vista
 * de quem está trabalhando — derruba a autorização que as sessões abertas
 * usam — e um clique acidental não pode ser suficiente para dispará-lo. A
 * confirmação é responsabilidade da UI, mas a recusa mora aqui: qualquer
 * chamador (IPC, teste, automação futura) passa pela mesma trava.
 *
 * @param {string} id
 * @param {object} [options]
 * @param {boolean} [options.confirmed] - Confirmação explícita de quem usa.
 * @param {typeof runBufferedCommand} [options.runCommand] - Injetável para teste.
 * @param {typeof openOfficialCliLogin} [options.openLogin] - Injetável para teste.
 */
async function switchOfficialCliAccount(
  id,
  {
    confirmed = false,
    runCommand = runBufferedCommand,
    openLogin = openOfficialCliLogin,
  } = {},
) {
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

  if (!confirmed) {
    return {
      ok: false,
      requiresConfirmation: true,
      message: `Troca de conta de ${cli.name} exige confirmação explícita.`,
    }
  }

  const command = getPlatformCommand(cli.accountSwitch.logout)
  const logoutResult = await runCommand({
    command,
    args: cli.accountSwitch.logout.args,
    cwd: os.homedir(),
    env: createCliEnv(),
    timeoutMs: AUTH_COMMAND_TIMEOUT_MS,
  })

  if (!logoutResult.ok) {
    return {
      ok: false,
      message: redactSecrets(logoutResult.message),
    }
  }

  const loginResult = openLogin(id)

  if (!loginResult.ok) {
    return {
      ...loginResult,
      message: redactSecrets(loginResult.message),
      loggedOut: true,
    }
  }

  return {
    ok: true,
    message: `Conta de ${cli.name} desconectada. Login oficial aberto no terminal.`,
    command: loginResult.command,
    args: loginResult.args,
    loggedOut: true,
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
    isLauncher: Boolean(cli.isLauncher),
    sourceOfTruth: cli.sourceOfTruth,
    modelSelection: cli.modelSelection,
    installRequiresConfirmation: Boolean(cli.install.requiresConfirmation),
    installUrl: cli.installUrl,
    authUrl: cli.authUrl,
    models: cli.models.map((model) => ({ ...model })),
  }
}

function getPlatformCommand(descriptor, platformName = platform.name) {
  if (platformName === 'win32' && descriptor.windowsCommand) {
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

module.exports = {
  createCatalogItem,
  getOfficialCliAccountStatus,
  installOfficialCli,
  listOfficialCliAccountSessions,
  listOfficialCliCatalog,
  openOfficialCliLogin,
  parseCodexLoginStatus,
  runBufferedCommand,
  switchOfficialCliAccount,
}
