'use strict'

/**
 * Integração nativa: o agente abre mesmo quando o processo do app está com a
 * pasta atual em `C:\Windows\System32`.
 *
 * Por que existe: em 15/10/2026 um usuário recebia, de forma recorrente, "Camada
 * de inicialização do PTY: não foi possível criar a sessão: File not found: ",
 * com o caminho vazio, ao abrir um bloco do Claude. A causa está no node-pty
 * 1.1.0 (`src/win/path_util.cc`, `get_shell_path`): quando o arquivo pedido
 * por nome relativo (`cmd.exe`) existe na pasta atual do processo, a função
 * devolve o caminho vazio em vez do caminho achado, e `startProcess` recusa o
 * vazio. Processo aberto pelo Windows no login (item de inicialização) costuma
 * nascer com a pasta atual no System32, onde o `cmd.exe` mora (inferência, não
 * medida na máquina de quem relatou). Reproduzido em
 * 15/10/2026: mesmo spawn, pasta atual em home funciona, em System32 lança
 * "File not found: ".
 *
 * Este teste roda a ConPTY real, não um fake: o defeito está no binário nativo.
 * Só no Windows.
 */

const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const { after, test } = require('node:test')

const { PtyProcessManager } = require('./pty-process-manager.cjs')
// Encerrar a sessão no Windows dispara o auxiliar `conpty_console_list_agent`
// do node-pty, que falha com `AttachConsole` no runner sem console.
const { instalarGuardaDeConsoleListAgent } = require('../__fixtures__/conpty-console-list-agent-guard.cjs')

after(instalarGuardaDeConsoleListAgent())

const TEMPO_LIMITE_MS = 20_000
const MARCADOR = '__FELIXO_SONDA_SYSTEM32_OK__'

test('agente abre com a pasta atual do processo no System32', { skip: process.platform !== 'win32' }, async () => {
  const system32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32')
  const pastaOriginal = process.cwd()
  const manager = new PtyProcessManager()
  let saida = ''

  process.chdir(system32)
  try {
    const evento = await new Promise((resolver, rejeitar) => {
      const timer = setTimeout(
        () => rejeitar(new Error(`[PTY System32] não encerrou em ${TEMPO_LIMITE_MS} ms; saída: ${JSON.stringify(saida.slice(-500))}`)),
        TEMPO_LIMITE_MS,
      )
      try {
        // Comando explícito: passa pelo mesmo `createPtyLaunchSpec` de um bloco
        // do Claude/Codex no Windows.
        manager.spawn('teste-pty-system32', {
          command: 'cmd',
          args: ['/d', '/c', 'echo', MARCADOR],
          cwd: os.homedir(),
          cols: 120,
          rows: 30,
          onData: (dados) => {
            saida += String(dados)
          },
          onExit: (event) => {
            clearTimeout(timer)
            resolver(event)
          },
        })
      } catch (error) {
        clearTimeout(timer)
        rejeitar(error)
      }
    })

    assert.equal(evento?.exitCode, 0, `[PTY System32] saiu com ${evento?.exitCode}; saída: ${JSON.stringify(saida.slice(-500))}`)
    assert.ok(saida.includes(MARCADOR), `[PTY System32] marcador ausente; saída: ${JSON.stringify(saida.slice(-500))}`)
  } finally {
    process.chdir(pastaOriginal)
    manager.killAll({ force: true })
  }
})
