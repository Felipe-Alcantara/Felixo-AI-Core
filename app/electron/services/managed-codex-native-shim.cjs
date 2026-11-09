/**
 * @module managed-codex-native-shim
 * Faz o Codex abrir no Windows em máquina sem Node instalado.
 *
 * O `codex.cmd` que o npm gera chama `node codex.js`, e o `codex.js` só repassa
 * o terminal ao `codex.exe` nativo. Sem Node na máquina, o `node` que o PATH
 * das CLIs enxerga é o atalho do app (`runtime-bin\node.cmd`), que roda o
 * Electron como Node. O Electron é um executável de subsistema GUI: mesmo
 * recebendo os handles do console, ele e os filhos dele não reconhecem esses
 * handles como terminal (`process.stdin.isTTY` fica `undefined`, medido em
 * 09/11/2026 num ConPTY, com e sem repasse explícito dos handles). O
 * `codex.exe` então recusa subir a interface com `Error: stdin is not a
 * terminal` e o bloco do agente fecha com código 1.
 *
 * Não existe atalho de `node` que conserte isso, então este módulo tira o Node
 * do caminho: grava `native-bin\codex.cmd`, que abre o `codex.exe` direto. A
 * pasta entra no PATH antes da do npm (ver `getManagedCliPathCandidates`), e
 * tanto o agente do canvas quanto um `codex` digitado no Shell passam por ela.
 *
 * O atalho só existe enquanto precisa: com um Node de verdade no PATH o
 * `codex.js` oficial segue valendo, e quem tem Node não muda de comportamento.
 */

const fs = require('node:fs')
const path = require('node:path')
const { resolveCommandPath } = require('../core/cli-detector.cjs')
const { getManagedCliPlatformPackage } = require('../core/managed-cli-manifest.cjs')
const { SHIM_HEADER } = require('./managed-cli-runtime.cjs')

const SHIM_FILE_NAME = 'codex.cmd'

/** Subpasta do `vendor/` do pacote do Codex, por arquitetura do Windows. */
const CODEX_TARGET_TRIPLES = Object.freeze({
  x64: 'x86_64-pc-windows-msvc',
  arm64: 'aarch64-pc-windows-msvc',
})

/**
 * Onde está o `codex.exe` nativo dentro da instalação gerenciada.
 *
 * Mesma ordem em que o `codex.js` o procura: o pacote da plataforma aninhado
 * no pacote principal (como o npm o deixa no Windows), o içado para o nível de
 * cima e, por último, o `vendor/` dentro do próprio pacote principal.
 *
 * @param {object} options
 * @param {import('../core/managed-cli-paths.cjs').ManagedCliLayout} options.layout
 * @param {string} [options.arch]
 * @param {typeof fs} [options.fileSystem]
 * @returns {{ executable: string, packageRoot: string } | null}
 */
function findManagedCodexNativeBinary({ layout, arch = process.arch, fileSystem = fs }) {
  const triple = CODEX_TARGET_TRIPLES[arch]
  const platformPackage = getManagedCliPlatformPackage('codex', { platformName: 'win32', arch })
  if (!layout?.root || !triple || !platformPackage) {
    return null
  }

  const modules = path.win32.join(layout.root, 'node_modules')
  const packageRoot = path.win32.join(modules, '@openai', 'codex')
  const platformPackageParts = platformPackage.split('/')
  const packageDirectories = [
    path.win32.join(packageRoot, 'node_modules', ...platformPackageParts),
    path.win32.join(modules, ...platformPackageParts),
    packageRoot,
  ]

  for (const directory of packageDirectories) {
    const executable = path.win32.join(directory, 'vendor', triple, 'bin', 'codex.exe')
    if (safeExists(fileSystem, executable)) {
      return { executable, packageRoot }
    }
  }

  return null
}

/**
 * O `node` que o PATH das CLIs enxerga é o do app (ou não há nenhum)?
 *
 * É a pergunta que decide se o `codex.cmd` do npm funciona: ele chama `node`
 * pelo PATH, na mesma ordem do `cmd.exe`. Um `node` de verdade em qualquer
 * pasta anterior à `runtime-bin` vence o do app, que entra por último.
 *
 * @param {object} options
 * @param {string} options.effectivePath - PATH das CLIs, separado por `;`.
 * @param {import('../core/managed-cli-paths.cjs').ManagedCliLayout} options.layout
 * @param {(candidate: string) => boolean} [options.exists]
 * @returns {boolean}
 */
function isNodeProvidedByApp({ effectivePath, layout, exists = fs.existsSync }) {
  const nodePath = resolveCommandPath('node', { PATH: effectivePath }, { platform: 'win32', exists })

  if (!nodePath) {
    // Nem o do app: o `codex.cmd` do npm falharia do mesmo jeito.
    return true
  }

  return sameDirectory(path.win32.dirname(nodePath), layout?.runtimeBin)
}

/**
 * Texto do `codex.cmd` nativo.
 *
 * Os caminhos saem de `%~dp0` (a pasta do próprio atalho) e não do disco: o
 * `.cmd` é lido na página de código OEM, então um acento no perfil da pessoa
 * (`C:\Users\João`) corromperia um caminho gravado por extenso. As variáveis
 * são as que o `codex.js` do npm define para o executável nativo, e o
 * `setlocal` impede que elas vazem para um `cmd.exe` interativo.
 *
 * @param {object} options
 * @param {string} options.executableRelative - `codex.exe`, a partir da pasta do atalho.
 * @param {string} options.packageRootRelative - Pasta do `@openai/codex`, a partir da pasta do atalho.
 * @returns {string}
 */
function createCodexNativeShim({ executableRelative, packageRootRelative }) {
  return [
    '@echo off',
    `rem ${SHIM_HEADER}`,
    'rem O node do app (Electron) nao entrega um console ao Codex no Windows: pelo codex.cmd do npm',
    'rem ele falha com "stdin is not a terminal". Este atalho abre o executavel nativo, sem Node.',
    'setlocal',
    `for %%I in ("%~dp0${packageRootRelative}") do set "CODEX_MANAGED_PACKAGE_ROOT=%%~fI"`,
    'set "CODEX_MANAGED_BY_NPM=1"',
    `"%~dp0${executableRelative}" %*`,
    'exit /b %errorlevel%',
    '',
  ].join('\r\n')
}

/**
 * Deixa `native-bin\codex.cmd` como a situação pede: gravado quando falta Node
 * de verdade e o `codex.exe` está no disco, removido em qualquer outro caso.
 *
 * Idempotente e sem regravar o que já está certo: o `cmd.exe` lê o `.cmd` aos
 * poucos enquanto roda, e trocar o arquivo debaixo de um Codex aberto o
 * quebraria no meio.
 *
 * @param {object} options
 * @param {import('../core/managed-cli-paths.cjs').ManagedCliLayout} options.layout
 * @param {string} options.effectivePath - PATH das CLIs, separado por `;`.
 * @param {string} [options.platformName]
 * @param {string} [options.arch]
 * @param {typeof fs} [options.fileSystem]
 * @returns {{ action: 'none' | 'created' | 'updated' | 'unchanged' | 'removed', reason: string, shimPath?: string }}
 */
function ensureManagedCodexNativeShim({
  layout,
  effectivePath,
  platformName = process.platform,
  arch = process.arch,
  fileSystem = fs,
}) {
  if (platformName !== 'win32') {
    return { action: 'none', reason: 'so-windows' }
  }
  if (!layout?.nativeBin) {
    return { action: 'none', reason: 'sem-layout' }
  }

  const shimPath = path.win32.join(layout.nativeBin, SHIM_FILE_NAME)
  const binary = findManagedCodexNativeBinary({ layout, arch, fileSystem })

  if (!binary) {
    return { ...removeShim(fileSystem, layout, shimPath), reason: 'sem-codex-nativo' }
  }

  const exists = (candidate) => safeExists(fileSystem, candidate)
  if (!isNodeProvidedByApp({ effectivePath, layout, exists })) {
    return { ...removeShim(fileSystem, layout, shimPath), reason: 'node-real-no-path' }
  }

  const content = createCodexNativeShim({
    executableRelative: path.win32.relative(layout.nativeBin, binary.executable),
    packageRootRelative: path.win32.relative(layout.nativeBin, binary.packageRoot),
  })
  const current = readIfExists(fileSystem, shimPath)

  if (current === content) {
    return { action: 'unchanged', reason: 'sem-node-real', shimPath }
  }

  fileSystem.mkdirSync(layout.nativeBin, { recursive: true })
  fileSystem.writeFileSync(shimPath, content, 'utf8')

  return { action: current === null ? 'created' : 'updated', reason: 'sem-node-real', shimPath }
}

/** Apaga o atalho e a pasta, se ela ficar vazia. Falha de remoção fica para a próxima abertura. */
function removeShim(fileSystem, layout, shimPath) {
  if (!safeExists(fileSystem, shimPath)) {
    return { action: 'none' }
  }

  try {
    fileSystem.rmSync(shimPath, { force: true })
  } catch {
    // Um Codex aberto pode estar segurando o arquivo; a próxima abertura tenta de novo.
    return { action: 'none' }
  }

  try {
    fileSystem.rmdirSync(layout.nativeBin)
  } catch {
    // Pasta com outro conteúdo, ou já removida: o PATH só inclui a pasta que existe.
  }

  return { action: 'removed' }
}

function sameDirectory(left, right) {
  if (!left || !right) {
    return false
  }

  const normalize = (value) => path.win32.normalize(value).replace(/[\\/]+$/, '').toLowerCase()
  return normalize(left) === normalize(right)
}

function safeExists(fileSystem, candidate) {
  try {
    return Boolean(fileSystem.existsSync(candidate))
  } catch {
    return false
  }
}

function readIfExists(fileSystem, filePath) {
  try {
    return fileSystem.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

module.exports = {
  createCodexNativeShim,
  ensureManagedCodexNativeShim,
  findManagedCodexNativeBinary,
  isNodeProvidedByApp,
}
