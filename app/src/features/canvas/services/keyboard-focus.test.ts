import { describe, expect, it } from 'vitest'
import { rovingIndex, tabTrapTarget } from './keyboard-focus'

describe('tabTrapTarget', () => {
  const focusable = ['fechar', 'campo', 'confirmar']

  it('mantém Tab dentro do modal pelas duas extremidades', () => {
    expect(tabTrapTarget(focusable, 'confirmar', false)).toBe('fechar')
    expect(tabTrapTarget(focusable, 'fechar', true)).toBe('confirmar')
  })

  it('deixa a navegação normal seguir quando há outro controle no sentido pedido', () => {
    expect(tabTrapTarget(focusable, 'campo', false)).toBeNull()
    expect(tabTrapTarget(focusable, 'campo', true)).toBeNull()
  })

  it('recupera o foco mesmo se ele escapar do modal', () => {
    expect(tabTrapTarget(focusable, null, false, false)).toBe('fechar')
    expect(tabTrapTarget(focusable, null, true, false)).toBe('confirmar')
  })

  it('não deixa o foco sair se o elemento ativo do diálogo não é um controle', () => {
    expect(tabTrapTarget(focusable, 'painel', false)).toBe('fechar')
    expect(tabTrapTarget(focusable, 'painel', true)).toBe('confirmar')
  })

  it('devolve null quando o diálogo não tem controles focáveis', () => {
    expect(tabTrapTarget([], null, false, false)).toBeNull()
  })
})

describe('rovingIndex', () => {
  it('circula com as setas da orientação e vai às pontas com Home/End', () => {
    expect(rovingIndex(0, 'ArrowRight', 3)).toBe(1)
    expect(rovingIndex(2, 'ArrowRight', 3)).toBe(0)
    expect(rovingIndex(0, 'ArrowLeft', 3)).toBe(2)
    expect(rovingIndex(1, 'Home', 3)).toBe(0)
    expect(rovingIndex(1, 'End', 3)).toBe(2)
    expect(rovingIndex(0, 'ArrowDown', 3, 'vertical')).toBe(1)
  })

  it('não navega com tecla de outra orientação, outra tecla ou grupo vazio', () => {
    expect(rovingIndex(0, 'ArrowDown', 3)).toBeNull()
    expect(rovingIndex(0, 'Enter', 3)).toBeNull()
    expect(rovingIndex(0, 'ArrowRight', 0)).toBeNull()
  })
})
