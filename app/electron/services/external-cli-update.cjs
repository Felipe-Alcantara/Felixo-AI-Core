'use strict'

/**
 * @module external-cli-update
 * Atualiza as CLIs de IA instaladas fora do npm global: instalador nativo do
 * Claude, Homebrew, pnpm e Volta.
 *
 * Por decisão da pessoa (25/11/2026), o app atualiza sozinho os quatro e confere
 * a versão no disco depois. A origem vem só do caminho do executável no PATH, sem
 * executar nada para descobrir. Quem desligou a atualização do Claude é
 * respeitado: nada é executado e o app avisa. A decisão de o que atualizar mora
 * em `planExternalUpdates`; aqui ficam os efeitos, todos injetáveis.
 *
 * Um comando por gerenciador, sem shell e sem pergunta (stdin fechado: um prompt
 * recebe fim de arquivo e falha em vez de travar).
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crossSpawn = require('cross-spawn')
const { INSTALL_TIMEOUT_MS, LATEST_LOOKUP_TIMEOUT_MS, runCommand } = require('./managed-cli-installer.cjs')
const { isTargetNewer } = require('./cli-auto-install-plan.cjs')
const { createSystemNpmEnv } = require('./system-cli-update.cjs')

/** Nome mostrado na pessoa para cada origem. */
const ORIGIN_LABELS = Object.freeze({
  native: 'instalador nativo',
  homebrew: 'Homebrew',
  pnpm: 'pnpm',
  volta: 'Volta',
})

const BUSY_OUTPUT = /\b(?:EBUSY|EPERM)\b/
const VERSION_PATTERN = /\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/

/** Uma variável de ambiente "ligada": preenchida e diferente de 0/false. */
function isTruthyFlag(value) {
  if (value === undefined || value === null) return false
  const text = String(value).trim().toLowerCase()
  return text !== '' && text !== '0' && text !== 'false'
}

function toSlashes(value, platformName) {
  const text = String(value).replace(/\\/g, '/').replace(/\/+$/, '')
  return platformName === 'win32' ? text.toLowerCase() : text
}

/**
 * A origem de um executável do PATH, pelo caminho. `null` para o que não é
 * destes gerenciadores (npm global, cópia do app, atalho de editor): nunca
 * atualizado por aqui.
 *
 * @returns {{ origin: 'native' | 'homebrew' | 'pnpm' | 'volta', cask?: string } | null}
 */
function classifyExecutable(filePath, { command, platformName, homeDir, env, realPath }) {
  const dir = toSlashes(path.dirname(filePath), platformName)
  const real = toSlashes(realPath ?? filePath, platformName)
  const home = toSlashes(homeDir, platformName)

  const voltaHome = env.VOLTA_HOME ? toSlashes(env.VOLTA_HOME, platformName) : null
  if (dir.endsWith('/.volta/bin') || dir.endsWith('/volta/bin') || (voltaHome && dir === `${voltaHome}/bin`)) {
    return { origin: 'volta' }
  }

  const pnpmHome = env.PNPM_HOME ? toSlashes(env.PNPM_HOME, platformName) : null
  if (dir.endsWith('/pnpm') || (pnpmHome && dir === pnpmHome)) return { origin: 'pnpm' }

  if (command === 'claude' && dir === `${home}/.local/bin` && !/\/(?:caskroom|cellar)\//.test(real)) {
    return { origin: 'native' }
  }

  const cask = real.match(/\/caskroom\/([^/]+)\//)
  if (cask || /\/cellar\//.test(real)) return { origin: 'homebrew', ...(cask ? { cask: cask[1] } : {}) }
  return null
}

/**
 * Todos os executáveis do comando no PATH, na ordem em que o terminal acha, que
 * pertencem a um dos gerenciadores. O mesmo arquivo por dois atalhos entra uma vez.
 */
function findExternalExecutables({
  command,
  aliases = [],
  env = process.env,
  platformName = process.platform,
  homeDir = os.homedir(),
  fileSystem = fs,
}) {
  const api = platformName === 'win32' ? path.win32 : path.posix
  const delimiter = platformName === 'win32' ? ';' : ':'
  const names = [...new Set([command, ...aliases])]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => api.basename(value).replace(/\.(?:cmd|exe|bat|ps1)$/i, ''))
  const extensions = platformName === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']
  const pathValue = env.PATH ?? env.Path ?? ''
  const seen = new Set()
  const found = []

  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    for (const name of names) {
      for (const extension of extensions) {
        const candidate = api.join(directory, `${name}${extension}`)
        let real
        try {
          if (!fileSystem.existsSync(candidate)) continue
          real = fileSystem.realpathSync(candidate)
        } catch {
          continue
        }
        const key = toSlashes(real, platformName)
        if (seen.has(key)) continue
        seen.add(key)
        const kind = classifyExecutable(candidate, { command, platformName, homeDir, env, realPath: real })
        if (kind) found.push({ ...kind, path: candidate })
      }
    }
  }
  return found
}

/**
 * Por que a pessoa travou as atualizações do Claude, ou `null` se não travou.
 * Lê o ambiente e `settings.json`/`settings.local.json` do usuário. O app nunca
 * passa por cima: é a escolha de quem quer manter uma versão fixa.
 */
function readClaudeUpdateLock({
  env = process.env,
  homeDir = os.homedir(),
  fileSystem = fs,
} = {}) {
  for (const key of ['DISABLE_UPDATES', 'DISABLE_AUTOUPDATER']) {
    if (isTruthyFlag(env[key])) return `${key} esta ligado no ambiente`
  }
  const configDir = env.CLAUDE_CONFIG_DIR || path.join(homeDir, '.claude')
  for (const file of ['settings.json', 'settings.local.json']) {
    let settings
    try {
      settings = JSON.parse(fileSystem.readFileSync(path.join(configDir, file), 'utf8'))
    } catch {
      continue
    }
    for (const key of ['DISABLE_UPDATES', 'DISABLE_AUTOUPDATER']) {
      if (isTruthyFlag(settings?.env?.[key])) return `${key} esta ligado em ${file}`
    }
    if (typeof settings?.minimumVersion === 'string' && settings.minimumVersion.trim()) {
      return `minimumVersion (${settings.minimumVersion.trim()}) esta definido em ${file}`
    }
  }
  return null
}

function createExternalEnv(env = process.env) {
  return { ...createSystemNpmEnv(env), NONINTERACTIVE: '1', HOMEBREW_NO_ENV_HINTS: '1', CI: '1' }
}

/** Versão que o próprio executável diz ter (`--version`), ou `null`. */
async function readExecutableVersion(file, { spawn = crossSpawn, env, platformName = process.platform, cwd = os.homedir() } = {}) {
  const result = await runCommand({
    command: file,
    args: ['--version'],
    env: env ?? createExternalEnv(),
    cwd,
    spawn,
    timeoutMs: LATEST_LOOKUP_TIMEOUT_MS,
    platformName,
    successMessage: 'Versao lida.',
    failureMessage: 'Nao foi possivel ler a versao.',
  })
  return result.ok ? (String(result.output ?? '').match(VERSION_PATTERN)?.[0] ?? null) : null
}

/**
 * As instalações da CLI fora do npm, com a versão de cada uma. Em CLI do Claude
 * carrega `locked` quando a pessoa desligou a atualização.
 *
 * @returns {Promise<Array<{ origin: string, label: string, path: string, version: string | null, cask?: string, locked?: string }>>}
 */
async function discoverExternalInstalls({
  cli,
  env = process.env,
  platformName = process.platform,
  homeDir = os.homedir(),
  fileSystem = fs,
  spawn = crossSpawn,
}) {
  const found = findExternalExecutables({
    command: cli.command,
    aliases: cli.windowsAliases,
    env,
    platformName,
    homeDir,
    fileSystem,
  })
  const locked = cli.id === 'claude' ? readClaudeUpdateLock({ env, homeDir, fileSystem }) : null
  const runEnv = createExternalEnv(env)
  return Promise.all(
    found.map(async (item) => ({
      ...item,
      label: ORIGIN_LABELS[item.origin],
      version: await readExecutableVersion(item.path, { spawn, env: runEnv, platformName, cwd: homeDir }),
      ...(locked ? { locked } : {}),
    })),
  )
}

/**
 * Atualiza uma instalação para `to` e confere a versão no executável da própria
 * instalação (não pelo PATH, que pode achar outra cópia).
 *
 * - Nativo e Homebrew existem só para o Claude; pnpm e Volta instalam o pacote do npm.
 * - Pré-lançamento no nativo: tenta `claude install <versão>`; se o canal nativo
 *   não tiver essa versão, cai em `claude update` e diz isso em `note`.
 * - Homebrew e `claude update` seguem o canal da instalação; ficar abaixo de `to`
 *   é dito em `note`, não é falha, desde que a versão tenha avançado.
 *
 * @returns {Promise<{ ok: boolean, busy: boolean, message: string, output: string, version: string | null, note?: string }>}
 */
async function updateExternalInstall({
  install,
  npmPackage,
  to,
  from = install.version,
  env = process.env,
  platformName = process.platform,
  homeDir = os.homedir(),
  spawn = crossSpawn,
}) {
  const runEnv = createExternalEnv(env)
  let output = ''
  let busy = false
  const run = async (command, args, label) => {
    const result = await runCommand({
      command,
      args,
      env: runEnv,
      cwd: homeDir,
      spawn,
      timeoutMs: INSTALL_TIMEOUT_MS,
      platformName,
      successMessage: `${label} terminou.`,
      failureMessage: `${label} falhou.`,
    })
    output = `${output}\n${result.output ?? ''}`.trim()
    if (!result.ok && BUSY_OUTPUT.test(String(result.output ?? ''))) busy = true
    return result
  }
  const readVersion = () => readExecutableVersion(install.path, { spawn, env: runEnv, platformName, cwd: homeDir })
  const outcome = (version, extra = {}) => ({ ok: false, busy, message: '', output, version, ...extra })
  const advanced = (version) => isTargetNewer(from, version)

  if (install.origin === 'pnpm' || install.origin === 'volta') {
    const spec = `${npmPackage}@${to}`
    const result =
      install.origin === 'pnpm'
        ? await run('pnpm', ['add', '--global', spec], `O pnpm (${spec})`)
        : await run('volta', ['install', spec], `O Volta (${spec})`)
    const version = await readVersion()
    if (result.ok && version === to) return outcome(version, { ok: true })
    return outcome(version, {
      message: result.ok
        ? `${ORIGIN_LABELS[install.origin]} terminou, mas a CLI continua em ${version ?? 'versao desconhecida'}.`
        : result.message,
    })
  }

  let note
  if (install.origin === 'native') {
    if (to.includes('-')) {
      await run(install.path, ['install', to], 'O instalador nativo')
      const version = await readVersion()
      if (version === to) return outcome(version, { ok: true })
      if (busy) return outcome(version, { message: 'O instalador nativo encontrou arquivos travados.' })
      note = `o canal nativo nao tem a ${to}; seguiu o canal da instalacao`
    }
    await run(install.path, ['update'], 'O claude update')
  } else {
    const cask = install.cask ?? 'claude-code'
    await run('brew', ['upgrade', '--cask', cask], `O Homebrew (${cask})`)
  }

  const version = await readVersion()
  if (version && advanced(version)) {
    return outcome(version, {
      ok: true,
      ...(version !== to ? { note: note ?? `o canal ${install.origin === 'native' ? 'nativo' : 'do Homebrew'} esta na ${version}, abaixo da ${to}` } : {}),
    })
  }
  return outcome(version, {
    message: busy
      ? `O ${ORIGIN_LABELS[install.origin]} encontrou arquivos travados.`
      : `${ORIGIN_LABELS[install.origin]} nao trouxe versao nova: a CLI continua em ${version ?? 'versao desconhecida'}.`,
  })
}

module.exports = {
  ORIGIN_LABELS,
  classifyExecutable,
  createExternalEnv,
  discoverExternalInstalls,
  findExternalExecutables,
  readClaudeUpdateLock,
  readExecutableVersion,
  updateExternalInstall,
}
