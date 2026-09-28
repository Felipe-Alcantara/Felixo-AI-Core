'use strict'

/**
 * Processo filho do teste multiprocesso da cadeia de contas
 * (`account-chain-multiprocess.test.cjs`).
 *
 * Abre o MESMO arquivo SQLite que o outro filho e obedece ao pai por mensagem:
 * - `propor`: tenta abrir uma proposta (id próprio) para a sessão da rodada;
 * - `ler`: guarda a revisão atual da proposta indicada;
 * - `confirmar`: tenta o compare-and-set `proposed → confirmed` com a revisão
 *   guardada.
 * O pai só manda `confirmar` depois de os dois terem lido (barreira), então os
 * dois disputam a mesma revisão de verdade, em processos separados, como dois
 * Felixo abertos no mesmo perfil.
 */

const path = require('node:path')

const { createStorageDatabase } = require(path.join(__dirname, '../services/storage/sqlite-database.cjs'))
const { createAccountChainRepository } = require(path.join(__dirname, '../services/storage/account-chain-repository.cjs'))

const [databaseDir, workerName] = process.argv.slice(2)
const database = createStorageDatabase({ databaseDir })
const repository = createAccountChainRepository(database)
let lastRead = null

function reply(message) {
  process.send?.({ worker: workerName, ...message })
}

function proposalFor(rodada) {
  const nowIso = new Date().toISOString()
  return {
    id: `proposta-${rodada}-${workerName}`,
    kind: 'continuation',
    state: 'proposed',
    sourceSessionId: `sessao-${rodada}`,
    fromAccountId: 'conta-a',
    fromProviderId: 'codex',
    toAccountId: 'conta-b',
    toProviderId: 'codex',
    failureClass: 'limit',
    reason: 'Limite de uso da conta de origem',
    proposedAt: nowIso,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  }
}

process.on('message', (message) => {
  try {
    if (message?.tipo === 'propor') {
      const result = repository.insertSwitchEvent(proposalFor(message.rodada))
      reply({ tipo: 'proposto', rodada: message.rodada, inserted: result.inserted, id: result.event.id })
      return
    }
    if (message?.tipo === 'ler') {
      lastRead = repository.getSwitchEvent(message.id)
      reply({ tipo: 'lido', rodada: message.rodada, revision: lastRead?.revision ?? null, state: lastRead?.state ?? null })
      return
    }
    if (message?.tipo === 'confirmar') {
      const result = repository.transitionSwitchEvent({
        id: lastRead.id,
        fromState: 'proposed',
        toState: 'confirmed',
        expectedRevision: lastRead.revision,
        patch: { decidedAt: new Date().toISOString(), chosenBy: 'person' },
      })
      reply({ tipo: 'confirmado', rodada: message.rodada, applied: result.applied, revision: result.event.revision })
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
