import type { SkillActivationResult } from '../components/tools/SkillsPanel'

export type PromptDeliveryFeedback = {
  text: string
  isError: boolean
}

/**
 * Turns a real `SkillActivationResult` into the message PromptsPanel shows,
 * pulled out as a pure function so the three outcomes (sent/copied/failed)
 * are covered by a plain unit test instead of only by eyeballing the JSX.
 *
 * `failed` must never read like a success — that was exactly the bug this
 * whole task chain exists to fix (a false "enviado"/"combinados" message
 * when the PTY never actually confirmed the write).
 */
export function describeSingleInsertFeedback(result: SkillActivationResult): PromptDeliveryFeedback {
  if (result === 'sent') {
    return { text: 'Inserido no terminal aberto.', isError: false }
  }
  if (result === 'copied') {
    return { text: 'Sem terminal aberto — copiado para a área de transferência.', isError: false }
  }
  return { text: 'O terminal não confirmou o recebimento. Tente novamente.', isError: true }
}

/** Same idea, for the "combine and send N prompts" action. */
export function describeCombinedInsertFeedback(
  result: SkillActivationResult,
  count: number,
): PromptDeliveryFeedback {
  if (result === 'sent') {
    return { text: `${count} prompts combinados e enviados.`, isError: false }
  }
  if (result === 'copied') {
    return { text: `${count} prompts combinados e copiados.`, isError: false }
  }
  return { text: 'O terminal não confirmou o recebimento. Tente novamente.', isError: true }
}
