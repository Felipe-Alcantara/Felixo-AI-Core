'use strict'

/**
 * Trava de retomada do chat: a conversa nativa de uma thread só continua na
 * mesma pasta e na mesma conta em que nasceu. É a mesma regra que o canvas usa
 * (`explainAgentResume`, em `src/features/canvas/services/agent-session.ts`) e
 * os motivos levam os mesmos códigos (`cwd-mismatch`, `account-mismatch`); o
 * texto para a pessoa sai de lá, no renderer. O teste de paridade
 * (`chat-resume-plan.test.cjs`) confere as duas decisões nos mesmos casos.
 *
 * Retomar em outra conta abriria o histórico de uma conta na cobrança de
 * outra; em outra pasta, a CLI não acha a conversa. Nos dois casos a thread
 * recomeça como conversa nova (o chat reenvia o histórico no pedido) e o
 * motivo volta para a UI. O ID da conversa nunca sai daqui.
 */

/**
 * Confere (e registra) pasta e conta de uma thread do chat antes do spawn.
 *
 * @param {{ providerSessionId: string | null, hasStarted: boolean, origin?: { cwd: string, accountId: string | null } }} threadSession
 * @param {{ cwd?: string | null, accountId?: string | null }} current
 * @returns {{ reasons: Array<'cwd-mismatch' | 'account-mismatch'>, previousCwd: string } | null}
 *   `null` quando a conversa segue; senão o motivo, com a sessão já zerada.
 */
function checkChatThreadResume(threadSession, current) {
  const origin = { cwd: current?.cwd ?? '', accountId: current?.accountId ?? null }
  const previous = threadSession.origin
  threadSession.origin = origin

  if (!previous || (!threadSession.hasStarted && !threadSession.providerSessionId)) return null

  const reasons = []
  if (previous.cwd !== origin.cwd) reasons.push('cwd-mismatch')
  if (previous.accountId !== origin.accountId) reasons.push('account-mismatch')
  if (reasons.length === 0) return null

  threadSession.providerSessionId = null
  threadSession.hasStarted = false
  return { reasons, previousCwd: previous.cwd }
}

module.exports = { checkChatThreadResume }
