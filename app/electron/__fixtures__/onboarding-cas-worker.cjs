'use strict'

/**
 * Processo filho do teste N-mp (`onboarding-state-multiprocess.test.cjs`).
 *
 * Abre o MESMO arquivo SQLite que o outro filho e obedece ao pai por mensagem:
 * `ler` guarda a revisão atual, `escrever` tenta o compare-and-set com a
 * revisão guardada. O pai só manda `escrever` depois de os dois terem lido
 * (barreira), então os dois disputam a mesma revisão de verdade, em processos
 * separados, como dois Felixo abertos no mesmo perfil.
 */

const path = require('node:path')

const { createStorageDatabase } = require(path.join(__dirname, '../services/storage/sqlite-database.cjs'))
const {
  compareAndSetOnboardingState,
  readOnboardingState,
} = require(path.join(__dirname, '../services/storage/onboarding-state-repository.cjs'))

const [databaseDir, workerName] = process.argv.slice(2)
const database = createStorageDatabase({ databaseDir })
let lastRead = null

function reply(message) {
  process.send?.({ worker: workerName, ...message })
}

process.on('message', (message) => {
  try {
    if (message?.tipo === 'ler') {
      lastRead = readOnboardingState(database)
      reply({ tipo: 'lido', rodada: message.rodada, revision: lastRead.revision })
      return
    }
    if (message?.tipo === 'escrever') {
      const result = compareAndSetOnboardingState(database, {
        expectedRevision: lastRead?.revision ?? 0,
        value: { schemaVersion: 1, rodada: message.rodada, dono: workerName },
        nowIso: new Date().toISOString(),
      })
      reply({ tipo: 'escrito', rodada: message.rodada, applied: result.applied, revision: result.revision })
      return
    }
    if (message?.tipo === 'sair') {
      database.close()
      process.disconnect?.()
    }
  } catch (error) {
    reply({ tipo: 'erro', rodada: message?.rodada, message: error instanceof Error ? error.message : String(error) })
  }
})

reply({ tipo: 'pronto' })
