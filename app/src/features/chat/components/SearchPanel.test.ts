import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
// `./search-highlight` era uma implementação duplicada, nunca importada por
// nenhum componente em produção (só por este teste) — `SearchPanel.tsx` real
// sempre usou o `highlight` de `SearchControls`. O arquivo duplicado foi
// removido; este teste agora cobre a implementação que roda de verdade.
import { highlight } from '../../search/SearchControls'
import type { ChatSession } from '../types'
import { SearchPanel } from './SearchPanel'

function renderPanel(isOpen: boolean) {
  const at = '2026-09-20T12:00:00.000Z'
  const sessions: ChatSession[] = [
    { id: 'chat-1', title: 'Conversa 1', messages: [], createdAt: at, updatedAt: at },
  ]
  return renderToStaticMarkup(
    createElement(SearchPanel, {
      sessions,
      isOpen,
      onClose: () => {},
      onSelectSession: () => {},
      onDeleteSession: () => {},
    }),
  )
}

describe('SearchPanel', () => {
  it('fechado, sai da ordem de foco e da árvore de acessibilidade', () => {
    // O painel fica montado e só transparente: sem `inert`, o Tab da sidebar
    // passava por cada conversa (e pela lixeira dela) sem nada na tela.
    const markup = renderPanel(false)

    expect(markup).toMatch(/^<div[^>]* aria-hidden="true"/)
    expect(markup).toMatch(/^<div[^>]* inert=""/)
  })

  it('aberto, volta a ser alcançável', () => {
    const markup = renderPanel(true)

    expect(markup).not.toMatch(/^<div[^>]* inert=""/)
    expect(markup).not.toMatch(/^<div[^>]* aria-hidden="true"/)
  })
})

describe('highlight', () => {
  it('escapa markup não confiável e mantém o termo destacado', () => {
    const resultado = renderToStaticMarkup(
      highlight('<img src=x onerror="alert(1)"> Relatório', 'relatório'),
    )

    expect(resultado).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; ')
    expect(resultado).toContain('<mark class="rounded-xs bg-[color-mix(in_srgb,var(--color-warning)_34%,transparent)] text-inherit">Relatório</mark>')
    expect(resultado).not.toContain('<img')
  })

  it('destaca sem diferenciar maiúsculas de minúsculas', () => {
    expect(renderToStaticMarkup(highlight('Mensagem importante', 'MENSAGEM'))).toContain(
      '<mark class="rounded-xs bg-[color-mix(in_srgb,var(--color-warning)_34%,transparent)] text-inherit">Mensagem</mark>',
    )
  })
})
