import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
// `./search-highlight` era uma implementação duplicada, nunca importada por
// nenhum componente em produção (só por este teste) — `SearchPanel.tsx` real
// sempre usou o `highlight` de `SearchControls`. O arquivo duplicado foi
// removido; este teste agora cobre a implementação que roda de verdade.
import { highlight } from '../../search/SearchControls'

describe('highlight', () => {
  it('escapa markup não confiável e mantém o termo destacado', () => {
    const resultado = renderToStaticMarkup(
      highlight('<img src=x onerror="alert(1)"> Relatório', 'relatório'),
    )

    expect(resultado).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; ')
    expect(resultado).toContain('<mark class="rounded-sm bg-[color-mix(in_srgb,var(--color-warning)_34%,transparent)] text-inherit">Relatório</mark>')
    expect(resultado).not.toContain('<img')
  })

  it('destaca sem diferenciar maiúsculas de minúsculas', () => {
    expect(renderToStaticMarkup(highlight('Mensagem importante', 'MENSAGEM'))).toContain(
      '<mark class="rounded-sm bg-[color-mix(in_srgb,var(--color-warning)_34%,transparent)] text-inherit">Mensagem</mark>',
    )
  })
})
