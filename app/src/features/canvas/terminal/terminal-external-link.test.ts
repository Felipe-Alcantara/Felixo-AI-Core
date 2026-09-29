import { describe, expect, it, vi } from 'vitest'
import {
  activateTerminalExternalLink,
  describeTerminalLinkHover,
  hasTerminalLinkModifier,
  isAllowedTerminalExternalLink,
  isTerminalLinkDragGesture,
  terminalLinkClipboardText,
  terminalLinkMenuItems,
} from './terminal-external-link'
import { DRAG_THRESHOLD_PX } from './terminal-mouse-selection'

const NEWLINE = String.fromCharCode(10)
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b)
const RIGHT_TO_LEFT_OVERRIDE = String.fromCharCode(0x202e)
const LINE_SEPARATOR = String.fromCharCode(0x2028)

function mouseEvent(init: Partial<MouseEvent> = {}) {
  return { ctrlKey: false, metaKey: false, ...init } as MouseEvent
}

describe('terminal external links', () => {
  it.each(['https://example.com', 'http://localhost:5173/callback'])('allows %s', (uri) => {
    expect(isAllowedTerminalExternalLink(uri)).toBe(true)
  })

  it.each(['file:///C:/secret.txt', 'javascript:alert(1)', 'mailto:user@example.com', 'not a URL'])(
    'rejects %s',
    (uri) => {
      expect(isAllowedTerminalExternalLink(uri)).toBe(false)
    },
  )

  it.each(['\u001b[31mhttps://example.com\u001b[0m', 'https://example.com\njavascript:alert(1)', 'https://'])(
    'rejects controls or incomplete URL %s',
    (uri) => {
      expect(isAllowedTerminalExternalLink(uri)).toBe(false)
    },
  )

  it('requires exactly Ctrl or Cmd before opening', () => {
    expect(hasTerminalLinkModifier(mouseEvent({ ctrlKey: true }))).toBe(true)
    expect(hasTerminalLinkModifier(mouseEvent({ metaKey: true }))).toBe(true)
    expect(hasTerminalLinkModifier(mouseEvent())).toBe(false)
    expect(hasTerminalLinkModifier(mouseEvent({ ctrlKey: true, metaKey: true }))).toBe(false)
  })

  it('opens only an allowed URL confirmed by the modifier', () => {
    const openExternalLink = vi.fn()

    expect(
      activateTerminalExternalLink(mouseEvent({ ctrlKey: true }), 'https://example.com', openExternalLink),
    ).toBe(true)
    // A forma serializada pela política, que é a que o processo principal revalida.
    expect(openExternalLink).toHaveBeenCalledWith('https://example.com/')

    expect(
      activateTerminalExternalLink(mouseEvent(), 'https://example.com', openExternalLink),
    ).toBe(false)
    expect(
      activateTerminalExternalLink(mouseEvent({ ctrlKey: true }), 'file:///C:/secret.txt', openExternalLink),
    ).toBe(false)
    expect(openExternalLink).toHaveBeenCalledTimes(1)
  })

  it.each([
    `https://exa${ZERO_WIDTH_SPACE}mple.com/`,
    `https://example.com/${RIGHT_TO_LEFT_OVERRIDE}gpj.exe`,
    `https://example.com/${LINE_SEPARATOR}a`,
    'data:text/html,<script>alert(1)</script>',
    'vscode://file/C:/x',
  ])('rejects what the shared policy rejects: %j', (uri) => {
    expect(isAllowedTerminalExternalLink(uri)).toBe(false)
    expect(describeTerminalLinkHover(uri)).toBeUndefined()
  })

  it('opens only on the primary button: Ctrl+right-click shows the menu, Ctrl+middle-click does nothing', () => {
    const openExternalLink = vi.fn()

    for (const button of [1, 2]) {
      expect(
        activateTerminalExternalLink(mouseEvent({ ctrlKey: true, button }), 'https://example.com/', openExternalLink),
      ).toBe(false)
    }
    expect(
      activateTerminalExternalLink(mouseEvent({ ctrlKey: true, button: 0 }), 'https://example.com/', openExternalLink),
    ).toBe(true)
    expect(openExternalLink).toHaveBeenCalledTimes(1)
  })

  it('shows the real destination on hover, which an OSC 8 label can hide', () => {
    // OSC 8: a tela diz uma coisa, o destino é outro. A dica mostra o destino.
    const [destination, hint] = describeTerminalLinkHover('HTTPS://Evil.example/login')!.split(NEWLINE)
    expect(destination).toBe('https://evil.example/login')
    expect(hint).toBe('Ctrl/Cmd+clique: abrir no navegador · clique direito: mais opções')

    const long = `https://example.com/${'a'.repeat(400)}`
    expect(describeTerminalLinkHover(long)!.split(NEWLINE)[0]).toHaveLength(160)
  })

  it('copies the serialized URL, or the raw text when the link is refused — copying never opens', () => {
    const openExternalLink = vi.fn()
    const refused = `https://exa${ZERO_WIDTH_SPACE}mple.com/`

    expect(terminalLinkClipboardText(' HTTPS://Example.com/a ')).toBe('https://example.com/a')
    expect(terminalLinkClipboardText(` ${refused} `)).toBe(refused)
    expect(openExternalLink).not.toHaveBeenCalled()
  })

  describe('menu do clique direito', () => {
    it('link aprovado: abrir no canvas, abrir no navegador e copiar, nessa ordem', () => {
      expect(terminalLinkMenuItems('https://example.com/docs')).toEqual([
        'abrir-no-canvas',
        'abrir-no-navegador',
        'copiar-link',
      ])
    })

    it.each(['javascript:alert(1)', 'mailto:user@example.com', 'data:text/html,<b>x</b>'])(
      'link recusado pelo esquema (%s) fica só com copiar',
      (uri) => {
        expect(terminalLinkMenuItems(uri)).toEqual(['copiar-link'])
      },
    )

    it('link recusado por caractere invisível fica só com copiar', () => {
      expect(terminalLinkMenuItems(`https://exa${ZERO_WIDTH_SPACE}mple.com/`)).toEqual(['copiar-link'])
      expect(terminalLinkMenuItems(`https://example.com/${RIGHT_TO_LEFT_OVERRIDE}gpj.exe`)).toEqual([
        'copiar-link',
      ])
    })

    it.each(['file:///C:/Users/pessoa/relatorio.txt', 'vscode://file/C:/projeto/main.ts'])(
      'destino de hyperlink OSC 8 fora da web (%s) aparece, mas só para copiar',
      (uri) => {
        // O xterm só entrega esse link ao app com `allowNonHttpProtocols: true`;
        // chegando aqui, ele ganha menu, mas nenhuma ação que abra.
        expect(terminalLinkMenuItems(uri)).toEqual(['copiar-link'])
        expect(terminalLinkClipboardText(uri)).toBe(uri)
      },
    )
  })

  describe('arrasto x clique sobre o link', () => {
    const origin = { clientX: 100, clientY: 40 }

    it('soltar no mesmo ponto, ou a menos do limiar, é clique', () => {
      expect(isTerminalLinkDragGesture(origin, { clientX: 100, clientY: 40 })).toBe(false)
      expect(
        isTerminalLinkDragGesture(origin, { clientX: 100 + DRAG_THRESHOLD_PX - 1, clientY: 40 - 1 }),
      ).toBe(false)
    })

    it('andar o limiar em qualquer eixo é arrasto', () => {
      expect(isTerminalLinkDragGesture(origin, { clientX: 100 + DRAG_THRESHOLD_PX, clientY: 40 })).toBe(true)
      expect(isTerminalLinkDragGesture(origin, { clientX: 100, clientY: 40 - DRAG_THRESHOLD_PX })).toBe(true)
      expect(isTerminalLinkDragGesture(origin, { clientX: 260, clientY: 40 })).toBe(true)
    })

    it('sem origem conhecida conta como clique: os outros portões continuam valendo', () => {
      expect(isTerminalLinkDragGesture(undefined, { clientX: 260, clientY: 90 })).toBe(false)
    })
  })
})
