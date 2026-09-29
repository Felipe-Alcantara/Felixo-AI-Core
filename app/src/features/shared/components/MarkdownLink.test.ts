import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MarkdownLink } from './MarkdownLink'
import { closeLinkChooser, getLinkChooserState } from '../links/link-chooser-store'

type RenderedLinkProps = {
  href?: string
  target?: string
  title?: string
  type?: string
  onClick?: (event?: unknown) => void
  onAuxClick?: (event: unknown) => void
}

// Sem hooks: o componente (e o `<a>` que ele delega) pode ser chamado como
// função, e o clique é o `onClick` do elemento devolvido (o ambiente de teste
// não tem DOM).
function renderLink(props: Parameters<typeof MarkdownLink>[0]) {
  let element = MarkdownLink(props) as ReactElement<RenderedLinkProps>
  while (typeof element.type === 'function') {
    element = (element.type as (props: object) => ReactElement<RenderedLinkProps>)(element.props)
  }
  return element
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

  describe('link que sai do app pede o menu de destino', () => {
    afterEach(() => {
      closeLinkChooser()
      vi.unstubAllGlobals()
    })

    function clickEvent(init: { detail?: number; clientX?: number; clientY?: number; type?: string } = {}) {
      const currentTarget = {
        closest: (selector: string) =>
          selector === '.react-flow__node' ? { getAttribute: () => 'note-7' } : null,
        getBoundingClientRect: () => ({ left: 40, top: 50, width: 80, height: 16 }),
        isConnected: true,
        focus: () => {},
      }
      return {
        detail: 1,
        clientX: 11,
        clientY: 22,
        type: 'click',
        ...init,
        currentTarget,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      }
    }

    it.each(['https://example.com/docs', 'mailto:time@example.com'])(
      'clique em %s não navega: pede o menu no ponto do clique, com o bloco de origem',
      (href) => {
        const open = vi.fn()
        vi.stubGlobal('open', open)
        const link = renderLink({ href, children: 'x', resolveRelativeLink: () => null })

        expect(link.type).toBe('a')
        expect(link.props.href).toBe(href)
        // Sem janela nova: o navegador nunca segue este href sozinho.
        expect(link.props.target).toBeUndefined()
        expect(link.props.title).toBe(`${href}\nClique para escolher onde abrir`)

        const event = clickEvent()
        link.props.onClick?.(event)
        expect(event.preventDefault).toHaveBeenCalled()
        expect(getLinkChooserState().request).toMatchObject({
          url: href,
          origin: 'markdown',
          anchor: { x: 11, y: 22 },
          sourceNodeId: 'note-7',
        })
        expect(open).not.toHaveBeenCalled()
      },
    )

    it('Enter no link (clique sem ponteiro) abre o menu embaixo do link', () => {
      const link = renderLink({ href: 'https://example.com/', children: 'x' })
      link.props.onClick?.(clickEvent({ detail: 0, clientX: 0, clientY: 0 }))
      expect(getLinkChooserState().request?.anchor).toEqual({ x: 40, y: 50, width: 80, height: 16 })
    })

    it('clique direito pede o mesmo menu e não deixa o menu do bloco abrir junto', () => {
      const link = renderLink({ href: 'https://example.com/', children: 'x' }) as ReactElement<
        RenderedLinkProps & { onContextMenu?: (event: unknown) => void }
      >
      const event = clickEvent({ type: 'contextmenu' })
      link.props.onContextMenu?.(event)
      expect(event.preventDefault).toHaveBeenCalled()
      expect(event.stopPropagation).toHaveBeenCalled()
      expect(getLinkChooserState().request?.url).toBe('https://example.com/')
    })

    it('clique do meio não abre nada', () => {
      const link = renderLink({ href: 'https://example.com/', children: 'x' })
      const preventDefault = vi.fn()
      link.props.onAuxClick?.({ preventDefault })
      expect(preventDefault).toHaveBeenCalled()
      expect(getLinkChooserState().request).toBeNull()
    })
  })

  describe('destino recusado', () => {
    afterEach(() => {
      closeLinkChooser()
      vi.unstubAllGlobals()
    })

    it('vira botão com o motivo e o destino na dica; o clique pede o menu, que só copia', () => {
      const open = vi.fn()
      vi.stubGlobal('open', open)

      const button = renderLink({ href: '', writtenHref: ' javascript:alert(1) ', children: 'x' }) as ReactElement<
        RenderedLinkProps & { 'data-refused-link'?: string }
      >

      expect(button.type).toBe('button')
      expect(button.props.type).toBe('button')
      expect(button.props.href).toBeUndefined()
      expect(button.props['data-refused-link']).toBe('true')
      expect(button.props.title).toBe(
        'Link recusado: endereços javascript: não abrem pelo app, só http, https e mailto\njavascript:alert(1)',
      )

      button.props.onClick?.({
        detail: 1,
        clientX: 5,
        clientY: 6,
        currentTarget: {},
        preventDefault: () => {},
        stopPropagation: () => {},
      })
      expect(getLinkChooserState().request).toMatchObject({ url: 'javascript:alert(1)', origin: 'markdown' })
      expect(open).not.toHaveBeenCalled()
    })

    it('dica longa é cortada; o menu leva o endereço inteiro', () => {
      const destination = `data:text/html,${'a'.repeat(1000)}`
      const button = renderLink({ writtenHref: destination, children: 'x' })

      expect(button.props.title?.length).toBeLessThan(400)
      expect(button.props.title?.endsWith('…')).toBe(true)
      button.props.onClick?.({
        detail: 1,
        clientX: 0,
        clientY: 0,
        currentTarget: {},
        preventDefault: () => {},
        stopPropagation: () => {},
      })
      expect(getLinkChooserState().request?.url).toBe(destination)
    })

    it('âncora, relativo sem destino e endereço com invisível não ganham botão', () => {
      const zeroWidthSpace = String.fromCharCode(0x200b)

      for (const writtenHref of ['#secao', 'OUTRO.md', `https://exa${zeroWidthSpace}mple.com/`, '  ']) {
        const link = renderLink({ href: '', writtenHref, children: 'x' })
        expect(link.type).toBe('span')
        expect(link.props.title).toBeUndefined()
      }
    })

    it('destino que a política aprova, apagado só pelo sanitize (esquema em maiúsculas), volta a ser link', () => {
      const link = renderLink({ href: '', writtenHref: 'HTTPS://Example.com', children: 'x' })

      expect(link.type).toBe('a')
      // A forma serializada da política, nunca o texto escrito.
      expect(link.props.href).toBe('https://example.com/')
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
})
