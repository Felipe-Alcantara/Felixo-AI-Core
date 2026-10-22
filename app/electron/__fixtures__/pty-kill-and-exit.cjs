'use strict'

/**
 * Filho de `pty-kill.integration.test.cjs`: abre uma PTY nativa de verdade,
 * encerra com `kill()` e então só espera. O processo tem que sair sozinho, então
 * qualquer timer ou handle que o caminho do `kill()` deixe vivo aparece como
 * tempo. Imprime uma linha JSON com os instantes, em ms desde o início.
 *
 * `FELIXO_PTY_KILL_SEM_CORRECAO=1` usa o `spawn` cru do node-pty: é o controle
 * que mostra o defeito original (o workflow `pty-kill-windows.yml` o usa para
 * provar que o runner reproduz o problema).
 */
const nodePty = require('node-pty')
const { createNodePtySpawn } = require('../services/node-pty-windows-kill.cjs')

const ESPERA_ANTES_DO_KILL_MS = 800

const semCorrecao = process.env.FELIXO_PTY_KILL_SEM_CORRECAO === '1'
const spawn = semCorrecao
  ? (file, args, options) => nodePty.spawn(file, args, options)
  : createNodePtySpawn(nodePty)

const inicio = Date.now()
const relatorio = { semCorrecao, killEmMs: null, onExitEmMs: null, saiuEmMs: null }

// O próprio Node faz de shell: existe em todo SO e fica vivo até o kill.
const sessao = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
  cols: 80,
  rows: 24,
  cwd: process.cwd(),
  env: process.env,
})
sessao.onData(() => {})
sessao.onExit(() => {
  relatorio.onExitEmMs = Date.now() - inicio
})

setTimeout(() => {
  relatorio.killEmMs = Date.now() - inicio
  sessao.kill()
}, ESPERA_ANTES_DO_KILL_MS)

process.on('exit', () => {
  relatorio.saiuEmMs = Date.now() - inicio
  console.log(JSON.stringify(relatorio))
})
