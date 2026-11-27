// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TerminalSessionStore } from './terminal-session-store'

/**
 * O xterm desenha com o relógio de animação da janela que ele conhece, e só troca
 * de janela quando `open()` é chamado de novo. Medido em 27/11/2026: sem isso, com
 * a principal minimizada, a saída do terminal destacado atrasava ~0,8 s; e um
 * xterm apontando para uma janela já fechada derrubou o renderer.
 */
function montar() {
  const store = new TerminalSessionStore()
  const element = document.createElement('div')
  const janelas: Array<Window | null> = []
  // Guarda a janela em que o elemento estava a cada `open()`: é a que o xterm passa a usar.
  const open = vi.fn(() => void janelas.push(element.ownerDocument.defaultView))
  const interno = store as unknown as Record<string, unknown>
  for (const metodo of ['bindLinkContextMenu', 'bindFileDrop', 'bindImagePaste', 'bindMouseSelection', 'fit']) {
    interno[metodo] = vi.fn()
  }
  ;(interno.sessions as Map<string, unknown>).set('s', { terminal: { element, open } })
  const casa = document.body.appendChild(document.createElement('div'))
  casa.appendChild(element)

  const quadro = document.body.appendChild(document.createElement('iframe'))
  const outra = quadro.contentDocument!
  const naOutra = outra.body.appendChild(outra.createElement('div'))
  return { store, element, open, janelas, casa, naOutra, outraJanela: quadro.contentWindow }
}

describe('xterm que muda de janela', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('moveTo avisa o xterm da janela nova, na ida e na volta', () => {
    const { store, element, janelas, casa, naOutra, outraJanela } = montar()

    store.moveTo('s', naOutra)
    expect(element.parentElement).toBe(naOutra)
    expect(janelas.at(-1)).toBe(outraJanela)

    store.moveTo('s', casa)
    expect(janelas.at(-1)).toBe(window)
  })

  it('release devolve o xterm ao documento principal antes de a janela fechar', () => {
    const { store, element, janelas, naOutra } = montar()
    store.moveTo('s', naOutra)

    store.release('s')

    expect(element.ownerDocument).toBe(document)
    expect(element.parentElement).toBeNull()
    expect(janelas.at(-1)).toBe(window)
  })

  it('release não arranca o xterm que já está na principal', () => {
    const { store, element, casa } = montar()

    store.release('s')
    store.release('sessao-que-nao-existe')

    expect(element.parentElement).toBe(casa)
  })
})
