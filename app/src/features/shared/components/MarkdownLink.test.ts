import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { MarkdownLink } from './MarkdownLink'

type RenderedLinkProps = {
  href?: string
  target?: string
  title?: string
  type?: string
  onClick?: (event?: unknown) => void
  onAuxClick?: (event: unknown) => void
}

// Sem hooks: o componente pode ser chamado como função, e o clique é o
// `onClick` do elemento devolvido (o ambiente de teste não tem DOM).
function renderLink(props: Parameters<typeof MarkdownLink>[0]) {
  return MarkdownLink(props) as ReactElement<RenderedLinkProps>
}

describe('MarkdownLink', () => {
  it('clicar num link relativo resolvido abre o destino, sem sair da tela', () => {
    const open = vi.fn()
    const resolveRelativeLink = vi.fn(() => ({ description: 'Abrir OUTRO.md', open }))

    const link = renderLink({ href: 'OUTRO.md', children: 'x', resolveRelativeLink })

    expect(resolveRelativeLink).toHaveBeenCalledWith('OUTRO.md')
    expect(link.type).toBe('button')
    expect(link.props.type).toBe('button')
    expect(link.props.title).toBe('Abrir OUTRO.md')
    expect(link.props.href).toBeUndefined()
    link.props.onClick?.()
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('link relativo sem destino, ou saneado para vazio, é só texto', () => {
    for (const props of [
      { href: 'SUMIU.md', resolveRelativeLink: () => null },
      { href: 'OUTRO.md' },
      { href: '' },
      {},
    ]) {
      const link = renderLink({ ...props, children: 'x' })
      expect(link.type).toBe('span')
      expect(link.props.href).toBeUndefined()
    }
  })

  it('âncora não troca o endereço da janela nem abre janela nova', () => {
    const link = renderLink({ href: '#secao', children: 'x' })
    const preventDefault = vi.fn()

    expect(link.type).toBe('a')
    expect(link.props.target).toBeUndefined()
    // Sem conteúdo Markdown em volta, não há para onde rolar; o clique ainda
    // assim não pode seguir o fragmento.
    link.props.onClick?.({ preventDefault, currentTarget: { closest: () => null } })
    link.props.onAuxClick?.({ preventDefault })
    expect(preventDefault).toHaveBeenCalledTimes(2)
  })

  it('só http(s) e mailto saem do app, em janela nova', () => {
    for (const href of ['https://example.com/docs', 'mailto:time@example.com']) {
      const link = renderLink({ href, children: 'x', resolveRelativeLink: () => null })
      expect(link.type).toBe('a')
      expect(link.props.href).toBe(href)
      expect(link.props.target).toBe('_blank')
    }
  })
})
