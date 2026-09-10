'use strict'

/**
 * @module pty-native-test-support
 * Encerramento de PTY nativa estável para os testes de integração no Windows.
 *
 * Histórico: uma tentativa anterior (commit e3eea0e, revertida em 1fa44a6)
 * forçava `useConptyDll: true` no spawn para evitar um crash no `kill()`.
 * Investigação mais funda mostrou que essa tentativa trocava um bug por
 * outro pior — os dois vivem em `node-pty/lib/windowsPtyAgent.js`
 * (confirmado ainda presente na 1.2.0-beta.15, a mais recente disponível):
 *
 * 1. Backend padrão (`useConptyDll: false`): `kill()` bifurca
 *    `conpty_console_list_agent.js`, que chama `AttachConsole` pra listar os
 *    processos do console antes de matá-los. Nos runners do GitHub Actions
 *    (sem console interativo anexado) esse `AttachConsole` crasha com
 *    `STATUS_HEAP_CORRUPTION` (0xC0000374) — o processo do próprio arquivo de
 *    teste cai antes de qualquer subteste rodar.
 *
 * 2. Backend DLL (`useConptyDll: true`, o que a tentativa anterior forçava):
 *    `kill()` fecha o handle de entrada e registra a limpeza do worker de
 *    saída (`_conoutSocketWorker.dispose()`) dentro de um listener de
 *    `'data'` no socket de saída — `_outSocket.on('data', () => dispose())`.
 *    Um processo já morto não produz mais dados, então esse listener nunca
 *    dispara e o worker (e o handle que ele segura) nunca é liberado. Isso
 *    prende o event loop indefinidamente — foi a causa medida do hang de
 *    11+ minutos da tentativa anterior.
 *
 * Em vez de forçar um backend específico (repetindo o mesmo tipo de aposta
 * que já custou um incidente), este módulo evita os dois caminhos por
 * completo: encerra o processo real via `taskkill /T /F`, o mesmo mecanismo
 * de força-bruta que o próprio `node-pty` usa como último recurso no backend
 * WinPTY. Nada aqui chama `AttachConsole` nem espera por um evento que nunca
 * chega — e o spawn continua 100% real (ConPTY, launch spec de produção),
 * só a forma de desligar no teardown do teste muda.
 */

const { execFileSync } = require('node:child_process')

/**
 * Encerra um processo nativo do `node-pty` (`ptyProcess`) sem passar pelo
 * `kill()` do próprio node-pty no Windows. Fora do Windows, ou sem um `pid`
 * utilizável, não faz nada e devolve `false` — quem chama cai de volta no
 * `ptyProcess.kill()` normal.
 *
 * @param {{ pid?: number }} ptyProcess
 * @param {object} [dependencies] - Injetável só em teste unitário deste módulo.
 * @param {string} [dependencies.platformName]
 * @param {typeof execFileSync} [dependencies.runTaskkill]
 * @returns {boolean} `true` quando o encerramento via `taskkill` foi tentado.
 */
function encerrarPtyDeFormaEstavelNoWindows(
  ptyProcess,
  { platformName = process.platform, runTaskkill = execFileSync } = {},
) {
  if (platformName !== 'win32' || !ptyProcess || typeof ptyProcess.pid !== 'number') {
    return false
  }

  try {
    runTaskkill('taskkill', ['/pid', String(ptyProcess.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {
    // Já encerrado, ou taskkill falhou por outro motivo — mesmo tratamento
    // best-effort que o safeKill() de produção já dá a um kill() que falha.
  }
  return true
}

/**
 * Fábrica pronta pra injetar em `new PtyProcessManager({ killPtyProcess })`.
 * A assinatura de `killPtyProcess` recebe `(ptyProcess, signal)`; o `signal`
 * não importa aqui porque `taskkill /F` já é sempre uma força-bruta.
 *
 * @returns {(ptyProcess: { pid?: number }, signal: string) => boolean}
 */
function criarKillPtyEstavelNoWindows() {
  return (ptyProcess) => encerrarPtyDeFormaEstavelNoWindows(ptyProcess)
}

module.exports = { encerrarPtyDeFormaEstavelNoWindows, criarKillPtyEstavelNoWindows }
