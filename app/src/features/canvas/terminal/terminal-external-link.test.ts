import { describe, expect, it } from 'vitest'
import {
  describeTerminalLinkHover,
  hasTerminalLinkModifier,
  isAllowedTerminalExternalLink,
  isTerminalLinkDragGesture,
  isTerminalLinkGesture,
} from './terminal-external-link'
import { DRAG_THRESHOLD_PX } from './terminal-mouse-selection'

const NEWLINE = String.fromCharCode(10)
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b)
const RIGHT_TO_LEFT_OVERRIDE = String.fromCharCode(0x202e)
const LINE_SEPARATOR = String.fromCharCode(0x2028)

type GestureInit = Partial<Pick<MouseEvent, 'ctrlKey' | 'metaKey' | 'button'>> & {
  pointerType?: string
  sourceCapabilities?: { firesTouchEvents?: boolean } | null
}

function gesture(init: GestureInit = {}) {
  return { ctrlKey: false, metaKey: false, button: 0, ...init }
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

  it('requires exactly Ctrl or Cmd', () => {
    expect(hasTerminalLinkModifier(gesture({ ctrlKey: true }), false)).toBe(true)
    expect(hasTerminalLinkModifier(gesture({ metaKey: true }), false)).toBe(true)
    expect(hasTerminalLinkModifier(gesture(), false)).toBe(false)
    expect(hasTerminalLinkModifier(gesture({ ctrlKey: true, metaKey: true }), false)).toBe(false)
  })

  describe('gesto que pede o menu de destino', () => {
    it('Ctrl/Cmd+clique com o botão principal pede o menu; clique simples de mouse é do terminal', () => {
      expect(isTerminalLinkGesture(gesture({ ctrlKey: true }), false)).toBe(true)
      expect(isTerminalLinkGesture(gesture({ metaKey: true }), false)).toBe(true)
      expect(isTerminalLinkGesture(gesture(), false)).toBe(false)
      expect(isTerminalLinkGesture(gesture({ pointerType: 'mouse' }), false)).toBe(false)
    })

    it('Ctrl+clique direito ou do meio não pede (o direito já abre o menu pelo contextmenu)', () => {
      for (const button of [1, 2]) {
        expect(isTerminalLinkGesture(gesture({ ctrlKey: true, button }), false)).toBe(false)
      }
    })

    it('um toque pede o menu sem modificador: um dedo não tem Ctrl', () => {
      expect(isTerminalLinkGesture(gesture({ sourceCapabilities: { firesTouchEvents: true } }), false)).toBe(true)
      expect(isTerminalLinkGesture(gesture({ pointerType: 'touch' }), false)).toBe(true)
      expect(isTerminalLinkGesture(gesture({ sourceCapabilities: { firesTouchEvents: false } }), false)).toBe(false)
      expect(isTerminalLinkGesture(gesture({ sourceCapabilities: null }), false)).toBe(false)
    })

    it('no macOS, só Cmd+clique: o Ctrl+clique já pediu o menu pelo contextmenu', () => {
      // No macOS, Ctrl+clique é o clique secundário: o Chromium entrega o
      // gesto como `contextmenu` já no mousedown, e o mouseup que chega depois
      // ao xterm ainda traz o botão principal e Ctrl. Contar esse Ctrl pedia
      // o menu duas vezes (o menu piscava e o leitor de tela anunciava de novo).
      expect(isTerminalLinkGesture(gesture({ ctrlKey: true }), true)).toBe(false)
      expect(isTerminalLinkGesture(gesture({ ctrlKey: true, metaKey: true }), true)).toBe(false)
      expect(isTerminalLinkGesture(gesture({ metaKey: true }), true)).toBe(true)
      expect(isTerminalLinkGesture(gesture({ pointerType: 'touch' }), true)).toBe(true)
    })
  })

  describe('dica sobre o link', () => {
    it('mostra o destino de verdade, que o rótulo de um OSC 8 pode esconder, e como escolher', () => {
      const [destination, hint] = describeTerminalLinkHover('HTTPS://Evil.example/login').split(NEWLINE)
      expect(destination).toBe('https://evil.example/login')
      expect(hint).toBe('Ctrl/Cmd+clique ou clique direito: escolher onde abrir')

      const long = `https://example.com/${'a'.repeat(400)}`
      expect(describeTerminalLinkHover(long).split(NEWLINE)[0]).toHaveLength(160)
    })

    it.each([
      [`https://exa${ZERO_WIDTH_SPACE}mple.com/`, 'caracteres invisíveis'],
      [`https://example.com/${RIGHT_TO_LEFT_OVERRIDE}gpj.exe`, 'caracteres invisíveis'],
      [`https://example.com/${LINE_SEPARATOR}a`, 'caracteres de controle'],
      ['data:text/html,<script>alert(1)</script>', 'endereços data: não abrem pelo app, só http e https'],
      ['vscode://file/C:/x', 'endereços vscode: não abrem pelo app, só http e https'],
      ['mailto:user@example.com', 'endereços mailto: não abrem pelo app, só http e https'],
      ['https://usuario:senha@example.com/', 'usuário ou senha'],
    ])('link recusado diz o motivo: %j', (uri, reason) => {
      const [first, second] = describeTerminalLinkHover(uri).split(NEWLINE)
      expect(first.startsWith('Link recusado: ')).toBe(true)
      expect(first).toContain(reason)
      expect(second).toBe('Clique direito: copiar')
    })
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
