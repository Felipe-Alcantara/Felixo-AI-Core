import { describe, expect, it } from 'vitest'
import { tabTrapTarget } from './keyboard-focus'

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
