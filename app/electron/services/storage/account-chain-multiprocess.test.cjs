'use strict'

/**
 * Cadeia de contas entre DOIS PROCESSOS node reais (I1 e I2 da política).
 *
 * Dois Felixo no mesmo perfil (abrir um `.fxai` com o app aberto, `felixo
 * devtools --real-profile`) têm conexões SQLite em processos diferentes. Em
 * cada rodada:
 * 1. os dois filhos tentam abrir uma proposta para a MESMA sessão, cada um com
 *    o próprio id: só uma linha pode nascer (no máximo uma proposta aberta por
 *    sessão);
 * 2. os dois leem a proposta vencedora (barreira por mensagem) e só então
 *    tentam confirmá-la ao mesmo tempo: exatamente um compare-and-set pode ser
 *    aplicado, então um ticket nunca nasce duas vezes.
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const { fork } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createStorageDatabase } = require('./sqlite-database.cjs')
const { createAccountChainRepository } = require('./account-chain-repository.cjs')

const WORKER = path.join(__dirname, '../../__fixtures__/account-chain-cas-worker.cjs')
const ROUNDS = 15
const MESSAGE_TIMEOUT_MS = 15_000

function startWorker(databaseDir, name) {
  const child = fork(WORKER, [databaseDir, name], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
  const inbox = []
  const waiters = []
  child.on('message', (message) => {
    const index = waiters.findIndex((waiter) => waiter.accepts(message))
    if (index >= 0) waiters.splice(index, 1)[0].resolve(message)
    else inbox.push(message)
  })

  function next(accepts) {
    const queued = inbox.findIndex(accepts)
    if (queued >= 0) return Promise.resolve(inbox.splice(queued, 1)[0])
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${name}: sem resposta em ${MESSAGE_TIMEOUT_MS} ms`)), MESSAGE_TIMEOUT_MS)
      waiters.push({
        accepts,
        resolve: (message) => {
          clearTimeout(timer)
          if (message.tipo === 'erro') reject(new Error(`${name}: ${message.message}`))
          else resolve(message)
        },
      })
    })
  }

  const expect = (tipo, rodada) => next((message) => message.tipo === 'erro' || (message.tipo === tipo && message.rodada === rodada))

  return {
    ready: () => next((message) => message.tipo === 'pronto' || message.tipo === 'erro'),
    propose: (rodada) => {
      child.send({ tipo: 'propor', rodada })
      return expect('proposto', rodada)
    },
    read: (rodada, id) => {
      child.send({ tipo: 'ler', rodada, id })
      return expect('lido', rodada)
    },
    confirm: (rodada) => {
      child.send({ tipo: 'confirmar', rodada })
      return expect('confirmado', rodada)
    },
    stop: () =>
      new Promise((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          resolve()
          return
        }
        const timer = setTimeout(() => child.kill(), MESSAGE_TIMEOUT_MS)
        child.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })
        if (child.connected) child.send({ tipo: 'sair' })
        else child.kill()
      }),
  }
}

test('dois processos: uma proposta aberta por sessão e um único confirm aplicado por rodada', { timeout: 120_000 }, async () => {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-account-chain-mp-'))
  // As migrations rodam uma vez aqui, antes dos filhos abrirem o mesmo arquivo.
  createStorageDatabase({ databaseDir }).close()
  const workers = [startWorker(databaseDir, 'a'), startWorker(databaseDir, 'b')]

  try {
    await Promise.all(workers.map((worker) => worker.ready()))

    for (let rodada = 1; rodada <= ROUNDS; rodada++) {
      const proposals = await Promise.all(workers.map((worker) => worker.propose(rodada)))
      const born = proposals.filter((result) => result.inserted)
      assert.equal(born.length, 1, `rodada ${rodada}: ${JSON.stringify(proposals)}`)
      assert.equal(proposals[0].id, proposals[1].id, 'o perdedor recebe a proposta que já estava aberta')

      const reads = await Promise.all(workers.map((worker) => worker.read(rodada, born[0].id)))
      for (const read of reads) assert.deepEqual([read.state, read.revision], ['proposed', 1])

      const confirms = await Promise.all(workers.map((worker) => worker.confirm(rodada)))
      const applied = confirms.filter((result) => result.applied)
      assert.equal(applied.length, 1, `rodada ${rodada}: ${JSON.stringify(confirms)}`)
      for (const result of confirms) assert.equal(result.revision, 2)
    }
  } finally {
    await Promise.all(workers.map((worker) => worker.stop()))
  }

  const database = createStorageDatabase({ databaseDir })
  try {
    const events = createAccountChainRepository(database).listSwitchEvents()
    assert.equal(events.length, ROUNDS, 'uma linha por sessão, nunca duas')
    assert.ok(events.every((event) => event.state === 'confirmed' && event.revision === 2))
  } finally {
    database.close()
    fs.rmSync(databaseDir, { recursive: true, force: true })
  }
})
