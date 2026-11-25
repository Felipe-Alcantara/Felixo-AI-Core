import { describe, expect, it } from 'vitest'
import { compactGeneratorFields, montarPrompt, nomeSugerido } from './prompt-generator'
import { createGeneratedPromptInsertion } from '../../shared/types/prompt-insertion'

describe('montarPrompt', () => {
  it('só com o objetivo gera um prompt utilizável, sem seção vazia', () => {
    const text = montarPrompt({ objetivo: 'Revisar o PR 12' })
    expect(text).toContain('## Objetivo\nRevisar o PR 12')
    expect(text).toContain('## Como trabalhar')
    expect(text).not.toMatch(/## (Contexto|Formato de saída|Restrições|Critério de aceite)/)
  })

  it('com todos os campos gera as seções na ordem', () => {
    const text = montarPrompt({
      objetivo: 'a',
      contexto: 'b',
      formatoSaida: 'c',
      restricoes: 'd',
      criterioAceite: 'e',
    })
    const titles = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1])
    expect(titles).toEqual([
      'Objetivo',
      'Contexto',
      'Formato de saída',
      'Restrições',
      'Critério de aceite',
      'Como trabalhar',
    ])
  })

  it('preserva acentos e blocos de código sem alterar', () => {
    const contexto = 'Erro em "ação":\n```ts\nconst x = `olá ${1}`\n```'
    expect(montarPrompt({ objetivo: 'Corrigir', contexto })).toContain(`## Contexto\n${contexto}`)
  })

  it('ignora campo só com espaços e devolve vazio sem objetivo', () => {
    expect(montarPrompt({ objetivo: '  ', contexto: 'x' })).toBe('')
    expect(montarPrompt({ objetivo: 'a', contexto: '   ' })).not.toContain('Contexto')
  })
})

describe('nomeSugerido e compactGeneratorFields', () => {
  it('usa a primeira linha do objetivo e corta nomes longos', () => {
    expect(nomeSugerido({ objetivo: 'Resumir a reunião\nem tópicos' })).toBe('Resumir a reunião')
    expect(nomeSugerido({ objetivo: 'x'.repeat(100) })).toHaveLength(60)
    expect(nomeSugerido({ objetivo: '' })).toBe('Prompt gerado')
  })

  it('compacta só os campos preenchidos', () => {
    expect(compactGeneratorFields({ objetivo: ' a ', contexto: ' ', formatoSaida: 'b' })).toEqual({
      objetivo: 'a',
      formatoSaida: 'b',
    })
    expect(compactGeneratorFields({ objetivo: '' })).toBeUndefined()
  })
})

describe('proveniência generator', () => {
  it('a inserção carrega source generator e não envia Enter', () => {
    const insertion = createGeneratedPromptInsertion({ name: 'N', content: 'texto' }, { autoSubmit: false })
    expect(insertion.source).toBe('generator')
    expect(insertion.autoSubmit).toBe(false)
    expect(insertion.combinedNames).toEqual(['N'])
  })
})
