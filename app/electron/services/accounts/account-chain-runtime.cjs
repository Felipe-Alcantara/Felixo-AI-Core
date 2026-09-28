'use strict'

/**
 * @module accounts/account-chain-runtime
 * Montagem da cadeia de contas no processo principal: junta repositório
 * (migration 017), checagem de login, política, fatos das contas e serviço,
 * para o `main.cjs` só chamar uma função e ligar as pontas (IPC, PTY).
 *
 * Não tem regra: cada peça é a do seu módulo. O que mora aqui é a ordem de
 * montagem e duas pontes pequenas:
 * - a checagem de login grava o resultado em `account_login_checks` (o
 *   serviço relê do repositório, nunca do retorno);
 * - os fatos da conta vêm do registro de contas e da última amostra do painel.
 */

const { createAccountChainService } = require('./account-chain-service.cjs')
const { createAccountChainView } = require('./account-chain-view.cjs')
const { createAccountDescriber, createChainPolicyPort } = require('./account-chain-port.cjs')
const { createAccountEligibilityChecker } = require('./account-eligibility.cjs')
const { createAccountChainRepository } = require('../storage/account-chain-repository.cjs')
const { createAgentUsageRepository } = require('../storage/agent-usage-repository.cjs')

/**
 * @param {object} deps
 * @param {unknown} deps.database - `createStorageDatabase` (a mesma conexão do app).
 * @param {object} [deps.repository] - Repositório da cadeia já criado no app (uma instância só por conexão).
 * @param {{ list: () => Array<object>, buildEnv: Function, buildProbeOptions: Function }} deps.cliAccounts - Registro de contas.
 * @param {() => Array<object>} deps.listLiveSessions - `PtyProcessManager.listarSessoesVivas`.
 * @param {(sessionId: string, mode: 'pinned' | 'chain') => boolean} deps.setSessionAccountMode
 * @param {(channel: string, payload: unknown) => void} [deps.emit]
 * @param {(entry: object) => void} [deps.log]
 * @param {Function} [deps.runCommand] - Executor da checagem de login; o roteirizado na instância de automação.
 * @param {() => number} [deps.now]
 */
function createAccountChainRuntime({
  database,
  repository = createAccountChainRepository(database),
  cliAccounts,
  listLiveSessions,
  setSessionAccountMode,
  emit = () => {},
  log = () => {},
  runCommand,
  now = () => Date.now(),
}) {
  const usageRepository = createAgentUsageRepository(database)
  // Lança com o registro ilegível: o serviço trata como "contas desconhecidas"
  // e não apaga membro nenhum (fail-closed).
  const listAccounts = () => cliAccounts.list()
  const describeAccount = createAccountDescriber({
    listAccounts,
    getLatestSample: (accountId) => usageRepository.getLatestSample(accountId),
  })

  const eligibility = createAccountEligibilityChecker({
    resolveAccount: (accountId) => {
      const account = listAccounts().find((item) => item?.id === accountId)
      if (!account) return null
      return {
        accountId: account.id,
        providerId: account.providerId,
        profileEnv: cliAccounts.buildEnv(account.id, account.providerId),
        probeOptions: cliAccounts.buildProbeOptions(account.id),
      }
    },
    getBoundIdentityKey: (accountId) => usageRepository.getAccount(accountId)?.identityKey ?? null,
    getLatestSample: (accountId) => usageRepository.getLatestSample(accountId),
    now,
    ...(runCommand ? { runCommand } : {}),
  })

  async function checkLogin(accountId) {
    const check = await eligibility.checkLogin(accountId)
    if (check) repository.recordLoginCheck(check)
    return check
  }

  const service = createAccountChainService({
    repository,
    policy: createChainPolicyPort({ repository }),
    checkLogin,
    describeAccount,
    listAccounts: () =>
      listAccounts().map((account) => ({ id: account.id, providerId: account.providerId, label: account.label })),
    listLiveSessions,
    setSessionAccountMode,
    emit,
    log,
    now,
  })

  const view = createAccountChainView({ repository, describeAccount, listLiveSessions, now })

  return { checkLogin, repository, service, view }
}

module.exports = {
  createAccountChainRuntime,
}
