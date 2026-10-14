'use strict'

/**
 * @module system-cli-update
 * Atualiza a instalação de uma CLI feita pelo npm global do sistema, fora do app.
 *
 * Por decisão da pessoa, a CLI instalada no sistema acompanha a mesma versão-alvo
 * da cópia que o app mantém. Só o npm global entra: é o único instalador cujo
 * pacote e versão dá para ler do disco e atualizar com o mesmo comando em
 * qualquer sistema. Instalação nativa, Homebrew, pnpm ou Volta ficam como estão.
 *
 * O npm usado aqui é o do sistema (o do PATH da pessoa), não o que vem com o app:
 * é ele que sabe onde fica o prefixo global dela. A decisão do que atualizar mora
 * em `cli-auto-install-plan`; aqui ficam só os efeitos, todos injetáveis.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crossSpawn = require('cross-spawn')
const { INSTALL_TIMEOUT_MS, LATEST_LOOKUP_TIMEOUT_MS, runCommand } = require('./managed-cli-installer.cjs')

/** Variáveis que o app usa para dirigir o npm gerenciado e não podem vazar para o do sistema. */
const MANAGED_NPM_KEYS = ['npm_config_prefix', 'npm_config_global', 'NPM_CONFIG_PREFIX', 'ELECTRON_RUN_AS_NODE']

/**
 * No Windows um executável aberto não pode ser substituído. Falhas assim são
 * passageiras: a CLI está em uso por um agente, e a próxima tentativa resolve.
 */
const BUSY_OUTPUT = /\b(?:EBUSY|EPERM)\b/

/**
 * Ambiente do npm do sistema: o da pessoa, sem o que o app usa para fixar o
 * prefixo da cópia gerenciada.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, string>}
 */
function createSystemNpmEnv(env = process.env) {
  const result = { ...env }
  for (const key of MANAGED_NPM_KEYS) delete result[key]
  result.npm_config_update_notifier = 'false'
  return result
}

/**
 * A pasta `node_modules` global do npm do sistema, ou `null` quando não há npm
 * do sistema ou quando ela é a própria pasta do app (não há instalação de fora).
 *
 * @param {object} options
 * @param {string} options.managedRoot - Raiz da cópia gerenciada pelo app.
 * @param {Function} [options.spawn]
 * @param {Record<string, string>} [options.env]
 * @param {string} [options.platformName]
 * @param {typeof fs} [options.fileSystem]
 * @returns {Promise<string | null>}
 */
async function resolveSystemNpmGlobalRoot({
  managedRoot,
  spawn = crossSpawn,
  env = createSystemNpmEnv(),
  platformName = process.platform,
  fileSystem = fs,
}) {
  const result = await runCommand({
    command: 'npm',
    args: ['root', '--global'],
    env,
    // A pasta pessoal: a da cópia do app pode não existir ainda, e um .npmrc de
    // projeto na pasta de trabalho poderia mandar o npm para outro registry.
    cwd: os.homedir(),
    spawn,
    timeoutMs: LATEST_LOOKUP_TIMEOUT_MS,
    platformName,
    successMessage: 'Pasta global do npm do sistema encontrada.',
    failureMessage: 'O npm do sistema nao respondeu.',
  })
  if (!result.ok) return null

  const root = String(result.output ?? '').trim().split(/\r?\n/).pop()?.trim()
  if (!root || !path.isAbsolute(root) || !safeExists(fileSystem, root)) return null
  if (isInside(root, managedRoot, platformName) || isInside(managedRoot, root, platformName)) return null
  return root
}

/**
 * A instalação de um pacote no npm global do sistema, lida do disco.
 *
 * @param {object} options
 * @param {string} options.globalRoot
 * @param {string} options.npmPackage - Ex.: `@anthropic-ai/claude-code`.
 * @param {typeof fs} [options.fileSystem]
 * @returns {{ version: string | null, packageDir: string } | null}
 */
function readSystemNpmInstall({ globalRoot, npmPackage, fileSystem = fs }) {
  const packageDir = path.join(globalRoot, ...npmPackage.split('/'))
  try {
    const manifest = JSON.parse(fileSystem.readFileSync(path.join(packageDir, 'package.json'), 'utf8'))
    return { version: typeof manifest.version === 'string' ? manifest.version : null, packageDir }
  } catch {
    return null
  }
}

/**
 * Os executáveis em execução, para saber se uma CLI está aberta por um agente.
 *
 * Só o Windows trava o executável em uso; no Linux e no macOS o arquivo pode ser
 * trocado com o processo rodando, então a lista vazia basta. `null` quando a
 * lista não pôde ser lida: quem chama segue e trata a falha de arquivo em uso
 * se ela acontecer.
 *
 * @param {object} [options]
 * @param {Function} [options.spawn]
 * @param {string} [options.platformName]
 * @returns {Promise<string[] | null>}
 */
async function listRunningExecutables({ spawn = crossSpawn, platformName = process.platform } = {}) {
  if (platformName !== 'win32') return []
  const result = await runCommand({
    command: 'powershell.exe',
    args: [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-CimInstance Win32_Process | ForEach-Object { $_.ExecutablePath }',
    ],
    env: process.env,
    cwd: process.cwd(),
    spawn,
    timeoutMs: LATEST_LOOKUP_TIMEOUT_MS,
    platformName,
    successMessage: 'Processos listados.',
    failureMessage: 'Nao foi possivel listar os processos.',
  })
  if (!result.ok) return null
  return String(result.output ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

/**
 * Algum processo em execução roda um executável de dentro desta instalação?
 *
 * @param {string | null | undefined} packageDir
 * @param {string[] | null} executables
 * @param {string} [platformName]
 * @returns {boolean}
 */
function isInstallInUse(packageDir, executables, platformName = process.platform) {
  if (!packageDir || !Array.isArray(executables)) return false
  return executables.some((executable) => isInside(executable, packageDir, platformName))
}

/**
 * Instala uma versão exata no npm global do sistema.
 *
 * `--prefer-online`: a versão acabou de vir do registry, e a lista de versões
 * guardada no cache do npm pode ser de antes da publicação dela (ETARGET).
 *
 * @param {object} options
 * @param {string} options.npmPackage - Com versão, ex.: `@anthropic-ai/claude-code@2.1.300`.
 * @param {string} options.cwd
 * @param {Function} [options.spawn]
 * @param {Record<string, string>} [options.env]
 * @param {string} [options.platformName]
 * @returns {Promise<{ ok: boolean, busy: boolean, message: string, output: string }>}
 */
async function installSystemNpmPackage({
  npmPackage,
  cwd,
  spawn = crossSpawn,
  env = createSystemNpmEnv(),
  platformName = process.platform,
}) {
  const result = await runCommand({
    command: 'npm',
    args: ['install', '--global', '--prefer-online', '--no-audit', '--no-fund', '--loglevel=error', npmPackage],
    env,
    cwd,
    spawn,
    timeoutMs: INSTALL_TIMEOUT_MS,
    platformName,
    successMessage: `${npmPackage} instalado no npm global do sistema.`,
    failureMessage: `Nao foi possivel atualizar ${npmPackage} no npm global do sistema.`,
  })
  return { ...result, busy: !result.ok && BUSY_OUTPUT.test(String(result.output ?? '')) }
}

function isInside(candidate, parent, platformName) {
  if (!candidate || !parent) return false
  const api = platformName === 'win32' ? path.win32 : path.posix
  const normalize = (value) => {
    const resolved = api.resolve(value)
    return platformName === 'win32' ? resolved.toLowerCase() : resolved
  }
  const child = normalize(candidate)
  const base = normalize(parent)
  return child === base || child.startsWith(`${base}${api.sep}`)
}

function safeExists(fileSystem, candidate) {
  try {
    return fileSystem.existsSync(candidate)
  } catch {
    return false
  }
}

module.exports = {
  createSystemNpmEnv,
  installSystemNpmPackage,
  isInstallInUse,
  listRunningExecutables,
  readSystemNpmInstall,
  resolveSystemNpmGlobalRoot,
}
