'use strict'

const childProcess = require('node:child_process')

/**
 * @module linux-xdg-open
 * Abertura de link no Linux que sabe quando falhou.
 *
 * O `shell.openExternal` do Electron chama o `xdg-open` e resolve sem esperar
 * o fim (`platform_util_linux.cc`: "Don't wait for exit"). Medido no Electron
 * 41.10.7: com um `xdg-open` que sai com 3 (sem navegador padrão) ou sem
 * `xdg-open` nenhum, a promessa resolve em poucos milissegundos, e o app nunca
 * sabe que nada abriu. Decisão do Felipe (29/09/2026): no Linux, o próprio app
 * roda o `xdg-open`.
 *
 * Como o Electron: o endereço vai como argumento único, sem shell, e com
 * `MM_NOTTTY=1` (o mailcap do `xdg-open` não pede terminal). A diferença é
 * esperar uma janela curta:
 *
 * - saída diferente de 0 dentro dela (3: nenhum navegador; 4: a ação falhou),
 *   ou `xdg-open` que nem existe, é falha;
 * - saída 0, ou o processo ainda vivo quando a janela fecha (no modo genérico o
 *   `xdg-open` fica em primeiro plano junto com o navegador), é sucesso.
 *
 * O processo nasce destacado e solto (`unref`): fechar o app não fecha o
 * navegador que ele abriu.
 */

/** Quanto esperar pela saída do `xdg-open` antes de dar a abertura como feita. */
const XDG_OPEN_FAILURE_WINDOW_MS = 3_000

/**
 * @param {string} url - Já aprovado e serializado pela política.
 * @param {object} [options]
 * @param {typeof childProcess.spawn} [options.spawn]
 * @param {number} [options.windowMs]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @returns {Promise<void>}
 */
function openWithXdgOpen(
  url,
  { spawn = childProcess.spawn, windowMs = XDG_OPEN_FAILURE_WINDOW_MS, env = process.env } = {},
) {
  return new Promise((resolve, reject) => {
    let settled = false
    let timer = null
    const settle = (callback, value) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      callback(value)
    }

    let child
    try {
      child = spawn('xdg-open', [url], {
        detached: true,
        stdio: 'ignore',
        env: { ...env, MM_NOTTTY: '1' },
      })
    } catch (error) {
      reject(error)
      return
    }

    // ENOENT: o sistema não tem `xdg-open`.
    child.once('error', (error) => settle(reject, error))
    child.once('exit', (code, signal) => {
      if (code === 0) settle(resolve)
      else settle(reject, new Error(`O xdg-open não abriu o link (saída ${code ?? signal}).`))
    })
    timer = setTimeout(() => {
      child.unref?.()
      settle(resolve)
    }, windowMs)
  })
}

/**
 * O `shell` que abre links: no Linux, o que sabe quando falhou; nos outros
 * sistemas, o do Electron, que já rejeita (macOS: "No application found";
 * Windows: o resultado do `ShellExecute`).
 *
 * @param {{ openExternal: (url: string) => Promise<void> }} electronShell
 * @param {NodeJS.Platform} [platform]
 * @returns {{ openExternal: (url: string) => Promise<void> }}
 */
function platformShell(electronShell, platform = process.platform) {
  return platform === 'linux' ? { openExternal: (url) => openWithXdgOpen(url) } : electronShell
}

module.exports = {
  XDG_OPEN_FAILURE_WINDOW_MS,
  openWithXdgOpen,
  platformShell,
}
