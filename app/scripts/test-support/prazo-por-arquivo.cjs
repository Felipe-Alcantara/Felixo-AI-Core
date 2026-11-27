'use strict'

/**
 * Prazo de cada arquivo de teste do `npm test` (pré-carga em cada processo).
 *
 * Por quê: um teste que espera algo que nunca acontece, com qualquer coisa ainda
 * ligada, deixa o `node --test` esperando para sempre, sem dizer nada. Medido em
 * 27/11/2026: no Node 25.3 o `--test-timeout` só encerrou 1 de 6 formas de
 * travar; no 22 (o do CI) encerra as 6, mas sem o nome do teste.
 *
 * O vigia mora numa thread própria, então dispara mesmo com a thread principal
 * presa num laço. Estourado o prazo, ele diz o arquivo e os testes em andamento
 * e encerra o processo e os descendentes (um neto que herde a saída seguraria o
 * runner).
 */

const { isMainThread, Worker } = require('node:worker_threads')

const VARIAVEL = 'FELIXO_TEST_FILE_TIMEOUT_MS'

const VIGIA = `
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const { parentPort, workerData: { arquivo, limiteMs, pid } } = require('node:worker_threads')
const emAndamento = new Map()
parentPort.on('message', ([acao, id, nome]) => (acao === 'inicio' ? emAndamento.set(id, nome) : emAndamento.delete(id)))

function descendentes(raiz) {
  const linhas = execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' }).trim().split('\\n')
  const pares = linhas.map((linha) => linha.trim().split(/\\s+/).map(Number))
  const achados = [raiz]
  for (const pai of achados) for (const [filho, ppid] of pares) if (ppid === pai) achados.push(filho)
  return achados.slice(1)
}

setTimeout(() => {
  const testes = [...emAndamento.values()]
  fs.writeSync(2, '\\n[test] prazo de ' + limiteMs / 1000 + ' s estourado em ' + arquivo + '. ' +
    (testes.length ? 'Testes em andamento: ' + testes.join(' | ') : 'Nenhum teste em andamento: algo ficou ligado depois deles (timer, servidor ou processo filho).') + '\\n')
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
    else for (const filho of descendentes(pid)) process.kill(filho, 'SIGKILL')
  } catch {}
  process.kill(pid, 'SIGKILL')
}, limiteMs)
`

const arquivo = process.argv[1]
const limiteMs = Number(process.env[VARIAVEL])

// Só o processo de um arquivo de teste: o próprio runner também tem um
// `.test.cjs` em `argv[1]`, mas não tem `NODE_TEST_CONTEXT`.
if (isMainThread && process.env.NODE_TEST_CONTEXT && arquivo?.endsWith('.test.cjs') && limiteMs > 0) {
  const vigia = new Worker(VIGIA, { eval: true, execArgv: [], workerData: { arquivo, limiteMs, pid: process.pid } })
  vigia.unref()

  const { beforeEach, afterEach } = require('node:test')
  const ids = new WeakMap()
  let proximo = 0
  beforeEach((t) => {
    ids.set(t.signal, (proximo += 1))
    vigia.postMessage(['inicio', proximo, t.fullName ?? t.name])
  })
  afterEach((t) => vigia.postMessage(['fim', ids.get(t.signal)]))
}

module.exports = { VARIAVEL }
