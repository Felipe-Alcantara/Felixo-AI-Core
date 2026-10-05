'use strict'

const {
  readCodexVersion,
  runCodexAppServerSession,
} = require('./codex-app-server-client.cjs')
const { normalizeCodexRateLimitsResult } = require('./codex-account-rate-limits.cjs')
const { buildCodexStatusDetails } = require('./codex-status-details.cjs')
const { readCodexStatusScreen } = require('./codex-status-screen.cjs')

/**
 * Consulta ao vivo do Codex para o painel "Limites e uso": tudo o que o
 * `/status` da CLI mostra sobre a conta, por duas fontes ao mesmo tempo.
 *
 * - O app-server (`codex app-server --stdio`) responde os números e os dados
 *   estruturados numa sessão só: limites (`account/rateLimits/read`, o único
 *   obrigatório), conta, configuração, modelos e histórico de tokens.
 * - A tela do `/status` (codex-status-screen.cjs) traz o texto exato que a CLI
 *   publica. Ela é complemento: se falhar, a amostra continua valendo e os
 *   detalhes dizem por que a tela não foi lida.
 *
 * As duas leituras usam o ambiente da conta pedida — o perfil de login de cada
 * conta Codex fica no próprio processo, então trocar de perfil não mistura
 * dados de uma conta na outra.
 */

const DEFAULT_TIMEOUT_MS = 30_000
// O app-server responde em 4–11 s nas medições de 02/10/2026; a folga dos
// pedidos opcionais (histórico de tokens) cabe dentro deste teto.
const APP_SERVER_TIMEOUT_MS = 20_000
const SCREEN_TIMEOUT_MS = 25_000

const STATUS_REQUESTS = Object.freeze([
  { method: 'account/rateLimits/read', params: null, required: true },
  { method: 'account/read', params: { refreshToken: false } },
  { method: 'config/read', params: { includeLayers: false } },
  { method: 'model/list', params: {} },
  { method: 'account/usage/read', params: null },
])

/**
 * @param {object} [dependencies]
 * @param {typeof runCodexAppServerSession} [dependencies.runSession]
 * @param {typeof readCodexStatusScreen | null} [dependencies.readScreen] `null` desliga a leitura da tela.
 * @param {() => number} [dependencies.now]
 */
function createCodexStatusQuery({
  runSession = runCodexAppServerSession,
  readScreen = readCodexStatusScreen,
  now = () => Date.now(),
} = {}) {
  return async function queryCodexStatus({
    env = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    // Teto da rodada ou "Reconectar": as duas leituras param na hora.
    signal = null,
  } = {}) {
    const [session, screen] = await Promise.all([
      runSession({
        accountEnv: env,
        timeoutMs: Math.min(timeoutMs, APP_SERVER_TIMEOUT_MS),
        requests: STATUS_REQUESTS,
        timeoutMessage: 'A consulta de limites do Codex excedeu o tempo limite.',
        signal,
      }),
      readStatusScreen(readScreen, { env, timeoutMs: Math.min(timeoutMs, SCREEN_TIMEOUT_MS), signal }),
    ])

    if (!session.ok) {
      return {
        ok: false,
        collectedAt: null,
        measuredAt: null,
        metrics: [],
        details: null,
        message: session.message ?? 'O app-server do Codex recusou a consulta de limites.',
      }
    }

    let limits
    try {
      limits = normalizeCodexRateLimitsResult(
        session.responses['account/rateLimits/read'].result,
        { now },
      )
    } catch {
      return {
        ok: false,
        collectedAt: null,
        measuredAt: null,
        metrics: [],
        details: null,
        message: 'A resposta do app-server do Codex veio em formato inválido.',
      }
    }

    return {
      ok: true,
      collectedAt: limits.collectedAt,
      measuredAt: limits.measuredAt,
      metrics: limits.metrics,
      availableCount: limits.availableCount,
      credits: limits.credits,
      details: {
        ...buildCodexStatusDetails({
          version: readCodexVersion(session.initialize),
          responses: session.responses,
          screen,
        }),
        usageCredits: limits.details.usageCredits,
      },
      message: null,
    }
  }
}

async function readStatusScreen(readScreen, options) {
  if (typeof readScreen !== 'function') {
    return null
  }
  try {
    return await readScreen(options)
  } catch {
    return { ok: false, message: 'A leitura da tela do /status falhou.' }
  }
}

const queryCodexStatus = createCodexStatusQuery()

module.exports = {
  STATUS_REQUESTS,
  createCodexStatusQuery,
  queryCodexStatus,
}
