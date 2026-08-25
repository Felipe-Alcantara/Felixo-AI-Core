import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { highlight } from './search-highlight'

describe('highlight', () => {
  it('escapa markup não confiável e mantém o termo destacado', () => {
    const resultado = renderToStaticMarkup(
      highlight('<img src=x onerror="alert(1)"> Relatório', 'relatório'),
    )

    expect(resultado).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; ')
    expect(resultado).toContain('<mark class="bg-amber-400/30 text-inherit rounded-sm">Relatório</mark>')
    expect(resultado).not.toContain('<img')
  })

  it('destaca sem diferenciar maiúsculas de minúsculas', () => {
    expect(renderToStaticMarkup(highlight('Mensagem importante', 'MENSAGEM'))).toContain(
      '<mark class="bg-amber-400/30 text-inherit rounded-sm">Mensagem</mark>',
    )
  })
})
