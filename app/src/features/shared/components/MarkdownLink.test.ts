import { Fragment, type ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

  describe('destino recusado', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('vira o rótulo com o destino na dica e um botão que só copia', () => {
      const writeText = vi.fn(() => Promise.resolve())
      const open = vi.fn()
      vi.stubGlobal('navigator', { clipboard: { writeText } })
      vi.stubGlobal('open', open)

      const rendered = MarkdownLink({
        href: '',
        writtenHref: ' javascript:alert(1) ',
        children: 'x',
      }) as ReactElement<{ children: ReactElement<RenderedLinkProps & { 'aria-label'?: string }>[] }>
      const [label, button] = rendered.props.children

      expect(rendered.type).toBe(Fragment)
      expect(label.type).toBe('span')
      expect(label.props.title).toBe('Link recusado por segurança: javascript:alert(1)')
      expect(label.props.href).toBeUndefined()
      expect(button.type).toBe('button')
      expect(button.props.type).toBe('button')
      expect(button.props['aria-label']).toBe('Copiar endereço recusado')
      expect(button.props.href).toBeUndefined()

      button.props.onClick?.()
      expect(writeText).toHaveBeenCalledWith('javascript:alert(1)')
      expect(open).not.toHaveBeenCalled()
    })

    it('sem área de transferência, copiar não quebra nem abre nada', () => {
      const open = vi.fn()
      vi.stubGlobal('navigator', {})
      vi.stubGlobal('open', open)

      const rendered = MarkdownLink({
        writtenHref: 'https://usuario@git.example.com/r.git',
        children: 'x',
      }) as ReactElement<{ children: ReactElement<RenderedLinkProps>[] }>

      expect(() => rendered.props.children[1].props.onClick?.()).not.toThrow()
      expect(open).not.toHaveBeenCalled()
    })

    it('dica longa é cortada; a cópia leva o endereço inteiro', () => {
      const writeText = vi.fn(() => Promise.resolve())
      vi.stubGlobal('navigator', { clipboard: { writeText } })
      const destination = `data:text/html,${'a'.repeat(1000)}`

      const rendered = MarkdownLink({ writtenHref: destination, children: 'x' }) as ReactElement<{
        children: ReactElement<RenderedLinkProps>[]
      }>
      const [label, button] = rendered.props.children

      expect(label.props.title?.length).toBeLessThan(300)
      expect(label.props.title?.endsWith('…')).toBe(true)
      button.props.onClick?.()
      expect(writeText).toHaveBeenCalledWith(destination)
    })

    it('âncora, relativo sem destino e endereço com invisível não ganham botão', () => {
      const zeroWidthSpace = String.fromCharCode(0x200b)

      for (const writtenHref of ['#secao', 'OUTRO.md', `https://exa${zeroWidthSpace}mple.com/`, '  ']) {
        const link = renderLink({ href: '', writtenHref, children: 'x' })
        expect(link.type).toBe('span')
        expect(link.props.title).toBeUndefined()
      }
    })

    it('com href aprovado, o destino escrito não muda nada', () => {
      const link = renderLink({
        href: 'https://example.com/',
        writtenHref: 'https://Example.com',
        children: 'x',
      })

      expect(link.type).toBe('a')
      expect(link.props.href).toBe('https://example.com/')
    })
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
