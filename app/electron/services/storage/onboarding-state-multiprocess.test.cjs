'use strict'

/**
 * N-mp: compare-and-set do estado do tutorial entre DOIS PROCESSOS node reais.
 *
 * Dois Felixo no mesmo perfil (abrir um `.fxai` com o app aberto, `felixo
 * devtools --real-profile`) têm conexões SQLite em processos diferentes. Em
 * cada rodada os dois filhos leem a mesma revisão (barreira por mensagem) e só
 * então tentam gravar ao mesmo tempo: exatamente um CAS pode ser aplicado. É a
 * garantia de que o primeiro uso e cada anúncio aparecem uma vez só (T3.d).
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const { fork } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createStorageDatabase } = require('./sqlite-database.cjs')
const { readOnboardingState } = require('./onboarding-state-repository.cjs')

const WORKER = path.join(__dirname, '../../__fixtures__/onboarding-cas-worker.cjs')
const ROUNDS = 20
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
    child,
    ready: () => next((message) => message.tipo === 'pronto' || message.tipo === 'erro'),
    read: (rodada) => {
      child.send({ tipo: 'ler', rodada })
      return expect('lido', rodada)
    },
    write: (rodada) => {
      child.send({ tipo: 'escrever', rodada })
      return expect('escrito', rodada)
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

test('dois processos disputando a mesma revisão: exatamente um CAS aplicado por rodada', { timeout: 120_000 }, async () => {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-onboarding-mp-'))
  // As migrations rodam uma vez aqui, antes dos filhos abrirem o mesmo arquivo.
  createStorageDatabase({ databaseDir }).close()
  const workers = [startWorker(databaseDir, 'a'), startWorker(databaseDir, 'b')]

  try {
    await Promise.all(workers.map((worker) => worker.ready()))

    for (let rodada = 1; rodada <= ROUNDS; rodada++) {
      const reads = await Promise.all(workers.map((worker) => worker.read(rodada)))
      assert.equal(reads[0].revision, rodada - 1)
      assert.equal(reads[1].revision, rodada - 1)

      const writes = await Promise.all(workers.map((worker) => worker.write(rodada)))
      const applied = writes.filter((result) => result.applied)
      assert.equal(applied.length, 1, `rodada ${rodada}: ${JSON.stringify(writes)}`)
      for (const result of writes) assert.equal(result.revision, rodada)
    }
  } finally {
    await Promise.all(workers.map((worker) => worker.stop()))
  }

  const database = createStorageDatabase({ databaseDir })
  try {
    const final = readOnboardingState(database)
    assert.equal(final.revision, ROUNDS)
    assert.equal(final.value.rodada, ROUNDS)
  } finally {
    database.close()
    fs.rmSync(databaseDir, { recursive: true, force: true })
  }
})
