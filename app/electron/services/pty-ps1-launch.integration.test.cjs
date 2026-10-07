'use strict'

/**
 * Integração nativa: um comando que só existe como `.ps1` abre no terminal do
 * canvas pelo PowerShell (`-File`), com os argumentos intactos.
 *
 * Por que existe: o alias `openia.ps1` do catálogo do Openia nunca funcionava.
 * O terminal lança o agente por `cmd.exe /d /s /c <comando>`, e o `cmd.exe` não
 * executa `.ps1` (o PATHEXT padrão não inclui `.PS1`) — a pessoa via "não é
 * reconhecido". Medido em 07/10/2026; decisão do Felipe na mesma data: suportar
 * o alias. Este teste roda a ConPTY real, não um fake: é a única forma de provar
 * que o PowerShell recebe o caminho e cada argumento como argv separado.
 *
 * Só no Windows — nos outros sistemas não existe `.ps1` no PATH do terminal.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { after, test } = require('node:test')

const { PtyProcessManager } = require('./pty-process-manager.cjs')
// Encerrar a sessão no Windows dispara o auxiliar `conpty_console_list_agent`
// do node-pty, que falha com `AttachConsole` no runner sem console — a mesma
// guarda do teste de PTY nativa isola só essa falha conhecida.
const { instalarGuardaDeConsoleListAgent } = require('../__fixtures__/conpty-console-list-agent-guard.cjs')

after(instalarGuardaDeConsoleListAgent())

const TEMPO_LIMITE_MS = 20_000
const COMANDO = 'felixo-sonda-ps1'

test('comando que só existe como .ps1 abre pelo PowerShell com os argumentos intactos', { skip: process.platform !== 'win32' }, async () => {
  // Espaço no nome da pasta, como no perfil "C:\Users\Felipe Martins".
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo sonda ps1 '))
  const destino = path.join(pasta, 'recebido.txt')
  fs.writeFileSync(
    path.join(pasta, `${COMANDO}.ps1`),
    [
      '[IO.File]::WriteAllText((Join-Path $PSScriptRoot "recebido.txt"), ($args -join "|"))',
      'Write-Output "__FELIXO_SONDA_OK__"',
      'exit 0',
      '',
    ].join('\r\n'),
    'utf8',
  )

  // O terminal monta o ambiente a partir do processo (createCliEnv); a pasta
  // da sonda entra na frente do PATH só durante este teste.
  const pathOriginal = process.env.PATH
  process.env.PATH = `${pasta};${pathOriginal}`
  const manager = new PtyProcessManager()
  let saida = ''

  try {
    const evento = await new Promise((resolver, rejeitar) => {
      const timer = setTimeout(
        () => rejeitar(new Error(`[PTY .ps1] não encerrou em ${TEMPO_LIMITE_MS} ms; saída: ${JSON.stringify(saida.slice(-500))}`)),
        TEMPO_LIMITE_MS,
      )
      manager.spawn('teste-pty-ps1', {
        command: COMANDO,
        args: ['com espaço', 'ação'],
        cwd: pasta,
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
    })

    assert.equal(evento?.exitCode, 0, `[PTY .ps1] saiu com ${evento?.exitCode}; saída: ${JSON.stringify(saida.slice(-500))}`)
    assert.ok(saida.includes('__FELIXO_SONDA_OK__'), `[PTY .ps1] marcador ausente; saída: ${JSON.stringify(saida.slice(-500))}`)
    assert.equal(fs.readFileSync(destino, 'utf8'), 'com espaço|ação')
  } finally {
    process.env.PATH = pathOriginal
    manager.killAll({ force: true })
    fs.rmSync(pasta, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})
