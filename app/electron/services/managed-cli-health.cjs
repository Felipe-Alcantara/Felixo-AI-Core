'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
  getManagedCliPlatformPackage,
} = require('../core/managed-cli-manifest.cjs')

const CODEX_REINSTALL_COMMAND = 'npm install -g @openai/codex@latest'

/**
 * Confere se o pacote nativo que o manifesto exige foi materializado dentro
 * do prefixo gerenciado pelo app.
 *
 * O npm pode terminar com código 0 quando uma optionalDependency de plataforma
 * não foi baixada. O executável principal do Codex só descobre isso depois,
 * ao tentar iniciar — portanto a verificação precisa acontecer logo após a
 * instalação e também nas aberturas seguintes.
 *
 * @param {object} options
 * @param {string} options.providerId
 * @param {import('../core/managed-cli-paths.cjs').ManagedCliLayout} options.layout
 * @param {string} [options.platformName]
 * @param {string} [options.arch]
 * @param {typeof fs} [options.fileSystem]
 * @returns {{ ok: boolean, requiredPackage: string | null, packagePath: string | null, message?: string }}
 */
function verifyManagedCliInstallation({
  providerId,
  layout,
  platformName = process.platform,
  arch = process.arch,
  fileSystem = fs,
}) {
  const requiredPackage = getManagedCliPlatformPackage(providerId, {
    platformName,
    arch,
  })

  if (!requiredPackage) {
    return { ok: true, requiredPackage: null, packagePath: null }
  }

  const packagePath = path.join(
    layout.root,
    'node_modules',
    ...requiredPackage.split('/'),
  )
  const packageManifestPath = path.join(packagePath, 'package.json')

  if (safeExists(fileSystem, packageManifestPath)) {
    return { ok: true, requiredPackage, packagePath }
  }

  return {
    ok: false,
    requiredPackage,
    packagePath,
    // Preserve the wording emitted by @openai/codex so the person can search
    // for the same failure outside the app and see the actionable reinstall.
    message: `Missing optional dependency ${requiredPackage}. Reinstall Codex: ${CODEX_REINSTALL_COMMAND}`,
  }
}

function safeExists(fileSystem, candidate) {
  try {
    return fileSystem.existsSync(candidate)
  } catch {
    return false
  }
}

module.exports = {
  CODEX_REINSTALL_COMMAND,
  verifyManagedCliInstallation,
}
