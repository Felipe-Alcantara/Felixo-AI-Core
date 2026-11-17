import { afterEach, describe, expect, it, vi } from 'vitest'
import { restoreFocusIfLost } from './restore-focus'

/** O vitest do projeto roda em node: `window` e `document` são simulados, com o quadro síncrono. */
function stubDom(active: unknown) {
  const body = { tag: 'body' }
  vi.stubGlobal('window', { requestAnimationFrame: (run: () => void) => run() })
  vi.stubGlobal('document', { body, activeElement: active === 'body' ? body : active })
}

afterEach(() => vi.unstubAllGlobals())

describe('restoreFocusIfLost', () => {
  it('devolve o foco ao botão quando o clique caiu num ponto sem nada focável (foco no body)', () => {
    stubDom('body')
    const focus = vi.fn()
    restoreFocusIfLost({ current: { focus } as unknown as HTMLElement })
    expect(focus).toHaveBeenCalledTimes(1)
  })

  it('devolve o foco quando o elemento focado sumiu junto com o menu (activeElement nulo)', () => {
    stubDom(null)
    const focus = vi.fn()
    restoreFocusIfLost({ current: { focus } as unknown as HTMLElement })
    expect(focus).toHaveBeenCalledTimes(1)
  })

  it('não rouba o foco de quem clicou num controle focável, como o terminal ou o resumo do menu de link', () => {
    stubDom({ tag: 'textarea' })
    const focus = vi.fn()
    restoreFocusIfLost({ current: { focus } as unknown as HTMLElement })
    expect(focus).not.toHaveBeenCalled()
  })

  it('não falha se o botão já não existe', () => {
    stubDom('body')
    expect(() => restoreFocusIfLost({ current: null })).not.toThrow()
  })
})
