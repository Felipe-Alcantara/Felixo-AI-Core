'use strict'

/**
 * @module accounts/account-chain-port
 * Adaptadores entre o serviço da cadeia (`account-chain-service.cjs`) e as
 * peças que ele recebe por injeção: a regra pura (`account-chain-policy.cjs`)
 * e os fatos de cada conta (registro de contas + última amostra do painel).
 *
 * O serviço chama a política com o formato do cabeçalho dele; a política
 * pura foi escrita com outro (fatos por conta, `chainEnabled`,
 * `accountStatus`). Esta porta só traduz, sem regra própria: toda decisão
 * continua na política, e a mesma conta de cobrança, multiplicador e
 * capacidade serve à ordem da estratégia e ao que a interface mostra.
 */

const defaultPolicy = require('./account-chain-policy.cjs')

/**
 * Status da conta para a política: removida, sem chave (Openia sem chave
 * configurada) ou ok. Nunca devolve a chave: só o fato.
 */
function resolveAccountStatus(account) {
  if (!account) return 'removed'
  if (account.providerId === 'openia' && account.secretConfigured !== true) return 'missing_key'
  return 'ok'
}

/**
 * Fatos da conta que o serviço e a interface leem: rótulo, provedor, status
 * e a última amostra do painel como `measurement`. `null` = conta removida.
 * Um registro de contas ilegível lança: o serviço trata como conta fora
 * (fail-closed).
 *
 * @param {{ listAccounts: () => Array<{ id: string, providerId: string, label: string, secretConfigured?: boolean }>, getLatestSample?: (accountId: string) => object | null }} deps
 * @returns {(accountId: string) => ({ accountId: string, providerId: string, label: string, accountStatus: 'ok' | 'missing_key', measurement: object | null } | null)}
 */
function createAccountDescriber({ listAccounts, getLatestSample = () => null }) {
  return function describeAccount(accountId) {
    const account = (listAccounts() ?? []).find((item) => item?.id === accountId) ?? null
    if (!account) return null
    let measurement = null
    try {
      measurement = getLatestSample(accountId) ?? null
    } catch {
      // Sem amostra a capacidade fica "sem medição atual"; nunca vira 0 nem 100.
      measurement = null
    }
    return {
      accountId: account.id,
      providerId: account.providerId,
      label: typeof account.label === 'string' ? account.label : account.id,
      accountStatus: resolveAccountStatus(account),
      measurement,
    }
  }
}

/**
 * Cobrança, multiplicador e capacidade de uma conta, pela política pura.
 *
 * @param {{ member?: object | null, account?: object | null, loginCheck?: object | null, nowMs: number, policy?: object }} input
 */
function computeAccountFigures({ member = null, account = null, loginCheck = null, nowMs, policy = defaultPolicy }) {
  const sample = account?.measurement ?? null
  const multiplier = policy.resolvePlanMultiplier({
    planFields: [loginCheck?.plan ?? null, sample?.metadata?.statusDetails?.loginMethod ?? null],
    declared: member?.multiplierDeclared ?? null,
  })
  const billing = policy.resolveBilling({
    declared: member?.billingDeclared ?? null,
    detected: loginCheck?.billingDetected ?? null,
  })
  const capacity = policy.computeCapacity({ sample, multiplier, nowMs })
  return { sample, multiplier, billing, capacity }
}

/**
 * Política no formato que o serviço da cadeia chama (ver o cabeçalho de
 * `account-chain-service.cjs`).
 *
 * A identidade duplicada depende da lista: uma conta com a mesma identidade
 * da origem ou de um membro habilitado mais acima na ordem manual é a mesma
 * conta real (§6.1). O serviço avalia membro a membro, então a porta monta
 * essas identidades a partir das checagens gravadas.
 *
 * @param {{ repository: object, policy?: object }} deps
 */
function createChainPolicyPort({ repository, policy = defaultPolicy }) {
  function excludedIdentityKeysFor(member, sourceAccountId) {
    const keys = []
    const push = (accountId) => {
      const key = repository.getLoginCheck(accountId)?.identityKey
      if (key && !keys.includes(key)) keys.push(key)
    }
    if (sourceAccountId && sourceAccountId !== member.accountId) push(sourceAccountId)
    for (const other of repository.listMembers()) {
      if (other.accountId === member.accountId || other.accountId === sourceAccountId || !other.enabled) continue
      const above = other.position < member.position || (other.position === member.position && other.accountId < member.accountId)
      if (above) push(other.accountId)
    }
    return keys
  }

  function evaluateEligibility({ nowMs, settings, member, account, cooldown, loginCheck, sourceAccountId, visitedAccountIds }) {
    return policy.evaluateEligibility({
      chainEnabled: settings?.enabled === true,
      member,
      accountStatus: account?.accountStatus ?? 'removed',
      cooldown: cooldown ?? null,
      loginCheck: loginCheck ?? null,
      sample: account?.measurement ?? null,
      nowMs,
      sourceAccountId: sourceAccountId ?? null,
      visitedAccountIds: visitedAccountIds ?? [],
      excludedIdentityKeys: excludedIdentityKeysFor(member, sourceAccountId ?? null),
    })
  }

  function rankCandidates({ strategy, candidates, lastDestinationAccountId = null, nowMs }) {
    const enriched = (candidates ?? []).map((candidate) => {
      const figures = computeAccountFigures({
        member: candidate.member,
        account: candidate.account,
        loginCheck: candidate.loginCheck,
        nowMs,
        policy,
      })
      return { ...candidate, capacity: figures.capacity, billing: figures.billing }
    })
    return policy.rankCandidates({
      strategy,
      candidates: enriched,
      members: repository.listMembers(),
      lastSpawnedAccountId: lastDestinationAccountId,
    })
  }

  function resolveCooldownEnd({ providerId, failureClass, evidence, measurement, nowMs }) {
    return policy.resolveCooldownEnd({
      providerId,
      failureClass,
      detectedAtMs: nowMs,
      nowMs,
      sample: measurement ?? null,
      resetText: evidence ?? null,
    })
  }

  return { evaluateEligibility, rankCandidates, resolveCooldownEnd }
}

module.exports = {
  computeAccountFigures,
  createAccountDescriber,
  createChainPolicyPort,
  resolveAccountStatus,
}
