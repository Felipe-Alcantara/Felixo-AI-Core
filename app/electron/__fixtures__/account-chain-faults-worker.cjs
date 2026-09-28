'use strict'

/**
 * Processo filho da matriz de falhas da cadeia de contas
 * (`services/accounts/account-chain-faults.test.cjs`), e o adaptador do
 * contrato de política que a matriz usa nos dois lados.
 *
 * Como filho, abre o MESMO arquivo SQLite que o outro filho, monta o SERVIÇO
 * real da cadeia (com a política real) e obedece ao pai por mensagem:
 * - `confirmar`: `service.confirm` da proposta indicada;
 * - `gastar`: `service.beginTicketSpawn` do ticket, para a sessão nova deste
 *   filho.
 * São dois Felixo no mesmo perfil disputando o mesmo ticket: só um processo
 * pode nascer dele.
 */

const path = require('node:path')

const policy = require(path.join(__dirname, '../services/accounts/account-chain-policy.cjs'))

/**
 * Traduz o contrato que o serviço chama (`settings`, `account`,
 * `lastDestinationAccountId`, `evidence`, `measurement`) para as assinaturas
 * da política pura (`chainEnabled`, `accountStatus`, `lastSpawnedAccountId`,
 * `resetText`, `sample`). Sem esta tradução a política real recusa tudo
 * (`chainEnabled` ausente = cadeia desligada), então a matriz a usa para
 * provar a regra de verdade, não um dublê.
 */
function createChainPolicyAdapter(real = policy) {
  return {
    evaluateEligibility({ nowMs, settings, member, account, cooldown, loginCheck, sourceAccountId, visitedAccountIds }) {
      return real.evaluateEligibility({
        chainEnabled: settings?.enabled === true,
        member,
        accountStatus: account ? account.accountStatus ?? 'ok' : 'removed',
        cooldown,
        loginCheck,
        sample: account?.measurement ?? null,
        nowMs,
        sourceAccountId,
        visitedAccountIds,
      })
    },
    rankCandidates({ strategy, candidates, lastDestinationAccountId }) {
      return real.rankCandidates({ strategy, candidates, members: candidates, lastSpawnedAccountId: lastDestinationAccountId })
    },
    resolveCooldownEnd({ providerId, failureClass, evidence, measurement, nowMs }) {
      return real.resolveCooldownEnd({
        providerId,
        failureClass,
        detectedAtMs: nowMs,
        nowMs,
        sample: measurement ?? null,
        resetText: evidence ?? null,
      })
    },
  }
}

/** Contas da matriz: três do Codex, duas do Claude e uma do Gemini. */
const FAULT_ACCOUNTS = Object.freeze({
  'conta-a': { providerId: 'codex', label: 'Codex A' },
  'conta-b': { providerId: 'codex', label: 'Codex B' },
  'conta-c': { providerId: 'codex', label: 'Codex C' },
  'conta-d': { providerId: 'claude', label: 'Claude D' },
  'conta-e': { providerId: 'claude', label: 'Claude E' },
  'conta-g': { providerId: 'gemini', label: 'Gemini G' },
})

function runWorker() {
  const { createStorageDatabase } = require(path.join(__dirname, '../services/storage/sqlite-database.cjs'))
  const { createAccountChainRepository } = require(path.join(__dirname, '../services/storage/account-chain-repository.cjs'))
  const { createAccountChainService } = require(path.join(__dirname, '../services/accounts/account-chain-service.cjs'))

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
    policy: createChainPolicyAdapter(),
    checkLogin: async () => {},
    describeAccount: (accountId) => (FAULT_ACCOUNTS[accountId] ? { ...FAULT_ACCOUNTS[accountId], measurement: null } : null),
    listAccounts: () => Object.entries(FAULT_ACCOUNTS).map(([id, account]) => ({ id, ...account })),
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

module.exports = { FAULT_ACCOUNTS, createChainPolicyAdapter }
