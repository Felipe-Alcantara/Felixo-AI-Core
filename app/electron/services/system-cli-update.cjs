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
 * Rede de segurança para arquivo travado. Uma CLI aberta não impede a troca: o
 * npm renomeia a pasta antiga e instala a nova ao lado, com o executável antigo
 * ainda rodando (medido no Windows em 14/10/2026 com o Claude Code real). Se
 * mesmo assim algum arquivo estiver preso, a falha é passageira e a próxima
 * tentativa resolve.
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
 * @param {string} [options.command] - Comando que o pacote deve expor no PATH.
 * @param {string[]} [options.aliases] - Aliases de executavel aceitos pela plataforma.
 * @param {string} [options.platformName]
 * @param {typeof fs} [options.fileSystem]
 * @returns {{ version: string | null, packageDir: string, executableReady?: boolean, executablePath?: string } | null}
 */
function readSystemNpmInstall({
  globalRoot,
  npmPackage,
  command,
  aliases = [],
  platformName = process.platform,
  fileSystem = fs,
}) {
  const packageDir = path.join(globalRoot, ...npmPackage.split('/'))
  try {
    const manifest = JSON.parse(fileSystem.readFileSync(path.join(packageDir, 'package.json'), 'utf8'))
    const install = { version: typeof manifest.version === 'string' ? manifest.version : null, packageDir }
    if (!command) return install

    const executablePath = findSystemNpmExecutable({
      globalRoot,
      command,
      aliases,
      platformName,
      fileSystem,
    })
    return {
      ...install,
      executableReady: Boolean(executablePath),
      ...(executablePath ? { executablePath } : {}),
    }
  } catch {
    return null
  }
}

/**
 * Procura o shim que o npm global deveria materializar para o pacote.
 *
 * O npm pode deixar o package.json atualizado e os arquivos temporarios
 * `.codex.cmd-*` no prefixo quando a troca do shim falha no Windows. Ler apenas
 * a versao do pacote nesse estado faz o atualizador acreditar que a CLI esta
 * pronta e nunca tentar reparar o comando.
 */
function findSystemNpmExecutable({ globalRoot, command, aliases = [], platformName, fileSystem = fs }) {
  const platformPath = platformName === 'win32' ? path.win32 : path.posix
  const binDirectories =
    platformName === 'win32'
      ? [
          platformPath.resolve(globalRoot, '..'),
          platformPath.resolve(globalRoot, '..', 'bin'),
        ]
      : [
          platformPath.resolve(globalRoot, '..', '..', 'bin'),
          platformPath.resolve(globalRoot, '..', 'bin'),
          platformPath.resolve(globalRoot, '..'),
        ]
  const names = [...new Set([command, ...aliases])]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => platformPath.basename(value).replace(/\.(?:cmd|exe|bat|ps1)$/i, ''))
  const extensions = platformName === 'win32' ? ['.cmd', '.exe', '.bat', '.ps1', ''] : ['']

  for (const directory of binDirectories) {
    for (const name of names) {
      for (const extension of extensions) {
        const candidate = platformPath.join(directory, `${name}${extension}`)
        try {
          if (fileSystem.existsSync(candidate)) return candidate
        } catch {
          // Uma pasta de PATH ilegivel nao invalida as outras candidatas.
        }
      }
    }
  }

  return null
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
  readSystemNpmInstall,
  resolveSystemNpmGlobalRoot,
}
