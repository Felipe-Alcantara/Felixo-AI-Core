'use strict'

/**
 * @module cli-failure-codes
 * Códigos estruturados que as CLIs devolvem junto do erro, por provedor. São a
 * fonte primária da taxonomia na origem `fluxo` (chat e orquestrador): não
 * mudam quando o texto ou a TUI mudam. O texto fica como reserva para código
 * ausente ou desconhecido.
 *
 * Medidos nas versões instaladas em 16/11/2026, sem rede nem conta:
 * - Claude Code 2.1.323: campo `error` da mensagem `assistant` do stream-json
 *   (lista `api_error:*` no binário) e `api_error_status` do `result`;
 * - Codex 0.171.0-alpha.7: `codexErrorInfo` de `TurnError`, no esquema que o
 *   próprio `codex app-server generate-json-schema` gera (enum, ou objeto com
 *   `httpStatusCode`);
 * - Gemini CLI 0.69.0-preview.0 (ACP): o `code` do erro JSON-RPC é o status
 *   HTTP do pedido (`new RequestError(status, …)`), e `-32000` é
 *   "Authentication required".
 *
 * Um código conhecido que não é falha de conta (janela de contexto, pedido
 * inválido, política) vira `unknown` sem olhar o texto: é aí que o texto
 * enganaria ("context window limit" não é limite da conta).
 */

const { STATUS_CODES } = require('./cli-failure-patterns.cjs')

const AUTH = Object.freeze({ failureClass: 'auth' })
const BILLING = Object.freeze({ failureClass: 'billing' })
const LIMIT = Object.freeze({ failureClass: 'limit' })
const PROVIDER = Object.freeze({ failureClass: 'provider' })
const CAPACITY = Object.freeze({ failureClass: 'provider', capacity: true })
const NETWORK = Object.freeze({ failureClass: 'network' })
const NOT_ACCOUNT = Object.freeze({ failureClass: 'unknown' })

const STRUCTURED_CODES = Object.freeze({
  claude: Object.freeze({
    authentication_failed: AUTH,
    oauth_org_not_allowed: AUTH,
    account_on_hold: AUTH,
    verification_required: AUTH,
    cloud_credential_error: AUTH,
    billing_error: BILLING,
    rate_limit: LIMIT,
    overloaded: CAPACITY,
    server_error: PROVIDER,
    invalid_request: NOT_ACCOUNT,
    model_not_found: NOT_ACCOUNT,
    max_output_tokens: NOT_ACCOUNT,
    // `unknown` fica de fora: é o próprio Claude dizendo que não sabe, então vale o texto.
  }),
  codex: Object.freeze({
    usageLimitExceeded: LIMIT,
    rateLimitExceeded: LIMIT,
    unauthorized: AUTH,
    serverOverloaded: CAPACITY,
    flexUnavailable: CAPACITY,
    policyCapacityUnavailable: CAPACITY,
    internalServerError: PROVIDER,
    // Variantes com `httpStatusCode`: o status (se veio) decide; sem ele, é rede.
    httpConnectionFailed: NETWORK,
    responseStreamConnectionFailed: NETWORK,
    responseStreamDisconnected: NETWORK,
    responseTooManyFailedAttempts: NETWORK,
    contextWindowExceeded: NOT_ACCOUNT,
    sessionBudgetExceeded: NOT_ACCOUNT,
    modelNotFound: NOT_ACCOUNT,
    cyberPolicy: NOT_ACCOUNT,
    misalignmentPolicyViolation: NOT_ACCOUNT,
    tooManyDenials: NOT_ACCOUNT,
    badRequest: NOT_ACCOUNT,
    threadRollbackFailed: NOT_ACCOUNT,
    sandboxError: NOT_ACCOUNT,
    inferenceHookDenied: NOT_ACCOUNT,
    activeTurnNotSteerable: NOT_ACCOUNT,
    // `other` fica de fora: vale o texto.
  }),
  gemini: Object.freeze({
    // Erro JSON-RPC do ACP ("Authentication required"); os status HTTP vêm pela tabela de status.
    '-32000': AUTH,
  }),
})

const STATUS_BY_CODE = new Map(STATUS_CODES.map((entry) => [entry.code, entry]))

function fromStatus(httpStatus) {
  const status = Number(httpStatus)
  if (!Number.isInteger(status)) return null
  const entry = STATUS_BY_CODE.get(status)
  if (entry) {
    return {
      failureClass: entry.failureClass,
      ambiguous: entry.ambiguous === true,
      // 529 é sobrecarga: capacidade do provedor, como o `overloaded` do Claude.
      capacity: status === 529,
    }
  }
  return status >= 500 && status <= 599 ? { failureClass: 'provider', ambiguous: false, capacity: false } : null
}

/**
 * Classe pelo código estruturado, ou `null` quando ele não decide (ausente,
 * desconhecido, ou o próprio provedor diz "não sei").
 *
 * @param {{ providerId: string | null, code?: string | number | null, httpStatus?: number | null }} input
 * @returns {{ failureClass: string, ambiguous: boolean, capacity: boolean, code: string } | null}
 */
function classifyStructuredFailure({ providerId, code = null, httpStatus = null } = {}) {
  const table = providerId ? STRUCTURED_CODES[providerId] : null
  const key = code === null || code === undefined ? '' : String(code).trim()

  // Gemini: o `code` do erro JSON-RPC é o próprio status HTTP.
  if (providerId === 'gemini' && /^\d{3}$/.test(key)) {
    const byStatus = fromStatus(Number(key))
    return byStatus ? { ...byStatus, code: key } : null
  }

  const known = table && key && Object.hasOwn(table, key) ? table[key] : null
  // O status HTTP que veio junto é mais preciso que a variante de conexão do Codex.
  const byStatus = fromStatus(httpStatus)
  if (byStatus && (!known || known === NETWORK)) {
    return { ...byStatus, code: key || `http:${Number(httpStatus)}` }
  }
  if (!known) return null
  return { failureClass: known.failureClass, ambiguous: false, capacity: known.capacity === true, code: key }
}

module.exports = {
  STRUCTURED_CODES,
  classifyStructuredFailure,
}
