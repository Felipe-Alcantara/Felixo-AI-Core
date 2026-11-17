/**
 * @module agent-models/agent-model-runner
 * Executa uma CLI de agente e devolve stdout+stderr juntos.
 *
 * No Windows o `execFile('claude')` sem shell não acha o atalho do npm
 * (`claude.cmd`/`claude.ps1`): dava ENOENT em 50 de 50 rodadas. Aqui o
 * executável é resolvido como o resto do app faz: o `claude.exe` por trás do
 * atalho para o Claude (sem shell, `argv` puro), o caminho do `PATH` do app
 * (a mesma CLI que o terminal abre) para os demais, `cmd.exe` com o caminho
 * entre aspas para `.cmd` e PowerShell para `.ps1`. Fora do Windows o
 * comportamento é o de sempre.
 *
 * As duas correntes são unidas de propósito: algumas CLIs escrevem a listagem
 * em stderr, e outras saem com código != 0 mesmo tendo impresso a lista. Só
 * uma saída totalmente vazia conta como falha.
 */

const { execFile } = require('node:child_process')
const { resolveCommandPath } = require('../../core/cli-detector.cjs')
const platformAdapters = require('../../core/platform/index.cjs')
const { resolveNativeClaude } = require('../cloud-session/cloud-session-executable.cjs')

/** Argumentos entram na linha do `cmd.exe`: só os de forma conhecida passam. */
const SAFE_SHELL_ARG = /^[\w./=-]+$/

function createWindowsLaunch(command, args, env, deps) {
  if (command === 'claude') {
    const nativo = deps.resolveNativeClaude({ platformName: 'win32', env })
    if (!nativo.viaShell) {
      return { file: nativo.command, args, options: {} }
    }
  }

  const resolved = deps.resolveCommandPath(command, env, { platform: 'win32' })
  if (!resolved) {
    throw Object.assign(new Error(`${command} não encontrado no PATH.`), { code: 'ENOENT' })
  }

  const adapter = deps.adapter
  if (adapter.isPowerShellScript(resolved)) {
    const launch = adapter.createPowerShellScriptLaunch(resolved, args, env)
    if (!launch) {
      throw Object.assign(new Error('PowerShell não encontrado para rodar o .ps1.'), { code: 'ENOENT' })
    }
    return { file: launch.command, args: launch.args, options: {} }
  }

  if (/\.(?:cmd|bat)$/i.test(resolved)) {
    if (!args.every((arg) => SAFE_SHELL_ARG.test(arg))) {
      throw new Error('Argumento recusado para execução via cmd.exe.')
    }
    // `shell: true` concatena o comando cru na linha do `cmd.exe`: o caminho
    // vai citado (há espaço em "C:\Users\Nome Sobrenome") e a flag dentro da
    // linha, como no `detectCli`, para não depender do DEP0190.
    return { file: `"${resolved}" ${args.join(' ')}`, args: [], options: { shell: true } }
  }

  return { file: resolved, args, options: {} }
}

/**
 * @param {{
 *   platformName?: string,
 *   timeoutMs?: number,
 *   maxBuffer?: number,
 *   execFileImpl?: typeof execFile,
 *   resolveNativeClaude?: typeof resolveNativeClaude,
 *   resolveCommandPath?: typeof resolveCommandPath,
 * }} [options]
 * @returns {(command: string, args: string[], env?: Record<string, string>) => Promise<string>}
 */
function createCliRunner(options = {}) {
  const platformName = options.platformName ?? process.platform
  const execImpl = options.execFileImpl ?? execFile
  const deps = {
    resolveNativeClaude: options.resolveNativeClaude ?? resolveNativeClaude,
    resolveCommandPath: options.resolveCommandPath ?? resolveCommandPath,
    adapter: platformAdapters.getAdapter('win32'),
  }

  return function runCli(command, args, env = process.env) {
    return new Promise((resolve, reject) => {
      let launch
      try {
        launch =
          platformName === 'win32'
            ? createWindowsLaunch(command, args, env, deps)
            : { file: command, args, options: {} }
      } catch (error) {
        reject(error)
        return
      }

      execImpl(
        launch.file,
        launch.args,
        {
          timeout: options.timeoutMs ?? 30_000,
          maxBuffer: options.maxBuffer ?? 4 * 1024 * 1024,
          env,
          windowsHide: true,
          ...launch.options,
        },
        (erro, stdout, stderr) => {
          const saida = `${stdout ?? ''}\n${stderr ?? ''}`

          if (erro && !saida.trim()) {
            reject(erro)
            return
          }

          resolve(saida)
        },
      )
    })
  }
}

module.exports = { createCliRunner }
