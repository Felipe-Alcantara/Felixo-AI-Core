import type { SkillActivationResult } from '../components/tools/SkillsPanel'
import type { SendTextResult } from '../terminal/terminal-session-api'

export type PromptDeliveryFeedback = {
  text: string
  isError: boolean
}

/**
 * Turns a real `SkillActivationResult` into the message PromptsPanel shows,
 * pulled out as a pure function so the outcomes (sent/sent-inline/copied/failed)
 * are covered by a plain unit test instead of only by eyeballing the JSX.
 *
 * `failed` must never read like a success — that was exactly the bug this
 * whole task chain exists to fix (a false "enviado"/"combinados" message
 * when the PTY never actually confirmed the write).
 */
/**
 * O fallback inline chegou ao terminal, mas sem o arquivo temporário: o texto
 * foi direto, e o bloco mostra o aviso. É entrega, não erro — só não pode ler
 * igual ao caminho normal.
 */
const INLINE_SUFFIX = 'direto no texto, porque o arquivo temporário do contexto falhou (veja o aviso no bloco).'
const FAILED_TEXT = 'O terminal não confirmou o recebimento. Tente novamente.'

export function describeSingleInsertFeedback(result: SkillActivationResult): PromptDeliveryFeedback {
  if (result === 'sent') {
    return { text: 'Inserido no terminal aberto.', isError: false }
  }
  if (result === 'sent-inline') {
    return { text: `Inserido no terminal aberto, ${INLINE_SUFFIX}`, isError: false }
  }
  if (result === 'copied') {
    return { text: 'Sem terminal aberto — copiado para a área de transferência.', isError: false }
  }
  return { text: FAILED_TEXT, isError: true }
}

/**
 * Same idea, for the "combine and send N prompts" action. `count` é quantos
 * prompts entraram no texto (`combinedNames`), não quantos estavam marcados:
 * um prompt vazio fica fora da combinação e não pode entrar na conta.
 */
export function describeCombinedInsertFeedback(
  result: SkillActivationResult,
  count: number,
): PromptDeliveryFeedback {
  if (result === 'sent') {
    return { text: `${count} prompts combinados e enviados.`, isError: false }
  }
  if (result === 'sent-inline') {
    return { text: `${count} prompts combinados e enviados ${INLINE_SUFFIX}`, isError: false }
  }
  if (result === 'copied') {
    return { text: `${count} prompts combinados e copiados.`, isError: false }
  }
  return { text: FAILED_TEXT, isError: true }
}

/** O mesmo para a ativação de uma skill no painel de skills. */
export function describeSkillActivationFeedback(result: SkillActivationResult): PromptDeliveryFeedback {
  if (result === 'sent') {
    return { text: 'Enviada ao terminal aberto.', isError: false }
  }
  if (result === 'sent-inline') {
    return { text: `Enviada ao terminal aberto, ${INLINE_SUFFIX}`, isError: false }
  }
  if (result === 'copied') {
    return { text: 'Sem terminal aberto — copiada para a área de transferência.', isError: false }
  }
  return { text: FAILED_TEXT, isError: true }
}

/** O que o painel mostra para uma entrega no terminal aberto. */
export function toActivationResult(result: SendTextResult): SkillActivationResult {
  if (!result.delivered) return 'failed'
  return result.inline ? 'sent-inline' : 'sent'
}
