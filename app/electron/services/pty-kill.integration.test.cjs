'use strict'

/**
 * Encerramento de uma PTY nativa, executado pelo runner do próprio SO.
 *
 * No Windows, o `kill()` do node-pty bifurcava um auxiliar que chama
 * `AttachConsole` depois de o console já ter sido fechado: o auxiliar falhava
 * sempre ("Error: AttachConsole failed" no stderr) e o timer de 5 s do node-pty
 * segurava o processo depois de cada kill. A explicação e a correção moram em
 * `./node-pty-windows-kill.cjs`.
 *
 * O teste roda o encerramento num processo filho, porque o ruído é escrito no
 * stderr herdado e o tempo só aparece no momento em que o processo sai sozinho.
 * Sem skip por plataforma: onde o defeito não existe, o teste prova que nada
 * piorou. Rode com `node --test electron/services/pty-kill.integration.test.cjs`;
 * o workflow `pty-kill-windows.yml` o repete no runner Windows.
 *
 * Com `FELIXO_PTY_KILL_SEM_CORRECAO=1` o filho usa o spawn cru do node-pty e o
 * teste tem que FALHAR no Windows: é o controle que o workflow
 * `pty-kill-windows.yml` roda para provar que o runner reproduz o defeito.
 */

const assert = require('node:assert/strict')
const { execFile } = require('node:child_process')
const path = require('node:path')
const { test } = require('node:test')

const FIXTURE = path.join(__dirname, '..', '__fixtures__', 'pty-kill-and-exit.cjs')

// O timer do node-pty é de 5 s a partir do kill(); com a correção o processo sai
// em cerca de 1 s. 4,5 s separa os dois com folga para um runner lento.
const LIMITE_DEPOIS_DO_KILL_MS = 4_500
const TEMPO_LIMITE_DO_FILHO_MS = 30_000

function executarFixture() {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [FIXTURE],
      { env: process.env, timeout: TEMPO_LIMITE_DO_FILHO_MS, encoding: 'utf8', windowsHide: true },
      (erro, stdout, stderr) => resolve({ erro, stdout, stderr }),
    )
  })
}

test('encerrar uma PTY nativa não imprime AttachConsole nem segura o processo depois do kill', async () => {
  const { erro, stdout, stderr } = await executarFixture()

  assert.equal(erro, null, `o filho não saiu sozinho em ${TEMPO_LIMITE_DO_FILHO_MS} ms: ${erro?.message}\n${stderr}`)
  assert.doesNotMatch(
    stderr,
    /AttachConsole|conpty_console_list_agent/i,
    `o auxiliar de lista do console do node-pty voltou a rodar no kill():\n${stderr}`,
  )

  const relatorio = JSON.parse(stdout.trim().split(/\r?\n/).pop())
  assert.equal(typeof relatorio.onExitEmMs, 'number', 'o evento de saída da PTY nunca chegou')
  assert.ok(
    relatorio.saiuEmMs - relatorio.killEmMs < LIMITE_DEPOIS_DO_KILL_MS,
    `o processo levou ${relatorio.saiuEmMs - relatorio.killEmMs} ms para sair depois do kill() ` +
      `(limite ${LIMITE_DEPOIS_DO_KILL_MS} ms; o timer do node-pty é de 5 s)`,
  )
})
