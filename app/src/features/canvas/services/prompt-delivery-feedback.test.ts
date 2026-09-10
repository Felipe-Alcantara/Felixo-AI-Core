import { describe, expect, it } from 'vitest'
import {
  describeCombinedInsertFeedback,
  describeSingleInsertFeedback,
} from './prompt-delivery-feedback'

describe('describeSingleInsertFeedback', () => {
  it('sent: mensagem de sucesso, sem erro', () => {
    expect(describeSingleInsertFeedback('sent')).toEqual({
      text: 'Inserido no terminal aberto.',
      isError: false,
    })
  })

  it('copied: mensagem de fallback pro clipboard, sem erro', () => {
    expect(describeSingleInsertFeedback('copied')).toEqual({
      text: 'Sem terminal aberto — copiado para a área de transferência.',
      isError: false,
    })
  })

  it('failed: mensagem acionável marcada como erro, nunca como sucesso', () => {
    const feedback = describeSingleInsertFeedback('failed')
    expect(feedback.isError).toBe(true)
    expect(feedback.text).not.toMatch(/inserido|copiado/i)
    expect(feedback.text).toMatch(/tente novamente/i)
  })
})

describe('describeCombinedInsertFeedback', () => {
  it('sent: soma a contagem de prompts na mensagem', () => {
    expect(describeCombinedInsertFeedback('sent', 3)).toEqual({
      text: '3 prompts combinados e enviados.',
      isError: false,
    })
  })

  it('copied: soma a contagem, sem erro', () => {
    expect(describeCombinedInsertFeedback('copied', 2)).toEqual({
      text: '2 prompts combinados e copiados.',
      isError: false,
    })
  })

  it('failed: nunca finge que os prompts combinados foram enviados', () => {
    const feedback = describeCombinedInsertFeedback('failed', 5)
    expect(feedback.isError).toBe(true)
    expect(feedback.text).not.toMatch(/enviados|copiados/i)
  })
})
