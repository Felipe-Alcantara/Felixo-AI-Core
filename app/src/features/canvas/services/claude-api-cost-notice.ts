/**
 * Aviso de custo ao abrir o bloco Claude API: a conta por chave é cobrada por
 * token a cada mensagem, então o aviso vem uma vez (por bloco aberto), não por
 * mensagem. "Não perguntar de novo" é lembrado por conta e não há teto de gasto.
 */
import { claudeApiCostConsentKey, costConsent, type CostConsent } from './usage-cost-consent'

export type ClaudeApiCostNotice = {
  /** O aviso ainda precisa ser mostrado para este bloco e esta conta? */
  needed: (nodeId: string, accountId: string) => boolean
  /** A pessoa leu; com `remember`, a conta não pergunta mais. */
  acknowledge: (nodeId: string, accountId: string, remember: boolean) => void
}

export function createClaudeApiCostNotice(consent: CostConsent): ClaudeApiCostNotice {
  const seen = new Set<string>()
  const keyOf = (nodeId: string, accountId: string) => `${nodeId}\u0000${accountId}`
  return {
    needed: (nodeId, accountId) => !seen.has(keyOf(nodeId, accountId)) && !consent.has(claudeApiCostConsentKey(accountId)),
    acknowledge(nodeId, accountId, remember) {
      seen.add(keyOf(nodeId, accountId))
      if (remember) consent.remember(claudeApiCostConsentKey(accountId))
    },
  }
}

export const claudeApiCostNotice = createClaudeApiCostNotice(costConsent)
