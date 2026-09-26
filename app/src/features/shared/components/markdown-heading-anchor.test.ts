import { describe, expect, it } from 'vitest'

import { markdownFragmentSlug, markdownHeadingSlug } from './markdown-heading-anchor'

describe('markdownHeadingSlug', () => {
  it('segue o slug de título do GitHub, que os índices dos guias usam', () => {
    // Pares tirados dos índices dos guias do Felixo System Design.
    expect(markdownHeadingSlug('🚀 Como Contribuir')).toBe('-como-contribuir')
    expect(markdownHeadingSlug('Quick Start — Como Usar')).toBe('quick-start--como-usar')
    expect(markdownHeadingSlug('3. Commits — pequenos, frequentes e descritivos')).toBe(
      '3-commits--pequenos-frequentes-e-descritivos',
    )
    expect(markdownHeadingSlug('✍️ Padrões de Linguagem (Documentação e Logs)')).toBe(
      '-padrões-de-linguagem-documentação-e-logs',
    )
  })

  it('mantém sublinhado e hífen e ignora espaço nas pontas', () => {
    expect(markdownHeadingSlug('  nome_do-arquivo.md  ')).toBe('nome_do-arquivomd')
  })
})

describe('markdownFragmentSlug', () => {
  it('decodifica o fragmento e ignora caixa e seletor de variação de emoji', () => {
    expect(markdownFragmentSlug('#-como-contribuir')).toBe('-como-contribuir')
    expect(markdownFragmentSlug('#Como-Contribuir')).toBe('como-contribuir')
    expect(markdownFragmentSlug('#%EF%B8%8F-minha-stack')).toBe('-minha-stack')
    expect(markdownFragmentSlug('#-padr%C3%B5es-de-qualidade')).toBe('-padrões-de-qualidade')
  })

  it('fragmento malformado é comparado como veio, sem quebrar', () => {
    expect(markdownFragmentSlug('#100%')).toBe('100%')
  })

  it('não é âncora: sem # ou com # vazio', () => {
    expect(markdownFragmentSlug('OUTRO.md#secao')).toBeNull()
    expect(markdownFragmentSlug('#')).toBeNull()
  })
})
