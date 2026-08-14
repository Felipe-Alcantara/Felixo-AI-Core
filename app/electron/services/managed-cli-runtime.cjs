/**
 * @module managed-cli-runtime
 * Cria os atalhos `node` e `npm` que fazem as CLIs instaladas funcionarem
 * numa máquina sem Node.
 *
 * As CLIs oficiais são pacotes npm cujo executável começa com
 * `#!/usr/bin/env node`: instalar o pacote não basta, alguém precisa
 * responder por `node` na hora de rodar. Aqui geramos scripts curtos que
 * apontam para o Node embutido no binário do Electron e ficam numa pasta do
 * app, adicionada ao fim do PATH das CLIs — quem já tem Node instalado
 * continua usando o seu.
 */

const fs = require('node:fs')
const path = require('node:path')

const SHIM_HEADER = 'Gerado pelo Felixo AI Core. Nao edite: e reescrito a cada abertura.'

/**
 * @param {object} options
 * @param {import('../core/managed-cli-paths.cjs').ManagedCliLayout} options.layout
 * @param {string} options.nodeExecutable - Binário que roda como Node.
 * @param {string | null} [options.npmCliPath] - `npm-cli.js` empacotado.
 * @param {string} [options.platformName]
 * @param {typeof fs} [options.fileSystem]
 * @returns {{ node: string, npm: string | null }} Caminhos dos atalhos criados.
 */
function ensureManagedCliRuntime({
  layout,
  nodeExecutable,
  npmCliPath = null,
  platformName = process.platform,
  fileSystem = fs,
}) {
  fileSystem.mkdirSync(layout.runtimeBin, { recursive: true })

  // Usa o `path` do platformName pedido, não o do SO onde o código roda: os
  // testes fixam `platformName` para checar o shim de cada plataforma, e
  // isso só funciona se o separador de caminho também respeitar essa escolha.
  const isWindows = platformName === 'win32'
  const platformPath = isWindows ? path.win32 : path.posix
  const nodeShim = platformPath.join(layout.runtimeBin, isWindows ? 'node.cmd' : 'node')

  writeShim(
    fileSystem,
    nodeShim,
    isWindows
      ? createWindowsShim([nodeExecutable])
      : createPosixShim([nodeExecutable]),
    isWindows,
  )

  if (!npmCliPath) {
    return { node: nodeShim, npm: null }
  }

  const npmShim = platformPath.join(layout.runtimeBin, isWindows ? 'npm.cmd' : 'npm')

  writeShim(
    fileSystem,
    npmShim,
    isWindows
      ? createWindowsShim([nodeExecutable, npmCliPath])
      : createPosixShim([nodeExecutable, npmCliPath]),
    isWindows,
  )

  return { node: nodeShim, npm: npmShim }
}

/**
 * `exec` para o atalho não deixar um shell extra vivo entre o app e a CLI —
 * senão o encerramento do processo pararia no shell e não chegaria na CLI.
 */
function createPosixShim(commandParts) {
  const command = commandParts.map((part) => `"${part}"`).join(' ')

  return ['#!/bin/sh', `# ${SHIM_HEADER}`, 'ELECTRON_RUN_AS_NODE=1', 'export ELECTRON_RUN_AS_NODE', `exec ${command} "$@"`, ''].join('\n')
}

function createWindowsShim(commandParts) {
  const command = commandParts.map((part) => `"${part}"`).join(' ')

  return [
    '@echo off',
    `rem ${SHIM_HEADER}`,
    'set "ELECTRON_RUN_AS_NODE=1"',
    `${command} %*`,
    '',
  ].join('\r\n')
}

function writeShim(fileSystem, shimPath, content, isWindows) {
  fileSystem.writeFileSync(shimPath, content, 'utf8')

  if (!isWindows) {
    fileSystem.chmodSync(shimPath, 0o755)
  }
}

module.exports = {
  ensureManagedCliRuntime,
}
