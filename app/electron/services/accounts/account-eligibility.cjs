'use strict'

/**
 * @module accounts/account-eligibility
 * Checagem de login por conta: a porta de elegibilidade da cadeia de contas
 * (ver `docs/projeto/POLITICA-CONTAS.md`).
 *
 * Uma conta só pode receber uma troca se a própria CLI confirmou, há pouco,
 * que há login nela. Este módulo produz essa confirmação e nada mais: a regra
 * de quem é apto fica na política pura (`account-chain-policy.cjs`) e a
 * gravação no SQLite fica no serviço da cadeia, que guarda o objeto devolvido
 * aqui com `recordLoginCheck` (o formato é exatamente o de entrada dele).
 *
 * O que roda:
 * - só o comando de auth da fonte (`codex login status`, `claude auth status
 *   --json`, `openia key status --json`) e o probe local de identidade, via
 *   `checkAccountAuth`, o mesmo pedaço que o painel usa. A consulta ao vivo de
 *   uso (cara: o `/status` do Claude abre um PTY) não roda;
 * - com o ambiente com que o terminal da conta nasce (`createProfileCommandEnv`:
 *   perfil da conta, sem as chaves de API herdadas do app). O que é conferido
 *   é o que será lançado.
 *
 * Custo na máquina fraca (2c/4t): no máximo `LOGIN_CHECK_MAX_CONCURRENCY` CLIs
 * ao mesmo tempo, uma checagem em voo por conta (quem pede a mesma conta
 * espera a mesma promessa), reuso da amostra do painel quando ela conferiu o
 * login há até `ELIGIBILITY_TTL_MS`, e nenhum timer de fundo: só roda quando
 * alguém pede (proposta ou o botão "Conferir login agora").
 *
 * Limite declarado: `codex login status` e `claude auth status` provam que a
 * credencial local existe, não que o servidor a aceita. Por isso a UI diz
 * "checagem local", e uma falha de login no bloco novo volta ao registro de
 * trocas.
 */

const {
  ELIGIBILITY_TTL_MS,
  LOGIN_CHECKS_PER_PROPOSAL_MAX,
  LOGIN_CHECK_MAX_CONCURRENCY,
  SWITCH_LABEL_MAX_CHARS,
} = require('./account-chain-constants.cjs')
const { checkAccountAuth, createProfileCommandEnv } = require('../agent-usage-service.cjs')
const { getAgentUsageSource } = require('../agent-usage-sources.cjs')
const { runLocalProbe } = require('../agent-usage-local-probes.cjs')
const { redactSecrets } = require('../official-cli-account-status.cjs')
const { runBufferedCommand } = require('../official-cli-service.cjs')

/**
 * Status da checagem a partir do que o comando devolveu.
 *
 * Falha de processo vem antes do parser: uma CLI que não existe ou que não
 * terminou no prazo nunca vira "logada", mesmo que tenha impresso metade de
 * uma resposta. Fora isso vale o parser, inclusive com `ok: false` (o Claude
 * sai com código 1 sem login e imprime o JSON mesmo assim).
 *
 * @param {{ supported: boolean, auth?: { authStatus?: string } | null, result?: { ok?: boolean, errorCode?: string, timedOut?: boolean } | null }} input
 * @returns {'logged_in'|'logged_out'|'unknown'|'cli_ausente'|'tempo_esgotado'|'erro'|'sem_checagem'}
 */
function resolveLoginStatus({ supported, auth, result }) {
  if (!supported) return 'sem_checagem'
  if (result?.errorCode === 'ENOENT') return 'cli_ausente'
  if (result?.timedOut === true) return 'tempo_esgotado'
  if (auth?.authStatus === 'logged_in' || auth?.authStatus === 'logged_out') return auth.authStatus
  return result?.ok === true ? 'unknown' : 'erro'
}

/**
 * Identidade que a CLI informou comparada com a vinculada à conta no painel.
 * `duplicate` (a mesma identidade de outro membro ou da origem) depende da
 * lista inteira e é decidido pela política, não aqui.
 *
 * @returns {'matched'|'unbound'|'different'|'missing'}
 */
function resolveIdentityStatus(observedIdentityKey, boundIdentityKey) {
  if (!observedIdentityKey) return 'missing'
  if (!boundIdentityKey) return 'unbound'
  return observedIdentityKey === boundIdentityKey ? 'matched' : 'different'
}

/**
 * A amostra do painel vale como checagem quando conferiu o login há até
 * `ttlMs`. Horário ausente, inválido ou no futuro não vale: sem prova de
 * quando foi conferido, a checagem roda de novo.
 */
function isPanelSampleUsable(sample, nowMs, ttlMs = ELIGIBILITY_TTL_MS) {
  if (!sample || sample.metadata?.authStatus !== 'logged_in') return false
  const collectedAtMs = Date.parse(sample.collectedAt)
  if (!Number.isFinite(collectedAtMs) || !Number.isFinite(nowMs)) return false
  const ageMs = nowMs - collectedAtMs
  return ageMs >= 0 && ageMs <= ttlMs
}

/** Texto que a CLI imprimiu (método, plano), redigido e no teto do registro. */
function clipText(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  return redactSecrets(value.trim()).slice(0, SWITCH_LABEL_MAX_CHARS)
}

function hasLoginCommand(providerId) {
  return Boolean(getAgentUsageSource(providerId)?.auth)
}

/**
 * Cria o verificador de login da cadeia.
 *
 * @param {object} deps
 * @param {(accountId: string) => ({ accountId: string, providerId: string, profileEnv?: Record<string, string>, probeOptions?: object } | null)} deps.resolveAccount
 *   Conta com perfil (registro de contas); `null` quando não existe mais.
 * @param {(accountId: string) => (string | null)} [deps.getBoundIdentityKey]
 *   Impressão digital vinculada à conta no painel (`agent_usage_accounts`).
 * @param {(accountId: string) => (object | null)} [deps.getLatestSample]
 *   Última amostra do painel da conta, para reuso.
 * @param {Function} [deps.runCommand] Executor de comando (`runBufferedCommand`).
 * @param {Function} [deps.probe] Probe local de identidade.
 * @param {() => number} [deps.now]
 * @param {number} [deps.maxConcurrent]
 * @param {number} [deps.ttlMs]
 * @param {string} [deps.platformName]
 */
function createAccountEligibilityChecker({
  resolveAccount,
  getBoundIdentityKey = () => null,
  getLatestSample = () => null,
  runCommand = runBufferedCommand,
  probe = runLocalProbe,
  now = () => Date.now(),
  maxConcurrent = LOGIN_CHECK_MAX_CONCURRENCY,
  ttlMs = ELIGIBILITY_TTL_MS,
  platformName = process.platform,
} = {}) {
  if (typeof resolveAccount !== 'function') {
    throw new TypeError('A checagem de login precisa de resolveAccount.')
  }
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new TypeError('maxConcurrent precisa ser um inteiro positivo.')
  }

  /** Uma checagem em voo por conta: quem pede a mesma conta espera a mesma. */
  const inFlight = new Map()
  /** Fila de quem espera uma vaga; a vaga passa direto para o próximo. */
  const waiting = []
  let running = 0

  function acquireSlot() {
    if (running < maxConcurrent) {
      running += 1
      return Promise.resolve()
    }
    return new Promise((resolve) => waiting.push(resolve))
  }

  function releaseSlot() {
    const next = waiting.shift()
    if (next) {
      next()
    } else {
      running -= 1
    }
  }

  function readBoundIdentityKey(accountId) {
    try {
      return getBoundIdentityKey(accountId) ?? null
    } catch {
      // Sem a identidade vinculada a conta fica `unbound`: a política não a
      // exclui por isso, mas também não afirma que é a mesma conta.
      return null
    }
  }

  function readLatestSample(accountId) {
    try {
      return getLatestSample(accountId) ?? null
    } catch {
      // Falha ao ler o painel só custa rodar a checagem de novo.
      return null
    }
  }

  function createCheck(account, values) {
    return {
      accountId: account.accountId,
      providerId: account.providerId,
      status: values.status,
      checkedAt: values.checkedAt,
      source: values.source,
      durationMs: values.durationMs ?? null,
      method: clipText(values.method),
      plan: clipText(values.plan),
      // Cobrança e multiplicador detectados são decididos pela política
      // (`classifyBilling`, `detectPlanMultiplier`) sobre método e plano.
      billingDetected: null,
      apiKeySourcePresent: Boolean(values.apiKeySource),
      multiplierDetected: null,
      identityKey: values.identityKey ?? null,
      identityStatus: resolveIdentityStatus(values.identityKey ?? null, readBoundIdentityKey(account.accountId)),
    }
  }

  function checkFromPanelSample(account) {
    const sample = readLatestSample(account.accountId)
    if (!isPanelSampleUsable(sample, now(), ttlMs)) return null
    return createCheck(account, {
      status: 'logged_in',
      checkedAt: new Date(Date.parse(sample.collectedAt)).toISOString(),
      source: 'amostra_do_painel',
      durationMs: null,
      method: sample.metadata?.method,
      plan: sample.metadata?.plan,
      apiKeySource: sample.metadata?.apiKeySource,
      identityKey: sample.observedIdentityKey ?? null,
    })
  }

  async function runCheck(account) {
    await acquireSlot()
    try {
      const outcome = await checkAccountAuth({
        providerId: account.providerId,
        runCommand,
        probe,
        probeOptions: account.probeOptions,
        env: createProfileCommandEnv(
          { providerId: account.providerId, profileEnv: account.profileEnv ?? {} },
          platformName,
        ),
        clock: now,
      })
      const status = resolveLoginStatus({ supported: true, auth: outcome.auth, result: outcome.result })
      const auth = outcome.auth ?? {}
      return createCheck(account, {
        status,
        checkedAt: new Date(now()).toISOString(),
        source: 'checagem',
        durationMs: Math.round(outcome.durationMs ?? 0),
        method: auth.method,
        plan: auth.plan,
        apiKeySource: auth.apiKeySource,
        identityKey: auth.identityKey ?? null,
      })
    } finally {
      releaseSlot()
    }
  }

  /**
   * Confere o login de uma conta.
   *
   * Sem `force`, uma amostra do painel com login conferido há até `ttlMs`
   * vale como checagem e nenhuma CLI roda. Provedor sem comando de login
   * (hoje o Gemini) devolve `sem_checagem` sem rodar nada.
   *
   * @param {string} accountId
   * @param {{ force?: boolean }} [options] `force` ignora a amostra do painel ("Conferir login agora").
   * @returns {Promise<object | null>} A checagem, no formato de `recordLoginCheck`; `null` quando a conta não existe mais.
   */
  async function checkLogin(accountId, { force = false } = {}) {
    const account = resolveAccount(accountId)
    if (!account) return null

    const pending = inFlight.get(account.accountId)
    if (pending) return pending

    if (!hasLoginCommand(account.providerId)) {
      return createCheck(account, {
        status: 'sem_checagem',
        checkedAt: new Date(now()).toISOString(),
        source: 'checagem',
        durationMs: 0,
      })
    }

    if (!force) {
      const reused = checkFromPanelSample(account)
      if (reused) return reused
    }

    const promise = runCheck(account).finally(() => {
      inFlight.delete(account.accountId)
    })
    inFlight.set(account.accountId, promise)
    return promise
  }

  /**
   * Busca preguiçosa: confere as contas na ordem dada, uma de cada vez, e
   * para na primeira que `accept` aprovar. Nunca confere mais que
   * `maxChecks` contas, então montar uma proposta custa no máximo esse número
   * de CLIs, não a lista inteira.
   *
   * @param {string[]} accountIds Na ordem da estratégia.
   * @param {{ maxChecks?: number, accept?: (check: object) => boolean, force?: boolean }} [options]
   * @returns {Promise<{ found: object | null, checks: object[] }>}
   */
  async function checkInOrder(
    accountIds,
    { maxChecks = LOGIN_CHECKS_PER_PROPOSAL_MAX, accept = (check) => check.status === 'logged_in', force = false } = {},
  ) {
    const ids = [...new Set((Array.isArray(accountIds) ? accountIds : []).filter(Boolean))].slice(
      0,
      Math.max(0, maxChecks),
    )
    const checks = []
    for (const accountId of ids) {
      const check = await checkLogin(accountId, { force })
      if (!check) continue
      checks.push(check)
      if (accept(check)) return { found: check, checks }
    }
    return { found: null, checks }
  }

  return Object.freeze({
    checkInOrder,
    checkLogin,
    /** Quantas CLIs de checagem estão rodando agora (para teste e diagnóstico). */
    runningCount: () => running,
  })
}

module.exports = {
  createAccountEligibilityChecker,
  isPanelSampleUsable,
  resolveIdentityStatus,
  resolveLoginStatus,
}
