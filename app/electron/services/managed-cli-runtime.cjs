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

/**
 * O `.cmd` é gravado em UTF-8, mas o `cmd.exe` o lê na página de código OEM do
 * console (cp850/cp437): um acento no caminho do executável (`C:\Users\João`)
 * virava "O sistema não pode encontrar o caminho especificado". O `chcp 65001`
 * antes da linha do comando faz o `cmd.exe` ler o resto do arquivo em UTF-8; a
 * página anterior (última palavra da saída do `chcp`, em qualquer idioma) e o
 * código de saída da CLI são guardados para restaurar e repassar no fim. O
 * `setlocal` impede que as variáveis vazem para um `cmd.exe` interativo.
 */
function createWindowsShim(commandParts) {
  const command = commandParts.map((part) => `"${part}"`).join(' ')

  return [
    '@echo off',
    `rem ${SHIM_HEADER}`,
    'setlocal',
    'set "FELIXO_CP="',
    'for /f "tokens=*" %%a in (\'chcp\') do for %%b in (%%a) do set "FELIXO_CP=%%b"',
    'chcp 65001 >nul',
    'set "ELECTRON_RUN_AS_NODE=1"',
    `${command} %*`,
    'set "FELIXO_RC=%errorlevel%"',
    'if defined FELIXO_CP chcp %FELIXO_CP% >nul',
    'exit /b %FELIXO_RC%',
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
  SHIM_HEADER,
  ensureManagedCliRuntime,
}
