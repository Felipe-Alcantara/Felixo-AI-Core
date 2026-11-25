'use strict'

/**
 * Temporário próprio de cada arquivo de teste Node.
 *
 * Por quê: a suíte inteira já roda com `TEMP` apontando para uma pasta que o
 * runner apaga no fim (`temporario-dos-testes.cjs`). Mas o `node --test <arquivo>`
 * que se roda direto não passa por ele, e cada execução avulsa deixava as pastas
 * `felixo-*` dos testes no temporário do sistema: em 25/11/2026 eram 33.850.
 *
 * Este `require` deve ser a primeira linha do teste. Ele troca `TEMP`, `TMP` e
 * `TMPDIR` do processo (e dos filhos que o teste criar) por uma pasta nova dentro
 * do temporário original, e apaga essa pasta quando o processo termina, inclusive
 * com `process.exit`. O nome leva o pid: um processo morto à força deixa a pasta,
 * e o runner a remove na próxima execução, quando o pid já tiver morrido.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), `felixo-testes-${process.pid}-`))
process.env.TEMP = pasta
process.env.TMP = pasta
process.env.TMPDIR = pasta

process.on('exit', () => {
  try {
    fs.rmSync(pasta, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch {
    // Um filho ainda vivo segura a pasta: o runner a remove quando o pid morrer.
  }
})

module.exports = { pasta }
