import { afterEach, describe, expect, it, vi } from 'vitest'
import { RendererRecoveryBoundary } from './RendererRecoveryBoundary'
import { botaoPor, acharTodos, textoDe } from './features/shared/test-support/react-tree'

function comErro() {
  const instancia = new RendererRecoveryBoundary({ children: 'conteúdo do app' })
  instancia.state = RendererRecoveryBoundary.getDerivedStateFromError()
  return instancia
}

describe('RendererRecoveryBoundary', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sem erro entrega os filhos como estão', () => {
    const instancia = new RendererRecoveryBoundary({ children: 'conteúdo do app' })
    expect(instancia.render()).toBe('conteúdo do app')
  })

  it('uma exceção de render vira estado de erro', () => {
    expect(RendererRecoveryBoundary.getDerivedStateFromError()).toEqual({ hasError: true })
  })

  it('com erro mostra a tela de recuperação em vez de um retângulo preto', () => {
    const arvore = comErro().render()
    const titulo = acharTodos(arvore, (e) => e.type === 'h1')[0]
    expect(textoDe(titulo)).toBe('A interface não conseguiu carregar')
    expect(textoDe(arvore)).toContain('sem encerrar os terminais')
  })

  it('"Recarregar interface" recarrega só a interface (window.location.reload)', () => {
    const reload = vi.fn()
    vi.stubGlobal('window', { location: { reload } })
    botaoPor(comErro().render(), /^Recarregar interface$/).props.onClick()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('registra a queda no QA Logger, que sobrevive ao reload', () => {
    const log = vi.fn()
    vi.stubGlobal('window', { felixo: { qaLogger: { log } } })
    const erro = new Error('quebrou ao renderizar')
    const console_ = vi.spyOn(console, 'error').mockImplementation(() => {})
    comErro().componentDidCatch(erro, { componentStack: '\n  at Bloco' })
    console_.mockRestore()
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        scope: 'renderer:recovery-boundary',
        message: 'quebrou ao renderizar',
        details: expect.objectContaining({ componentStack: '\n  at Bloco' }),
      }),
    )
  })
})
