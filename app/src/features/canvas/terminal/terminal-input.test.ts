import { describe, expect, it } from 'vitest'
import {
  isSubmittedTerminalText,
  splitTerminalSubmission,
  stripTerminalSubmission,
  toSubmittedTerminalText,
} from './terminal-input'

describe('toSubmittedTerminalText', () => {
  it('submits a prompt with CR instead of leaving a trailing LF in the PTY', () => {
    expect(toSubmittedTerminalText('Leia o plano\n')).toBe('Leia o plano\r')
    expect(toSubmittedTerminalText('Leia o plano\r\n')).toBe('Leia o plano\r')
  })

  it('preserves internal line breaks while normalizing the final submission key', () => {
    expect(toSubmittedTerminalText('Primeira linha\nSegunda linha')).toBe(
      'Primeira linha\nSegunda linha\r',
    )
  })

  it('separates prompt text from the Enter key for delayed submission', () => {
    expect(splitTerminalSubmission('/resume\n')).toEqual({
      text: '/resume',
      submit: '\r',
    })
  })

  // Contexto que só prepara o agente chega sem quebra final: é digitado na
  // entrada da CLI e espera o usuário escrever a tarefa. Enviá-lo sozinho
  // fazia o agente subir executando sem pedido nenhum.
  it('não inventa Enter para um prompt que não pede execução', () => {
    expect(splitTerminalSubmission('Contexto do canvas: ...')).toEqual({
      text: 'Contexto do canvas: ...',
      submit: null,
    })
    expect(isSubmittedTerminalText('Contexto do canvas: ...')).toBe(false)
    expect(isSubmittedTerminalText(toSubmittedTerminalText('Contexto do canvas: ...'))).toBe(
      true,
    )
  })

  // Blocos salvos antes desta mudança guardaram o contexto já com o Enter no
  // fim; ao reabrir o canvas eles voltariam a executar sozinhos.
  it('tira o Enter do contexto gravado no formato antigo', () => {
    expect(stripTerminalSubmission('Siga o padrão.\r')).toBe('Siga o padrão.')
    expect(stripTerminalSubmission('Siga o padrão.')).toBe('Siga o padrão.')
    expect(stripTerminalSubmission(undefined)).toBeUndefined()
  })
})
