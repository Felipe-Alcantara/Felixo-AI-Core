'use strict'

/**
 * Qual `claude` executar para criar a sessão na nuvem.
 *
 * No Windows o `claude` do npm é um shim `.cmd` que só chama um `claude.exe`
 * nativo. Executar o `.cmd` obriga a passar pelo `cmd.exe`, que reinterpreta
 * `%VAR%`, aspas, `&` e quebras de linha do texto da tarefa. Resolver o `.exe`
 * por trás do shim permite entregar a tarefa como `argv` puro, sem shell.
 *
 * Linux e macOS não têm esse problema: o `createPtyLaunchSpec` do app escapa
 * os argumentos para o shell de login (macOS) ou executa direto (Linux).
 */

const fs = require('node:fs')
const path = require('node:path')

const SHIM_TARGET_PATTERN = /"%dp0%\\([^"\r\n]+?\.exe)"/i

function readPathVariable(env) {
  const key = Object.keys(env ?? {}).find((name) => name.toLowerCase() === 'path')
  return key ? String(env[key] ?? '') : ''
}

/** O `.exe` que o shim do npm chama, relativo à pasta do shim. */
function findShimTarget(shimContent, shimDir) {
  const match = SHIM_TARGET_PATTERN.exec(shimContent)
  return match ? path.win32.join(shimDir, match[1]) : null
}

/**
 * @param {{
 *   platformName?: string,
 *   env?: Record<string, string>,
 *   fsApi?: { existsSync: (target: string) => boolean, readFileSync: (target: string, encoding: string) => string },
 * }} [options]
 * @returns {{ command: string, viaShell: boolean }} `viaShell: true` = só há o
 *   shim: o chamador precisa recusar texto com `hasShellUnsafeChars`.
 */
function resolveNativeClaude({ platformName = process.platform, env = process.env, fsApi = fs } = {}) {
  if (platformName !== 'win32') {
    return { command: 'claude', viaShell: false }
  }

  for (const dir of readPathVariable(env).split(';').filter(Boolean)) {
    const exe = path.win32.join(dir, 'claude.exe')
    if (fsApi.existsSync(exe)) {
      return { command: exe, viaShell: false }
    }

    const shim = path.win32.join(dir, 'claude.cmd')
    if (!fsApi.existsSync(shim)) continue

    let target = null
    try {
      target = findShimTarget(fsApi.readFileSync(shim, 'utf8'), dir)
    } catch {
      // Shim ilegível: cai no caminho com shell, que é o conservador.
    }
    return target && fsApi.existsSync(target)
      ? { command: target, viaShell: false }
      : { command: 'claude', viaShell: true }
  }

  return { command: 'claude', viaShell: true }
}

module.exports = { resolveNativeClaude }
