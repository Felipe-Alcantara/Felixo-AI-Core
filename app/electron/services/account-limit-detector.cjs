'use strict'

const { detectAvailabilityIssue } = require('./orchestrator/model-availability.cjs')

/**
 * Detecta, num texto de erro de uma CLI, se a CONTA que a está rodando bateu
 * num limite, ficou sem crédito ou perdeu a sessão — o sinal que a cadeia de
 * contas precisa para agir (ver `docs/projeto/POLITICA-CONTAS.md`).
 *
 * Fachada: mantém a API de antes e delega ao adaptador do orquestrador
 * (`detectAvailabilityIssue`), que por sua vez delega à taxonomia única
 * (`accounts/failure-taxonomy.cjs`) na origem `fluxo` (erro de execução). O
 * vocabulário de erro de uma CLI não muda por ela estar no orquestrador ou
 * num terminal; o que muda é o que se lê: a saída contínua de um terminal
 * interativo usa a origem `pty` da taxonomia, que só aceita as frases do
 * provedor da sessão.
 *
 * Esta função só DETECTA — não decide nem executa troca de conta.
 */
function detectAccountLimitIssue({
  accountId,
  providerId,
  text,
  now = () => Date.now(),
} = {}) {
  const nowMs = typeof now === 'function' ? now() : Date.now()
  const issue = detectAvailabilityIssue({
    message: text,
    cliType: providerId,
    nowMs,
  })

  if (!issue) {
    return null
  }

  return {
    ...issue,
    accountId: typeof accountId === 'string' && accountId.trim() ? accountId.trim() : null,
    providerId: typeof providerId === 'string' && providerId.trim() ? providerId.trim() : null,
  }
}

module.exports = {
  detectAccountLimitIssue,
}
