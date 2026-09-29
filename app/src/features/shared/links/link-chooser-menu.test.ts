import { describe, expect, it } from 'vitest'

import {
  focusLeavesLinkChooser,
  isKeyboardContextMenu,
  isTouchGesture,
  linkChooserKeyAction,
  placeLinkChooser,
  restoresFocusOnDismiss,
} from './link-chooser-menu'

const VIEWPORT = { width: 1280, height: 800 }
const MENU = { width: 288, height: 160 }

describe('placeLinkChooser', () => {
  it('clique: o menu nasce no ponteiro', () => {
    expect(placeLinkChooser({ x: 100, y: 120 }, MENU, VIEWPORT)).toEqual({ left: 100, top: 120 })
  })

  it('clique perto da borda direita ou de baixo: o menu vira para o lado que cabe', () => {
    expect(placeLinkChooser({ x: 1200, y: 780 }, MENU, VIEWPORT)).toEqual({
      left: 1200 - MENU.width,
      top: 780 - MENU.height,
    })
  })

  it('link escolhido pelo teclado: abaixo do link, alinhado à esquerda dele', () => {
    const anchor = { x: 300, y: 200, width: 120, height: 18 }
    expect(placeLinkChooser(anchor, MENU, VIEWPORT)).toEqual({ left: 300, top: 222 })
  })

  it('sem espaço embaixo do link, o menu sobe para cima dele', () => {
    const anchor = { x: 300, y: 700, width: 120, height: 18 }
    expect(placeLinkChooser(anchor, MENU, VIEWPORT)).toEqual({ left: 300, top: 700 - MENU.height - 4 })
  })

  it('link colado na borda direita: o menu termina onde o link termina', () => {
    const anchor = { x: 1150, y: 200, width: 120, height: 18 }
    expect(placeLinkChooser(anchor, MENU, VIEWPORT).left).toBe(1150 + 120 - MENU.width)
  })

  it('nunca sai da janela, nem numa janela menor que o menu', () => {
    const placed = placeLinkChooser({ x: -50, y: -50 }, MENU, VIEWPORT)
    expect(placed).toEqual({ left: 8, top: 8 })

    const tiny = placeLinkChooser({ x: 100, y: 100 }, MENU, { width: 200, height: 120 })
    expect(tiny).toEqual({ left: 8, top: 8 })
  })
})

describe('linkChooserKeyAction', () => {
  it('setas circulam entre os itens', () => {
    expect(linkChooserKeyAction('ArrowDown', 0, 3)).toEqual({ type: 'move', index: 1 })
    expect(linkChooserKeyAction('ArrowDown', 2, 3)).toEqual({ type: 'move', index: 0 })
    expect(linkChooserKeyAction('ArrowUp', 0, 3)).toEqual({ type: 'move', index: 2 })
  })

  it('Home e End vão às pontas', () => {
    expect(linkChooserKeyAction('Home', 2, 3)).toEqual({ type: 'move', index: 0 })
    expect(linkChooserKeyAction('End', 0, 3)).toEqual({ type: 'move', index: 2 })
  })

  it('Esc e Tab fecham, mesmo sem itens', () => {
    expect(linkChooserKeyAction('Escape', 0, 3)).toEqual({ type: 'close' })
    expect(linkChooserKeyAction('Tab', 1, 3)).toEqual({ type: 'close' })
    expect(linkChooserKeyAction('Escape', 0, 0)).toEqual({ type: 'close' })
  })

  it('Enter, Espaço e letras seguem o caminho normal (o botão vira clique)', () => {
    for (const key of ['Enter', ' ', 'a', 'Backspace']) {
      expect(linkChooserKeyAction(key, 0, 3)).toBeNull()
    }
    expect(linkChooserKeyAction('ArrowDown', 0, 0)).toBeNull()
  })

  it('Enter ou Espaço segurados não escolhem: só uma tecla nova confirma', () => {
    // O Enter que abriu o menu, segurado, repete no primeiro item.
    expect(linkChooserKeyAction('Enter', 0, 3, true)).toEqual({ type: 'ignore' })
    expect(linkChooserKeyAction(' ', 0, 3, true)).toEqual({ type: 'ignore' })
    expect(linkChooserKeyAction('Enter', 0, 3, false)).toBeNull()
    // Segurar uma seta continua andando pelos itens, e Esc segurado fecha.
    expect(linkChooserKeyAction('ArrowDown', 0, 3, true)).toEqual({ type: 'move', index: 1 })
    expect(linkChooserKeyAction('Escape', 0, 3, true)).toEqual({ type: 'close' })
  })
})

describe('restoresFocusOnDismiss', () => {
  it('roda ou redimensionamento com o foco no menu: o foco volta a quem abriu', () => {
    // Sem isto o foco caía no body: o terminal parava de receber teclas.
    expect(restoresFocusOnDismiss('wheel', true)).toBe(true)
    expect(restoresFocusOnDismiss('resize', true)).toBe(true)
  })

  it('sem o foco no menu, fechar não mexe no foco de ninguém', () => {
    expect(restoresFocusOnDismiss('wheel', false)).toBe(false)
    expect(restoresFocusOnDismiss('resize', false)).toBe(false)
  })

  it('clique fora e janela sem foco não movem o foco: ele foi para onde a pessoa quis', () => {
    // Um clique dentro de uma Página Web tira o foco da janela de propósito.
    expect(restoresFocusOnDismiss('pointer-outside', true)).toBe(false)
    expect(restoresFocusOnDismiss('window-blur', true)).toBe(false)
  })

  it('foco que saiu para outro elemento fica lá', () => {
    expect(restoresFocusOnDismiss('focus-left', true)).toBe(false)
  })
})

describe('focusLeavesLinkChooser', () => {
  const menuElement = {} as EventTarget
  const item = {} as EventTarget
  const menu = { contains: (node: unknown) => node === menuElement || node === item }

  it('o foco foi para outro elemento (um diálogo que abriu por cima): fecha', () => {
    expect(focusLeavesLinkChooser(menu, {} as EventTarget)).toBe(true)
  })

  it('andar entre os itens, ou clicar no resumo (o foco vai ao próprio menu), não fecha', () => {
    expect(focusLeavesLinkChooser(menu, item)).toBe(false)
    expect(focusLeavesLinkChooser(menu, menuElement)).toBe(false)
  })

  it('sem elemento novo, a janela perdeu o foco: quem fecha é o blur da janela', () => {
    expect(focusLeavesLinkChooser(menu, null)).toBe(false)
  })
})

describe('origem do gesto', () => {
  it('tecla de menu (ou Shift+F10) chega sem tipo de ponteiro', () => {
    expect(isKeyboardContextMenu({ pointerType: '' })).toBe(true)
    expect(isKeyboardContextMenu({ pointerType: 'mouse' })).toBe(false)
    expect(isKeyboardContextMenu({ pointerType: 'touch' })).toBe(false)
    // Evento sem o campo (ambiente antigo): trata como ponteiro, com posição.
    expect(isKeyboardContextMenu({})).toBe(false)
  })

  it('toque: pelo tipo de ponteiro ou pelo evento de mouse sintetizado do toque', () => {
    expect(isTouchGesture({ pointerType: 'touch' })).toBe(true)
    expect(isTouchGesture({ sourceCapabilities: { firesTouchEvents: true } })).toBe(true)
    expect(isTouchGesture({ pointerType: 'mouse', sourceCapabilities: { firesTouchEvents: false } })).toBe(false)
    expect(isTouchGesture({})).toBe(false)
  })
})
