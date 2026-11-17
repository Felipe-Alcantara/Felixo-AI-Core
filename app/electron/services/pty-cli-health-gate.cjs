'use strict'

/**
 * @module pty-cli-health-gate
 * Confere, antes de abrir um terminal de Claude ou Codex, se a CLI que vai
 * abrir está inteira. Sem isso a pessoa via o erro cru do sistema ("não é
 * compatível com a versão do Windows") quando a instalação ficou pela metade
 * e a reinstalação da abertura do app falhou ou ainda não rodou.
 *
 * - Cópia do app incompleta: dispara o reparo (a instalação automática, que
 *   ignora o registro de falhas). Se é ela que o terminal abriria, o terminal
 *   não abre e a mensagem diz o que está acontecendo.
 * - CLI do sistema com o executável quebrado: só avisa no terminal; o app não
 *   mexe nela fora da rodada de atualização do sistema.
 */

const path = require('node:path')
const fs = require('node:fs')
const { resolveCommandPath } = require('../core/cli-detector.cjs')
const { describeNativeExecutableProblem, inspectNativeExecutable } = require('../core/native-executable.cjs')
const { resolveProviderIdForCommand } = require('./pty-account-validation.cjs')

const CLI_NAMES = { claude: 'Claude', codex: 'Codex' }
/** Um reparo por CLI neste intervalo: abrir vários agentes não reinstala a cada um. */
const REPAIR_COOLDOWN_MS = 10 * 60 * 1000

/**
 * @param {object} options
 * @param {() => ({ inspectManaged: Function, run: Function, layout: { root: string } } | null)} options.getInstaller
 * @param {() => Record<string, string>} options.getEnv - PATH das CLIs (`createCliEnv`).
 * @returns {{ check: (request: { command?: string, providerId?: string }) => null | { block?: boolean, warn?: boolean, message: string } }}
 */
function createPtyCliHealthGate({
  getInstaller,
  getEnv,
  resolvePath = resolveCommandPath,
  inspect = inspectNativeExecutable,
  now = Date.now,
  platformName = process.platform,
  arch = process.arch,
  fileSystem = fs,
}) {
  const lastRepair = new Map()

  function startRepair(installer, providerId) {
    const last = lastRepair.get(providerId)
    if (last !== undefined && now() - last < REPAIR_COOLDOWN_MS) return
    lastRepair.set(providerId, now())
    // A instalação nunca derruba o spawn; o estado dela vai para a interface pelo status.
    Promise.resolve(installer.run('repair')).catch(() => {})
  }

  function check({ command, providerId } = {}) {
    const id = providerId ?? resolveProviderIdForCommand(command)
    const name = CLI_NAMES[id]
    const installer = name ? getInstaller() : null
    if (!installer || typeof command !== 'string' || !command.trim()) return null

    let resolved = null
    try {
      resolved = resolvePath(command, getEnv(), { platform: platformName }) || null
    } catch {
      resolved = null
    }
    const platformPath = platformName === 'win32' ? path.win32 : path
    const root = platformPath.resolve(installer.layout.root).toLowerCase()
    const isManaged = Boolean(resolved) && platformPath.resolve(resolved).toLowerCase().startsWith(root + platformPath.sep)

    const managed = installer.inspectManaged(id)
    if (managed.incomplete) {
      startRepair(installer, id)
      if (isManaged) {
        return {
          block: true,
          message: `A instalação do ${name} ficou incompleta; reinstalando. Abra este agente de novo em alguns instantes.`,
        }
      }
    }

    if (resolved && !isManaged && /\.exe$/i.test(resolved)) {
      const inspection = inspect(resolved, { platformName, arch, fileSystem })
      if (!inspection.ok) {
        return {
          warn: true,
          message: `O ${name} instalado no sistema está incompleto: ${describeNativeExecutableProblem(inspection.reason)}. O Felixo não mexe nele; reinstale-o pelo instalador oficial.`,
        }
      }
    }
    return null
  }

  return { check }
}

module.exports = { createPtyCliHealthGate }
