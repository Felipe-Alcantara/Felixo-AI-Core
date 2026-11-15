'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
  getManagedCliPlatformPackage,
  getManagedCliManifestEntry,
} = require('../core/managed-cli-manifest.cjs')
const {
  describeNativeExecutableProblem,
  inspectNativeExecutable,
} = require('../core/native-executable.cjs')

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

  return path.join(getManagedNodeModules(layout), ...entry.npmPackage.split('/'), 'package.json')
}

/** `layout.nodeModules` (POSIX: `lib/node_modules`); layouts montados à mão caem no do Windows. */
function getManagedNodeModules(layout) {
  return layout.nodeModules ?? path.join(layout.root, 'node_modules')
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
 * Confere se a cópia gerenciada abre: o pacote nativo que o manifesto exige
 * existe e o executável que o terminal roda é um programa inteiro deste sistema.
 *
 * O npm pode terminar com código 0 com a instalação incompleta: sem a
 * optionalDependency da plataforma (Codex), com o placeholder de texto no lugar
 * do `bin/claude.exe` (o `postinstall` não rodou) ou com um binário cortado por
 * uma extração interrompida. Nos três casos o `package.json` mostra a versão
 * nova, e o erro só aparecia ao abrir o terminal ("não é compatível com a
 * versão do Windows"). A verificação roda depois de instalar e a cada abertura.
 *
 * @param {object} options
 * @param {string} options.providerId
 * @param {import('../core/managed-cli-paths.cjs').ManagedCliLayout} options.layout
 * @param {string} [options.platformName]
 * @param {string} [options.arch]
 * @param {typeof fs} [options.fileSystem]
 * @returns {{ ok: boolean, requiredPackage: string | null, packagePath: string | null, reason?: string, message?: string }}
 */
function verifyManagedCliInstallation({
  providerId,
  layout,
  platformName = process.platform,
  arch = process.arch,
  fileSystem = fs,
}) {
  return verifyCliPackage({
    providerId,
    nodeModules: getManagedNodeModules(layout),
    platformName,
    arch,
    fileSystem,
  })
}

/**
 * A mesma conferência para qualquer pasta `node_modules` global: a do app ou a
 * do npm do sistema (`npm root -g`).
 */
function verifyCliPackage({
  providerId,
  nodeModules,
  platformName = process.platform,
  arch = process.arch,
  fileSystem = fs,
}) {
  const requiredPackage = getManagedCliPlatformPackage(providerId, {
    platformName,
    arch,
  })
  const mainPackage = getManagedCliManifestEntry(providerId)?.npmPackage
  const mainPath = mainPackage ? path.join(nodeModules, ...mainPackage.split('/')) : null
  let packagePath = null

  if (requiredPackage) {
    // Mesma ordem em que o Node resolve o `require` feito pelo pacote principal:
    // primeiro dentro dele, depois no nível de cima do prefixo. O npm instala o
    // pacote da plataforma aninhado em algumas versões (visto no Codex 0.150.1
    // no Windows); procurar só em cima reprovava uma instalação que funciona.
    const hoistedPath = path.join(nodeModules, ...requiredPackage.split('/'))
    const candidates = [
      ...(mainPath ? [path.join(mainPath, 'node_modules', ...requiredPackage.split('/'))] : []),
      hoistedPath,
    ]
    packagePath =
      candidates.find((candidate) => safeExists(fileSystem, path.join(candidate, 'package.json'))) ?? null

    if (!packagePath) {
      return {
        ok: false,
        requiredPackage,
        packagePath: hoistedPath,
        // Preserve the wording emitted by @openai/codex so the person can search
        // for the same failure outside the app and see the actionable reinstall.
        message: `Missing optional dependency ${requiredPackage}. Reinstall Codex: ${CODEX_REINSTALL_COMMAND}`,
      }
    }
  }

  const executable = getNativeExecutablePath({ providerId, mainPath, packagePath, platformName, arch })
  if (!executable) {
    return { ok: true, requiredPackage, packagePath }
  }

  const inspection = inspectNativeExecutable(executable, { platformName, arch, fileSystem })
  if (inspection.ok) {
    return { ok: true, requiredPackage, packagePath }
  }

  // Caminho relativo ao `node_modules`: a mensagem vai para a interface e o log
  // sem o nome do usuário que o caminho absoluto carrega.
  const shownPath = path.relative(nodeModules, executable).split(path.sep).join('/')
  return {
    ok: false,
    requiredPackage,
    packagePath,
    reason: inspection.reason,
    message: `${mainPackage}: ${describeNativeExecutableProblem(inspection.reason)} (${shownPath}: ${inspection.detail}).`,
  }
}

/**
 * O programa que o terminal abre de fato, para as CLIs que têm um.
 *
 * - Claude Code: o `postinstall` copia o binário da plataforma por cima do
 *   placeholder `bin/claude.exe`, o mesmo nome em todo sistema (é o `bin` do
 *   package.json).
 * - Codex: `vendor/<alvo>/bin/codex(.exe)` dentro do pacote da plataforma, o
 *   caminho que o `bin/codex.js` procura.
 * - Gemini: JavaScript puro, sem binário nativo.
 */
function getNativeExecutablePath({ providerId, mainPath, packagePath, platformName, arch }) {
  if (providerId === 'claude' && mainPath) {
    return path.join(mainPath, 'bin', 'claude.exe')
  }
  const triple = CODEX_TARGET_TRIPLES[platformName]?.[arch]
  if (providerId === 'codex' && packagePath && triple) {
    return path.join(packagePath, 'vendor', triple, 'bin', platformName === 'win32' ? 'codex.exe' : 'codex')
  }
  return null
}

/** Os alvos do `bin/codex.js` (`targetTriple`), por sistema e arquitetura. */
const CODEX_TARGET_TRIPLES = Object.freeze({
  win32: { x64: 'x86_64-pc-windows-msvc', arm64: 'aarch64-pc-windows-msvc' },
  linux: { x64: 'x86_64-unknown-linux-musl', arm64: 'aarch64-unknown-linux-musl' },
  darwin: { x64: 'x86_64-apple-darwin', arm64: 'aarch64-apple-darwin' },
})

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
  verifyCliPackage,
  verifyManagedCliInstallation,
}
