'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
  getManagedCliPlatformPackage,
  getManagedCliManifestEntry,
} = require('../core/managed-cli-manifest.cjs')

const CODEX_REINSTALL_COMMAND = 'npm install -g @openai/codex@latest'

/**
 * Caminho do manifesto do pacote principal instalado pelo app.
 *
 * O binario sozinho nao informa se a copia gerenciada ficou antiga. A versao
 * confiavel para a rotina de atualizacao e a que o proprio npm gravou no
 * `package.json` do pacote dentro do prefixo gerenciado.
 *
 * @param {string} providerId
 * @param {import('../core/managed-cli-paths.cjs').ManagedCliLayout} layout
 * @returns {string | null}
 */
function getManagedCliPackageManifestPath(providerId, layout) {
  const entry = getManagedCliManifestEntry(providerId)
  if (!entry || !layout?.root) {
    return null
  }

  return path.join(layout.root, 'node_modules', ...entry.npmPackage.split('/'), 'package.json')
}

/**
 * Le a versao da CLI instalada pelo app, sem executar o binario.
 *
 * @param {object} options
 * @param {string} options.providerId
 * @param {import('../core/managed-cli-paths.cjs').ManagedCliLayout} options.layout
 * @param {typeof fs} [options.fileSystem]
 * @returns {string | null}
 */
function getManagedCliPackageVersion({ providerId, layout, fileSystem = fs }) {
  const packageManifestPath = getManagedCliPackageManifestPath(providerId, layout)
  if (!packageManifestPath) {
    return null
  }

  try {
    const manifest = JSON.parse(fileSystem.readFileSync(packageManifestPath, 'utf8'))
    return typeof manifest.version === 'string' ? manifest.version : null
  } catch {
    return null
  }
}

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
  getManagedCliPackageManifestPath,
  getManagedCliPackageVersion,
  verifyManagedCliInstallation,
}
