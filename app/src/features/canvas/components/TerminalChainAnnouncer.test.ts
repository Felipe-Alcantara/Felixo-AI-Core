import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TerminalChainAnnouncer } from './TerminalChainAnnouncer'

describe('região viva das faixas da cadeia', () => {
  // A faixa nascia já preenchida dentro do próprio role="status", e o leitor de tela não
  // anuncia uma região viva que entra no DOM com o texto pronto.
  it('existe vazia antes de qualquer faixa, e cada faixa entra nela como um parágrafo novo', () => {
    const vazia = renderToStaticMarkup(createElement(TerminalChainAnnouncer, { banners: [] }))
    expect(vazia).toBe('<div role="status" aria-live="polite" class="sr-only"></div>')

    const comFaixas = renderToStaticMarkup(
      createElement(TerminalChainAnnouncer, {
        banners: [
          { key: 'deteccao:1', text: 'Limite da conta Pessoal às 14:33 · bloco fixo: nada troca sozinho' },
          { key: 'sucessor:2', text: 'Parado por limite · continuado em Codex 2 às 14:40' },
        ],
      }),
    )
    expect(comFaixas).toBe(
      '<div role="status" aria-live="polite" class="sr-only">' +
        '<p>Limite da conta Pessoal às 14:33 · bloco fixo: nada troca sozinho</p>' +
        '<p>Parado por limite · continuado em Codex 2 às 14:40</p>' +
        '</div>',
    )
  })
})
