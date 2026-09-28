'use strict'

/**
 * @module orchestration/provider-switch-record
 * Converte uma decisão de troca de provedor do orquestrador do chat numa linha
 * do registro de trocas (`account_switch_events`, kind `provider_switch`,
 * migration 017). Função pura: quem grava é o repositório da cadeia.
 *
 * O registro é o mesmo das trocas de conta, para que "toda troca tem motivo e
 * horário" valha também para o orquestrador. Só entram provedor, rótulo do
 * modelo, motivo já redigido pelo runner e horários: nunca prompt, saída do
 * agente, env ou segredo.
 */

const {
  SWITCH_LABEL_MAX_CHARS,
  SWITCH_REASON_MAX_CHARS,
} = require('../accounts/account-chain-constants.cjs')

// O registro guarda o provedor (como as trocas de conta), não o transporte:
// codex-app-server e gemini-acp são o mesmo provedor da CLI de origem.
const CLI_TYPE_PROVIDER_ID = Object.freeze({
  claude: 'claude',
  codex: 'codex',
  'codex-app-server': 'codex',
  gemini: 'gemini',
  'gemini-acp': 'gemini',
})

/**
 * @param {unknown} cliType
 * @returns {string | null}
 */
function getProviderIdForCliType(cliType) {
  if (typeof cliType !== 'string' || !cliType) {
    return null
  }

  return Object.hasOwn(CLI_TYPE_PROVIDER_ID, cliType) ? CLI_TYPE_PROVIDER_ID[cliType] : cliType
}

function clip(text, maxChars) {
  const value = String(text ?? '').trim()
  if (!value) {
    return null
  }

  return value.length > maxChars ? `${value.slice(0, maxChars - 1)}…` : value
}

function describeDecision(decision) {
  if (decision.note) {
    return decision.note
  }

  return decision.state === 'accepted'
    ? 'Troca de provedor aceita pela pessoa.'
    : 'Troca de provedor recusada pela pessoa.'
}

/**
 * @param {{
 *   decisionId: string, state: 'accepted' | 'refused', runId?: string,
 *   agentId?: string, fromCliType: string, toCliType: string,
 *   toModelName?: string | null, reason?: string | null, note?: string | null,
 *   requestedAt: string, decidedAt: string, expiresAt: string,
 * }} decision - O que o runner entrega em `recordSwitchDecision`.
 * @returns {object} Evento no formato de `insertSwitchEvent`.
 */
function buildProviderSwitchEventRecord(decision) {
  const state = decision?.state === 'accepted' ? 'accepted' : 'refused'
  const parts = [
    describeDecision({ ...decision, state }),
    decision.agentId ? `Sub-agente ${decision.agentId}.` : null,
    decision.reason ? `Motivo: ${decision.reason}` : null,
  ].filter(Boolean)

  return {
    id: decision.decisionId,
    kind: 'provider_switch',
    state,
    // A linhagem de uma decisão do orquestrador é o run que a pediu.
    lineageId: decision.runId ?? null,
    fromProviderId: getProviderIdForCliType(decision.fromCliType) ?? 'desconhecido',
    fromLabel: clip(decision.fromCliType, SWITCH_LABEL_MAX_CHARS),
    toProviderId: getProviderIdForCliType(decision.toCliType),
    toLabel: clip(decision.toModelName ?? decision.toCliType, SWITCH_LABEL_MAX_CHARS),
    reason: clip(parts.join(' '), SWITCH_REASON_MAX_CHARS),
    proposedAt: decision.requestedAt,
    decidedAt: decision.decidedAt,
    expiresAt: decision.expiresAt,
  }
}

module.exports = {
  buildProviderSwitchEventRecord,
  getProviderIdForCliType,
}
