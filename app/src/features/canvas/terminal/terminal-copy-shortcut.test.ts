import { describe, expect, it } from 'vitest'
import { decideCopyShortcut } from './terminal-copy-shortcut'

function keyEvent(init: Partial<KeyboardEvent> & { key: string }) {
  return { type: 'keydown', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...init } as KeyboardEvent
}

describe('decideCopyShortcut', () => {
  it('copia quando há seleção e a pessoa aperta Ctrl+C', () => {
    expect(decideCopyShortcut(keyEvent({ key: 'c', ctrlKey: true }), true)).toBe('copy')
  })

  it('deixa o Ctrl+C interromper o agente quando não há seleção', () => {
    expect(decideCopyShortcut(keyEvent({ key: 'c', ctrlKey: true }), false)).toBe('passthrough')
  })

  it('aceita Ctrl+Shift+C, a convenção de terminal', () => {
    expect(decideCopyShortcut(keyEvent({ key: 'C', ctrlKey: true, shiftKey: true }), true)).toBe('copy')
  })

  it('aceita Cmd+C no macOS', () => {
    expect(decideCopyShortcut(keyEvent({ key: 'c', metaKey: true }), true)).toBe('copy')
  })

  it('ignora a tecla sem modificador', () => {
    expect(decideCopyShortcut(keyEvent({ key: 'c' }), true)).toBeNull()
  })

  it('ignora outras teclas com Ctrl', () => {
    expect(decideCopyShortcut(keyEvent({ key: 'v', ctrlKey: true }), true)).toBeNull()
  })

  it('ignora Ctrl+Alt+C, que é outro atalho', () => {
    expect(decideCopyShortcut(keyEvent({ key: 'c', ctrlKey: true, altKey: true }), true)).toBeNull()
  })

  it('ignora keyup, para não copiar duas vezes por um aperto só', () => {
    expect(decideCopyShortcut(keyEvent({ key: 'c', ctrlKey: true, type: 'keyup' }), true)).toBeNull()
  })
})
