import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  closeLinkChooser,
  getLinkChooserState,
  getWebpageOpener,
  openLinkChooser,
  registerWebpageOpener,
  subscribeLinkChooser,
  type LinkChooserRequest,
} from './link-chooser-store'

function request(url: string): LinkChooserRequest {
  return { url, origin: 'terminal', anchor: { x: 10, y: 20 } }
}

afterEach(() => {
  closeLinkChooser()
})

describe('link-chooser-store', () => {
  it('um menu por vez: abrir outro troca o pedido e avisa quem desenha', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeLinkChooser(listener)

    openLinkChooser(request('https://a.example/'))
    const first = getLinkChooserState()
    openLinkChooser(request('https://b.example/'))
    const second = getLinkChooserState()

    expect(second.request?.url).toBe('https://b.example/')
    expect(second.version).toBeGreaterThan(first.version)
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('o mesmo link pedido de novo também é pedido novo (o menu reabre no lugar novo)', () => {
    openLinkChooser(request('https://a.example/'))
    const first = getLinkChooserState().version
    openLinkChooser(request('https://a.example/'))
    expect(getLinkChooserState().version).toBe(first + 1)
  })

  it('fechar limpa o pedido; fechar de novo não avisa ninguém', () => {
    const listener = vi.fn()
    openLinkChooser(request('https://a.example/'))
    const unsubscribe = subscribeLinkChooser(listener)

    closeLinkChooser()
    closeLinkChooser()

    expect(getLinkChooserState().request).toBeNull()
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('o abridor de Página Web só sai do registro pelo mesmo canvas que o pôs', () => {
    const first = vi.fn(() => 'webpage-1')
    const second = vi.fn(() => 'webpage-2')

    const unregisterFirst = registerWebpageOpener(first)
    const unregisterSecond = registerWebpageOpener(second)
    // O canvas antigo desmontando depois do novo não pode apagar o novo.
    unregisterFirst()
    expect(getWebpageOpener()).toBe(second)

    unregisterSecond()
    expect(getWebpageOpener()).toBeNull()
  })
})
