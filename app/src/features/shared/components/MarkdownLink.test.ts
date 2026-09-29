import { Fragment, isValidElement, type ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MarkdownLink } from './MarkdownLink'
import { closeLinkChooser, getLinkChooserState } from '../links/link-chooser-store'
import { describeLinkDestination, linkChoiceEntries } from '../links/link-destination'

type RenderedLinkProps = {
  href?: string
  target?: string
  title?: string
  type?: string
  'aria-label'?: string
  'data-refused-link'?: string
  children?: unknown
  onClick?: (event?: unknown) => void
  onAuxClick?: (event: unknown) => void
  onContextMenu?: (event: unknown) => void
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

// O link recusado é um par, lado a lado: o rótulo (com a dica) e o botão de
// ícone que pede o menu.
function renderRefusedLink(props: Parameters<typeof MarkdownLink>[0]) {
  const pair = renderLink(props)
  expect(pair.type).toBe(Fragment)
  const [label, button] = pair.props.children as ReactElement<RenderedLinkProps>[]
  return { label, button }
}

/**
 * Elemento de mentira com o que o `MarkdownLink` usa do DOM: `closest` (só
 * tag ou `[role="button"]`, os seletores da lista de controles) e `contains`.
 */
type FakeElement = {
  tag: string
  role?: string
  parent?: FakeElement
  closest: (selectors: string) => FakeElement | null
  contains: (other: unknown) => boolean
}

function fakeElement(tag: string, parent?: FakeElement, role?: string): FakeElement {
  const element: FakeElement = {
    tag,
    role,
    parent,
    closest(selectors) {
      const matches = (node: FakeElement) =>
        selectors.split(',').some((raw) => {
          const selector = raw.trim()
          return selector === node.tag || (selector === '[role="button"]' && node.role === 'button')
        })
      for (let node: FakeElement | undefined = element; node; node = node.parent) {
        if (matches(node)) return node
      }
      return null
    },
    contains(other) {
      for (let node = other as FakeElement | undefined; node; node = node.parent) {
        if (node === element) return true
      }
      return false
    },
  }
  return element
}

function gestureOn(target: FakeElement, currentTarget: FakeElement, type = 'click') {
  return {
    detail: 1,
    clientX: 11,
    clientY: 22,
    type,
    target,
    currentTarget,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  }
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
      const link = renderLink({ href: 'https://example.com/', children: 'x' })
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

    // Um `<a>` de HTML cru em volta de um bloco de código põe o "copiar" do
    // bloco dentro do link: o clique nele sobe até o `<a>`.
    it.each([
      ['o "copiar" de um bloco de código', 'button', undefined],
      ['a caixa de tarefa', 'input', undefined],
      ['um campo de texto', 'textarea', undefined],
      ['uma lista de opções', 'select', undefined],
      ['o título de um details', 'summary', undefined],
      ['um elemento com papel de botão', 'span', 'button'],
    ])('%s dentro do link fica com o gesto: sem menu, e o link não navega', (_label, tag, role) => {
      const link = renderLink({ href: 'https://example.com/', children: 'x' })
      const anchor = fakeElement('a')
      const control = fakeElement(tag, fakeElement('div', anchor), role)
      // O alvo é o texto dentro do controle ("copiar"), não o controle.
      const target = fakeElement('span', control)

      for (const type of ['click', 'contextmenu']) {
        const event = gestureOn(target, anchor, type)
        if (type === 'click') link.props.onClick?.(event)
        else link.props.onContextMenu?.(event)

        expect(event.preventDefault).toHaveBeenCalled()
        // O clique segue para o bloco, como um "copiar" fora de link.
        expect(event.stopPropagation).not.toHaveBeenCalled()
        expect(getLinkChooserState().request).toBeNull()
      }
    })

    it('link dentro de um controle (o título de um details) ainda pede o menu', () => {
      const link = renderLink({ href: 'https://example.com/', children: 'x' })
      const anchor = fakeElement('a', fakeElement('summary'))
      const event = gestureOn(fakeElement('span', anchor), anchor)

      link.props.onClick?.(event)
      expect(getLinkChooserState().request?.url).toBe('https://example.com/')
    })
  })

  describe('destino recusado', () => {
    afterEach(() => {
      closeLinkChooser()
      vi.unstubAllGlobals()
    })

    it('vira rótulo com o motivo e o destino na dica, e um botão ao lado pede o menu, que só copia', () => {
      const open = vi.fn()
      vi.stubGlobal('open', open)

      const { label, button } = renderRefusedLink({ href: '', writtenHref: ' javascript:alert(1) ', children: 'x' })

      // O rótulo é só texto: não navega, não pede nada, e embrulha o que o
      // link embrulhava (até um bloco de código com o botão "copiar").
      expect(label.type).toBe('span')
      expect(label.props.href).toBeUndefined()
      expect(label.props.onClick).toBeUndefined()
      expect(label.props.children).toBe('x')
      expect(label.props['data-refused-link']).toBe('true')
      expect(label.props.title).toBe(
        'Link recusado: endereços javascript: não abrem pelo app, só http, https e mailto\njavascript:alert(1)',
      )

      // O botão não embrulha o rótulo: só o ícone.
      expect(button.type).toBe('button')
      expect(button.props.type).toBe('button')
      expect(button.props.href).toBeUndefined()
      expect(button.props['aria-label']).toBe('Por que este link não abre')
      expect(button.props.title).toBe('Por que este link não abre')
      expect(isValidElement(button.props.children)).toBe(true)

      button.props.onClick?.({
        detail: 1,
        clientX: 5,
        clientY: 6,
        currentTarget: {},
        preventDefault: () => {},
        stopPropagation: () => {},
      })
      const request = getLinkChooserState().request
      expect(request).toMatchObject({ url: 'javascript:alert(1)', origin: 'markdown' })
      expect(
        linkChoiceEntries(describeLinkDestination(request?.url ?? '', 'markdown'), { canOpenWebpage: true }).map(
          (entry) => entry.choice,
        ),
      ).toEqual(['copiar-link'])
      expect(open).not.toHaveBeenCalled()
    })

    it('clique no ícone do botão pede o menu: o ícone é parte do botão, não um controle dentro dele', () => {
      const { button } = renderRefusedLink({ writtenHref: 'file:///C:/x', children: 'x' })
      const buttonElement = fakeElement('button')

      button.props.onClick?.(gestureOn(fakeElement('svg', buttonElement), buttonElement))
      expect(getLinkChooserState().request?.url).toBe('file:///C:/x')
    })

    it('clique direito no botão pede o mesmo menu, sem o menu do bloco', () => {
      const { button } = renderRefusedLink({ writtenHref: 'file:///C:/x', children: 'x' })
      const buttonElement = fakeElement('button')
      const event = gestureOn(buttonElement, buttonElement, 'contextmenu')

      button.props.onContextMenu?.(event)
      expect(event.preventDefault).toHaveBeenCalled()
      expect(event.stopPropagation).toHaveBeenCalled()
      expect(getLinkChooserState().request?.url).toBe('file:///C:/x')
    })

    it('dica longa é cortada; o menu leva o endereço inteiro', () => {
      const destination = `data:text/html,${'a'.repeat(1000)}`
      const { label, button } = renderRefusedLink({ writtenHref: destination, children: 'x' })

      expect(label.props.title?.length).toBeLessThan(400)
      expect(label.props.title?.endsWith('…')).toBe(true)
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
