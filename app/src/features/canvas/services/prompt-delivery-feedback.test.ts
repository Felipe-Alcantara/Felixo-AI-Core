import { describe, expect, it } from 'vitest'
import {
  describeCombinedInsertFeedback,
  describeSingleInsertFeedback,
  describeSkillActivationFeedback,
  toActivationResult,
} from './prompt-delivery-feedback'

describe('describeSingleInsertFeedback', () => {
  it('sent: diz que o texto foi só digitado e espera o Enter da pessoa', () => {
    expect(describeSingleInsertFeedback('sent')).toEqual({
      text: 'Digitado no terminal aberto. Revise e aperte Enter para enviar.',
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
      text: '3 prompts combinados e digitados no terminal. Revise e aperte Enter para enviar.',
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

describe('fallback inline: entrega, mas nunca com o texto do caminho normal', () => {
  it.each([
    ['prompt único', describeSingleInsertFeedback],
    ['skill', describeSkillActivationFeedback],
    ['combinação', (result: Parameters<typeof describeSingleInsertFeedback>[0]) => describeCombinedInsertFeedback(result, 2)],
  ] as const)('%s', (_label, describe) => {
    const sent = describe('sent')
    const inline = describe('sent-inline')
    expect(inline.isError).toBe(false)
    expect(inline.text).not.toBe(sent.text)
    expect(inline.text).toContain('arquivo temporário do contexto falhou')
    // Os quatro desfechos têm textos diferentes.
    const texts = (['sent', 'sent-inline', 'copied', 'failed'] as const).map((result) => describe(result).text)
    expect(new Set(texts).size).toBe(4)
    expect(describe('failed').isError).toBe(true)
  })
})

describe('toActivationResult', () => {
  it('traduz o resultado do store para o painel', () => {
    expect(toActivationResult({ delivered: true })).toBe('sent')
    expect(toActivationResult({ delivered: true, inline: true })).toBe('sent-inline')
    expect(toActivationResult({ delivered: false, reason: 'rejected' })).toBe('failed')
    expect(toActivationResult({ delivered: false, reason: 'no-session' })).toBe('failed')
  })
})

