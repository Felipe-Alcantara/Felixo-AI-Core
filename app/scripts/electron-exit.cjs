'use strict'

/**
 * Encerramento com falha das bancadas que rodam no processo principal do
 * Electron (`process.type === 'browser'`).
 *
 * No Electron, `process.exitCode = 1` não basta. Medido em 25/09/2026 com o
 * Electron 41.10.7 do projeto:
 * - erro depois de `app.quit()` no `finally` (padrão das bancadas daqui): o
 *   processo sai com 0. Um erro fatal (ex.: `posix_spawnp failed` do node-pty
 *   no macOS) ou a reprovação do `--check` terminava com o passo de CI VERDE;
 * - erro antes do app ficar pronto (ex.: argumento inválido): o processo fica
 *   pendurado para sempre, e o job só cai no teto de tempo;
 * - `app.exit(1)` sai com 1 nos dois casos.
 * Uma das quatro bancadas já usava `app.exit(1)`, mas só com o app pronto; as
 * outras três só marcavam `process.exitCode`. Este módulo é a única cópia.
 *
 * Fora do Electron (rodando como Node puro ou importado em teste), só marca o
 * `process.exitCode`, como antes.
 */

/**
 * @param {unknown} error
 * @param {string} prefix - rótulo da bancada no log, ex.: '[benchmark]'.
 * @param {{ electronApp?: { exit: (code: number) => void } | null, log?: (line: string) => void }} [options]
 */
function reportFailureAndExit(error, prefix, { electronApp = runningElectronApp(), log = console.error } = {}) {
  log(`${prefix} ${error instanceof Error ? error.stack || error.message : String(error)}`)
  process.exitCode = 1
  if (electronApp) electronApp.exit(1)
}

/** O `app` do Electron quando este processo é o principal do Electron; senão `null`. */
function runningElectronApp() {
  if (!(process.versions.electron && process.type === 'browser')) return null
  return require('electron').app
}

module.exports = {
  reportFailureAndExit,
  runningElectronApp,
}
