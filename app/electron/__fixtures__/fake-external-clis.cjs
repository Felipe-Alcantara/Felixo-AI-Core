'use strict'

/**
 * Executáveis falsos de `claude`, `brew`, `pnpm` e `volta` numa pasta temporária,
 * para testar a atualização de CLIs fora do npm sem tocar em nenhum gerenciador
 * real. Cada um é um atalho (`.cmd` no Windows, `sh` no resto) que chama o
 * `fake-external-cli-main.cjs` com o Node do teste; o estado vive em `state.json`
 * e cada chamada entra em `calls.log`.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const MAIN = path.join(__dirname, 'fake-external-cli-main.cjs')

/**
 * @param {object} options
 * @param {string} options.dir - Pasta temporária do teste.
 * @param {string} options.version - Versão que o `claude` falso diz ter.
 * @param {string} [options.channelVersion] - Versão a que `update`/`brew upgrade` levam.
 * @param {string[]} [options.installable] - Versões que `claude install <v>` aceita.
 * @param {string[]} [options.tools] - Gerenciadores falsos a criar junto (`brew`, `pnpm`, `volta`).
 * @param {string} [options.claudeDir] - Pasta do `claude` falso (padrão: `dir/bin`).
 * @returns {{ claudePath: string, binDir: string, toolsDir: string, calls: () => string[], setVersion: (v: string) => void, readVersion: () => string }}
 */
function createFakeExternalClis({
  dir,
  version,
  channelVersion = version,
  installable = [],
  tools = [],
  claudeDir = path.join(dir, 'bin'),
}) {
  const statePath = path.join(dir, 'state.json')
  const logPath = path.join(dir, 'calls.log')
  const toolsDir = path.join(dir, 'tools')
  fs.mkdirSync(claudeDir, { recursive: true })
  fs.mkdirSync(toolsDir, { recursive: true })
  fs.writeFileSync(statePath, JSON.stringify({ version, channelVersion, installable }))
  fs.writeFileSync(logPath, '')

  const write = (folder, name, tool) => {
    const file = path.join(folder, process.platform === 'win32' ? `${name}.cmd` : name)
    const node = process.execPath
    const body =
      process.platform === 'win32'
        ? `@echo off\r\nset FAKE_TOOL=${tool}\r\nset FAKE_STATE=${statePath}\r\nset FAKE_LOG=${logPath}\r\n"${node}" "${MAIN}" %*\r\n`
        : `#!/bin/sh\nFAKE_TOOL=${tool} FAKE_STATE='${statePath}' FAKE_LOG='${logPath}' exec '${node}' '${MAIN}' "$@"\n`
    fs.writeFileSync(file, body, { mode: 0o755 })
    return file
  }

  const claudePath = write(claudeDir, 'claude', 'claude')
  for (const tool of tools) write(toolsDir, tool, tool)

  return {
    claudePath,
    binDir: claudeDir,
    toolsDir,
    calls: () => fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean),
    setVersion: (next) => {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
      fs.writeFileSync(statePath, JSON.stringify({ ...state, version: next }))
    },
    readVersion: () => JSON.parse(fs.readFileSync(statePath, 'utf8')).version,
  }
}

function tempDir(prefix = 'felixo-fake-clis-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

module.exports = { createFakeExternalClis, tempDir }
