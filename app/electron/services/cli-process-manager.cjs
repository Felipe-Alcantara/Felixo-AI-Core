const spawnChildProcess = require('cross-spawn')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const platform = require('../core/platform/index.cjs')
const { getNvmNodeBinCandidates } = require('../core/platform/nvm.cjs')
const { getAppPaths } = require('../core/app-paths.cjs')
const {
  getManagedCliLayout,
  getManagedCliPathCandidates,
} = require('../core/managed-cli-paths.cjs')

const CLI_PATHS_ENV_KEY = 'FELIXO_CLI_PATHS'

class CliProcessManager {
  constructor() {
    this.processes = new Map()
  }

  spawn(sessionId, command, args = [], cwd = process.cwd(), options = {}) {
    this.kill(sessionId)
    const env = createCliEnv()

    const childProcess = spawnChildProcess(command, args, {
      cwd,
      detached: platform.shouldDetachProcess(),
      env,
      stdio: [options.openStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    const entry = {
      childProcess,
      killTimer: null,
    }

    this.processes.set(sessionId, entry)

    childProcess.once('exit', () => this.cleanup(sessionId, childProcess))
    childProcess.once('close', () => this.cleanup(sessionId, childProcess))

    return childProcess
  }

  get(sessionId) {
    const childProcess = this.processes.get(sessionId)?.childProcess

    if (!childProcess || childProcess.exitCode !== null) {
      return null
    }

    return childProcess
  }

  has(sessionId) {
    return Boolean(this.get(sessionId))
  }

  write(sessionId, input) {
    const entry = this.processes.get(sessionId)
    const stdin = entry?.childProcess?.stdin

    if (!stdin || stdin.destroyed || stdin.writableEnded) {
      return false
    }

    stdin.write(input)
    return true
  }

  kill(sessionId, options = {}) {
    const entry = this.processes.get(sessionId)

    if (!entry) {
      return false
    }

    const { childProcess } = entry

    if (childProcess.exitCode !== null) {
      this.cleanup(sessionId, childProcess)
      return true
    }

    const signal = options.force ? 'SIGKILL' : 'SIGTERM'

    if (!childProcess.killed || options.force) {
      platform.killProcess(childProcess, signal)
    }

    if (options.force) {
      this.cleanup(sessionId, childProcess)
      return true
    }

    if (!entry.killTimer) {
      entry.killTimer = setTimeout(() => {
        if (childProcess.exitCode === null) {
          platform.killProcess(childProcess, 'SIGKILL')
        }
      }, 5000)
    }

    return true
  }

  killAll(options = {}) {
    for (const sessionId of this.processes.keys()) {
      this.kill(sessionId, options)
    }
  }

  cleanup(sessionId, childProcess) {
    const entry = this.processes.get(sessionId)

    if (!entry || entry.childProcess !== childProcess) {
      return
    }

    if (entry.killTimer) {
      clearTimeout(entry.killTimer)
    }

    this.processes.delete(sessionId)
  }
}

/**
 * De onde veio cada pasta do PATH que as CLIs enxergam. A ordem do objeto é a
 * ordem em que as pastas entram — e a primeira que tem o comando vence.
 */
const CLI_PATH_ORIGINS = Object.freeze({
  CONFIGURED: 'configurada',
  USER: 'usuario',
  SYSTEM: 'sistema',
  PROCESS: 'processo',
  APP: 'app',
  MANAGED: 'gerenciada',
})

/**
 * PATH que as CLIs enxergam, pasta por pasta, com a origem de cada uma.
 *
 * É a lista que `createCliEnv` junta, na mesma ordem e com o mesmo corte:
 * pasta repetida fica só na primeira posição e pasta que não existe sai. O
 * diagnóstico de CLI mostra esta lista para explicar "funciona no meu
 * terminal, mas o app não vê" — por isso ela é a fonte única, e não uma cópia
 * da regra. Só lê: nada aqui altera o PATH real.
 *
 * @param {Record<string, string | undefined>} [baseEnv]
 * @returns {Array<{ position: number, origin: string, path: string }>}
 */
function describeCliPath(baseEnv = process.env) {
  const seen = new Set()
  const entries = []

  for (const part of collectCliPathParts(baseEnv)) {
    if (!part.path || seen.has(part.path)) {
      continue
    }

    seen.add(part.path)

    if (directoryExists(part.path)) {
      entries.push({ position: entries.length + 1, origin: part.origin, path: part.path })
    }
  }

  return entries
}

function createCliEnv(baseEnv = process.env) {
  const pathKey = platform.getPathEnvKey(baseEnv)
  const nextEnv = { ...baseEnv }
  const nextPath = describeCliPath(baseEnv)
    .map((entry) => entry.path)
    .join(path.delimiter)

  nextEnv[pathKey] = nextPath

  if (pathKey !== 'PATH' && !Object.prototype.hasOwnProperty.call(nextEnv, 'PATH')) {
    nextEnv.PATH = nextPath
  }

  return nextEnv
}

function collectCliPathParts(baseEnv) {
  const pathKey = platform.getPathEnvKey(baseEnv)
  const tag = (origin) => (candidate) => ({ origin, path: candidate })
  const home = baseEnv.HOME || baseEnv.USERPROFILE || os.homedir()

  return [
    ...getConfiguredCliPaths(baseEnv).map(tag(CLI_PATH_ORIGINS.CONFIGURED)),
    ...(home ? getHomeCliPathCandidates(baseEnv, home) : []).map(tag(CLI_PATH_ORIGINS.USER)),
    ...platform.getSystemCliPaths().map(tag(CLI_PATH_ORIGINS.SYSTEM)),
    ...(baseEnv[pathKey] ?? '')
      .split(path.delimiter)
      .filter(Boolean)
      .map(tag(CLI_PATH_ORIGINS.PROCESS)),
    // As ferramentas do próprio app (`felixo`) vêm depois do PATH da pessoa:
    // se ela já tem um comando com esse nome, é o dela que roda.
    ...getAgentCommandPaths(baseEnv).map(tag(CLI_PATH_ORIGINS.APP)),
    // Por último de propósito: as CLIs instaladas pelo próprio app são rede
    // de segurança para quem não tem nada instalado. Se a pessoa já tem a
    // sua, é a dela que deve rodar.
    ...getManagedCliPaths(baseEnv).map(tag(CLI_PATH_ORIGINS.MANAGED)),
  ]
}

/**
 * Pasta do comando `felixo` exposto aos agentes nos terminais do canvas.
 *
 * Silencia falha pelo mesmo motivo de `getManagedCliPaths`: sem Electron (nos
 * testes e em scripts) não há `userData`, e isso não pode impedir o PATH normal
 * de ser montado.
 *
 * @returns {string[]}
 */
function getAgentCommandPaths(environment = process.env) {
  try {
    return [getAppPaths({ environment }).bin]
  } catch {
    return []
  }
}

/**
 * Pastas das CLIs que o app instalou por conta própria.
 *
 * Silencia falha de propósito: sem Electron (testes, scripts) não há
 * `userData` a resolver, e isso não pode impedir o PATH normal de ser montado.
 */
function getManagedCliPaths(env) {
  try {
    const { userData } = getAppPaths()
    return getManagedCliPathCandidates(getManagedCliLayout({ userData, env }))
  } catch {
    return []
  }
}

function getConfiguredCliPaths(env) {
  return splitPathList(env[CLI_PATHS_ENV_KEY])
}

/** Pastas de CLI dentro da pasta pessoal: instalação do usuário, pip --user e gerenciadores de versão do Node. */
function getHomeCliPathCandidates(env, home) {
  return [
    ...platform.getUserCliPaths(home),
    ...getPythonUserScriptPaths(env, home),
    ...getVersionManagerCliPaths(env, home),
  ]
}

/**
 * Pip --user não usa exatamente o mesmo diretório em todos os sistemas:
 * Linux costuma usar ~/.local/bin, enquanto macOS e Windows incluem a versão
 * do Python no caminho. O catálogo do Openia instala nesse escopo do usuário;
 * descobrir essas pastas aqui faz o comando aparecer tanto na detecção quanto
 * no PTY sem alterar a configuração da pessoa.
 */
function getPythonUserScriptPaths(env, home) {
  if (platform.name === 'darwin') {
    return getInstalledVersionBinCandidates(path.join(home, 'Library', 'Python'), [
      'bin',
    ])
  }

  if (platform.name === 'win32') {
    const roots = uniqueStrings([
      env.APPDATA && path.join(env.APPDATA, 'Python'),
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Python'),
      path.join(home, 'AppData', 'Roaming', 'Python'),
    ])

    return roots.flatMap((root) =>
      getInstalledVersionBinCandidates(root, ['Scripts']),
    )
  }

  return []
}

function getVersionManagerCliPaths(env, home) {
  const nvmHome = env.NVM_DIR || path.join(home, '.nvm')
  const fnmHomes = uniqueStrings([
    env.FNM_DIR,
    path.join(home, '.local', 'share', 'fnm'),
    path.join(home, '.fnm'),
  ])
  const asdfHome = env.ASDF_DATA_DIR || path.join(home, '.asdf')
  const miseHome = env.MISE_DATA_DIR || path.join(home, '.local', 'share', 'mise')
  const nodenvHome = env.NODENV_ROOT || path.join(home, '.nodenv')
  const voltaHome = env.VOLTA_HOME || path.join(home, '.volta')

  return [
    path.join(voltaHome, 'bin'),
    path.join(asdfHome, 'shims'),
    path.join(miseHome, 'shims'),
    path.join(nodenvHome, 'shims'),
    ...getNvmNodeBinCandidates(path.join(nvmHome, 'versions', 'node')),
    ...fnmHomes.flatMap((fnmHome) => [
      ...getInstalledVersionBinCandidates(
        path.join(fnmHome, 'node-versions'),
        ['installation', 'bin'],
      ),
      ...getInstalledVersionBinCandidates(path.join(fnmHome, 'node-versions'), [
        'bin',
      ]),
    ]),
    ...getInstalledVersionBinCandidates(
      path.join(asdfHome, 'installs', 'nodejs'),
      ['bin'],
    ),
    ...getInstalledVersionBinCandidates(
      path.join(miseHome, 'installs', 'node'),
      ['bin'],
    ),
    ...getInstalledVersionBinCandidates(path.join(nodenvHome, 'versions'), ['bin']),
  ]
}

function getInstalledVersionBinCandidates(versionsPath, suffixParts) {
  try {
    return fs
      .readdirSync(versionsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(versionsPath, entry.name, ...suffixParts))
      .filter((candidate) => directoryExists(candidate))
      .sort()
      .reverse()
  } catch {
    return []
  }
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))]
}

function splitPathList(value) {
  return String(value ?? '')
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean)
}

function directoryExists(candidate) {
  try {
    return fs.statSync(candidate).isDirectory()
  } catch {
    return false
  }
}

module.exports = {
  CLI_PATH_ORIGINS,
  CliProcessManager,
  createCliEnv,
  describeCliPath,
}
