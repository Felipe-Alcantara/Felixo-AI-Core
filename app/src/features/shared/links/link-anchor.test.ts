import { describe, expect, it } from 'vitest'

import { canvasNodeIdOf, chooserAnchorFor } from './link-anchor'

const element = {
  getBoundingClientRect: () => ({ left: 40, top: 50, width: 80, height: 16 }),
}

describe('chooserAnchorFor', () => {
  it('clique de mouse ou toque: o ponto do gesto', () => {
    expect(chooserAnchorFor({ type: 'click', detail: 1, clientX: 7, clientY: 9 }, element)).toEqual({ x: 7, y: 9 })
    expect(
      chooserAnchorFor({ type: 'contextmenu', clientX: 7, clientY: 9, nativeEvent: { pointerType: 'touch' } }, element),
    ).toEqual({ x: 7, y: 9 })
  })

  it('Enter no link (clique com detail 0): o retângulo do link', () => {
    expect(chooserAnchorFor({ type: 'click', detail: 0, clientX: 0, clientY: 0 }, element)).toEqual({
      x: 40,
      y: 50,
      width: 80,
      height: 16,
    })
  })

  it('tecla de menu (contextmenu sem tipo de ponteiro): o retângulo do link', () => {
    expect(
      chooserAnchorFor({ type: 'contextmenu', clientX: 0, clientY: 0, nativeEvent: { pointerType: '' } }, element),
    ).toEqual({ x: 40, y: 50, width: 80, height: 16 })
  })

  it('sem medida do elemento, volta ao ponto do evento', () => {
    expect(chooserAnchorFor({ type: 'click', detail: 0, clientX: 3, clientY: 4 }, {})).toEqual({ x: 3, y: 4 })
  })
})

describe('canvasNodeIdOf', () => {
  it('o bloco do canvas que contém o link', () => {
    const inside = {
      closest: (selector: string) =>
        selector === '.react-flow__node' ? { getAttribute: (name: string) => (name === 'data-id' ? 'note-1' : null) } : null,
    }
    expect(canvasNodeIdOf(inside)).toBe('note-1')
  })

  it('fora do canvas (painel, chat), ou sem DOM, não há bloco de origem', () => {
    expect(canvasNodeIdOf({ closest: () => null })).toBeUndefined()
    expect(canvasNodeIdOf({})).toBeUndefined()
    expect(canvasNodeIdOf(null)).toBeUndefined()
  })
})
