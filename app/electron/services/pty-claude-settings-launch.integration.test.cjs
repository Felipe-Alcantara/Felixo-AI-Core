'use strict'
require('../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)

/**
 * Integração nativa: o `--settings <arquivo>` que o app põe em todo terminal do Claude chega
 * inteiro ao executável no Windows, com caminho com espaço e acento, e os argumentos do usuário
 * não mudam. O terminal abre o `claude.cmd` pelo `cmd.exe`; este teste usa a ConPTY real e um
 * `claude.cmd` falso que grava o `argv` que recebeu.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')

const { PtyProcessManager } = require('./pty-process-manager.cjs')
const { removeTreeSync } = require('../../scripts/build-output.cjs')

const TEMPO_LIMITE_MS = 20_000

test('o --settings do app chega inteiro ao claude.cmd, em pasta com espaço e acento', { skip: process.platform !== 'win32' }, async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo sonda ação '))
  const bin = path.join(raiz, 'bin ação')
  const dados = path.join(raiz, 'dados ação')
  fs.mkdirSync(bin)
  fs.mkdirSync(dados)
  const settingsPath = path.join(dados, 'session-settings.json')
  const destino = path.join(raiz, 'argv.json')
  fs.writeFileSync(
    path.join(bin, 'argv.cjs'),
    `require('node:fs').writeFileSync(${JSON.stringify(destino)}, JSON.stringify({ argv: process.argv.slice(2), id: process.env.FELIXO_PTY_SESSION_ID }))\n`,
    'utf8',
  )
  // chcp 65001 como o node.cmd do app: o cmd lê o .cmd em UTF-8 e o %~dp0 acentuado fica certo.
  fs.writeFileSync(path.join(bin, 'claude.cmd'), '@echo off\r\nchcp 65001 >nul\r\nnode "%~dp0argv.cjs" %*\r\n', 'utf8')

  const pathOriginal = process.env.PATH
  process.env.PATH = `${bin};${pathOriginal}`
  const manager = new PtyProcessManager({ claudeSessionLaunch: () => ({ settingsPath }) })
  let saida = ''

  try {
    const evento = await new Promise((resolver, rejeitar) => {
      const timer = setTimeout(
        () => rejeitar(new Error(`[claude --settings] não encerrou em ${TEMPO_LIMITE_MS} ms; saída: ${JSON.stringify(saida.slice(-500))}`)),
        TEMPO_LIMITE_MS,
      )
      manager.spawn('teste-claude-settings', {
        command: path.join(bin, 'claude.cmd'),
        args: ['--model', 'opus', 'com espaço', 'ação'],
        cwd: raiz,
        cols: 120,
        rows: 30,
        onData: (d) => {
          saida += String(d)
        },
        onExit: (e) => {
          clearTimeout(timer)
          resolver(e)
        },
      })
    })

    assert.equal(evento?.exitCode, 0, `saiu com ${evento?.exitCode}; saída: ${JSON.stringify(saida.slice(-500))}`)
    const recebido = JSON.parse(fs.readFileSync(destino, 'utf8'))
    assert.deepEqual(recebido.argv, ['--settings', settingsPath, '--model', 'opus', 'com espaço', 'ação'])
    assert.equal(recebido.id, 'teste-claude-settings')
  } finally {
    process.env.PATH = pathOriginal
    manager.killAll({ force: true })
    removeTreeSync(raiz)
  }
})
