'use strict'

const { detectAvailabilityIssue } = require('./orchestrator/model-availability.cjs')

/**
 * Detecta, na saída de uma sessão interativa de terminal, se a CONTA que a
 * está rodando bateu num limite ou perdeu a sessão — o sinal que uma futura
 * troca de conta por limite precisa para agir. Ver a task "Contas —
 * implementar troca por limite sem duplicar prompt, processo ou débito":
 * nenhuma peça de detecção existia para o terminal interativo antes desta
 * função; só o orquestrador (execução em lote de vários modelos) já
 * detectava limite/autenticação na própria saída da CLI.
 *
 * Reaproveita o classificador já testado do orquestrador
 * (`detectAvailabilityIssue`, em `orchestrator/model-availability.cjs`) em
 * vez de duplicar os regexes de "rate limit"/"usage limit"/401/429 — o
 * vocabulário de erro de uma CLI não muda por ela estar rodando dentro do
 * orquestrador ou dentro de um terminal interativo; só o texto observado (e
 * o que se faz a seguir) muda.
 *
 * Esta função só DETECTA — não decide nem executa nenhuma troca de conta,
 * não pausa processo, não define idempotency key. Essas partes (o grosso do
 * "O que fazer" da task original) continuam em aberto; ver o registro da
 * task para o que falta.
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
