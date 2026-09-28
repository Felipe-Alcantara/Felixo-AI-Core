'use strict'

/**
 * Processo filho da matriz de falhas da cadeia de contas
 * (`services/accounts/account-chain-faults.test.cjs`) e as contas que a
 * matriz usa nos dois lados.
 *
 * Como filho, abre o MESMO arquivo SQLite que o outro filho, monta o SERVIÇO
 * real da cadeia com a porta real da política (`account-chain-port.cjs`,
 * como o `account-chain-runtime.cjs` liga) e obedece ao pai por mensagem:
 * - `confirmar`: `service.confirm` da proposta indicada;
 * - `gastar`: `service.beginTicketSpawn` do ticket, para a sessão nova deste
 *   filho.
 * São dois Felixo no mesmo perfil disputando o mesmo ticket: só um processo
 * pode nascer dele.
 */

const path = require('node:path')

/** Contas da matriz: três do Codex, duas do Claude e uma do Gemini. */
const FAULT_ACCOUNTS = Object.freeze({
  'conta-a': { providerId: 'codex', label: 'Codex A' },
  'conta-b': { providerId: 'codex', label: 'Codex B' },
  'conta-c': { providerId: 'codex', label: 'Codex C' },
  'conta-d': { providerId: 'claude', label: 'Claude D' },
  'conta-e': { providerId: 'claude', label: 'Claude E' },
  'conta-g': { providerId: 'gemini', label: 'Gemini G' },
})

/** As contas como o registro de contas lista (`cliAccounts.list()`). */
function listFaultAccounts() {
  return Object.entries(FAULT_ACCOUNTS).map(([id, account]) => ({ id, ...account }))
}

function runWorker() {
  const { createStorageDatabase } = require(path.join(__dirname, '../services/storage/sqlite-database.cjs'))
  const { createAccountChainRepository } = require(path.join(__dirname, '../services/storage/account-chain-repository.cjs'))
  const { createAccountChainService } = require(path.join(__dirname, '../services/accounts/account-chain-service.cjs'))
  const { createAccountDescriber, createChainPolicyPort } = require(path.join(__dirname, '../services/accounts/account-chain-port.cjs'))

  const [databaseDir, workerName, sessionCount] = process.argv.slice(2)
  const database = createStorageDatabase({ databaseDir })
  const repository = createAccountChainRepository(database)
  // As sessões de origem estão vivas no "outro" app; aqui só a conta e o modo importam.
  const liveSessions = Array.from({ length: Number(sessionCount) }, (_, index) => ({
    sessionId: `origem-${index + 1}`,
    accountId: 'conta-a',
    providerId: 'codex',
    accountMode: 'chain',
  }))
  const service = createAccountChainService({
    repository,
    policy: createChainPolicyPort({ repository }),
    checkLogin: async () => {},
    describeAccount: createAccountDescriber({ listAccounts: listFaultAccounts }),
    listAccounts: listFaultAccounts,
    listLiveSessions: () => liveSessions,
  })

  function reply(message) {
    process.send?.({ worker: workerName, ...message })
  }

  process.on('message', async (message) => {
    try {
      if (message?.tipo === 'confirmar') {
        const result = await service.confirm({ proposalId: message.proposalId, destinationAccountId: 'conta-b' })
        reply({ tipo: 'confirmado', rodada: message.rodada, ok: result.ok, ticket: result.ticket ?? null, alreadyConfirmed: result.alreadyConfirmed ?? null, code: result.code ?? null })
        return
      }
      if (message?.tipo === 'gastar') {
        const result = service.beginTicketSpawn({ ticket: message.ticket, accountId: 'conta-b', sessionId: `novo-${message.rodada}-${workerName}` })
        reply({ tipo: 'gasto', rodada: message.rodada, ok: result.ok, code: result.code ?? null })
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
}

if (require.main === module) runWorker()

module.exports = { FAULT_ACCOUNTS, listFaultAccounts }
