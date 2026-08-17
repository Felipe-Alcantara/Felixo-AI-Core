import { describe, expect, it } from 'vitest'

import { deveMostrarRodapeDeStatus } from './toolbar-status'

/**
 * O rodapé existe para tirar informação do meio da fileira de botões. Esta é a
 * única decisão dele que dá para testar sem renderizar: se há algo a dizer.
 * Um separador desenhado sozinho, sem conteúdo, seria trocar um defeito visual
 * por outro.
 */
describe('deveMostrarRodapeDeStatus', () => {
  it('mostra quando há versão instalada', () => {
    expect(
      deveMostrarRodapeDeStatus({ versao: '0.1.24', atualizacaoVisivel: false }),
    ).toBe(true)
  })

  it('mostra quando há atualização a anunciar, mesmo sem versão', () => {
    // Acontece fora do Electron ou antes de o IPC da versão responder.
    expect(
      deveMostrarRodapeDeStatus({ versao: null, atualizacaoVisivel: true }),
    ).toBe(true)
  })

  it('não desenha separador solto quando não há nada a dizer', () => {
    expect(
      deveMostrarRodapeDeStatus({ versao: null, atualizacaoVisivel: false }),
    ).toBe(false)
  })

  it('versão em branco conta como ausente', () => {
    expect(
      deveMostrarRodapeDeStatus({ versao: '   ', atualizacaoVisivel: false }),
    ).toBe(false)
  })

  it('versão vazia conta como ausente', () => {
    expect(deveMostrarRodapeDeStatus({ versao: '', atualizacaoVisivel: false })).toBe(
      false,
    )
  })
})
