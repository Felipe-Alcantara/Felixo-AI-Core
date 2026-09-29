import { describe, expect, it } from 'vitest'

import {
  describeBrowserRequestOrigin,
  describeBrowserRequestSuggestion,
  pickBrowserRequest,
} from './agent-browser-request'
import type { CanvasAgentBrowserRequest } from '../types'

function request(overrides: Partial<CanvasAgentBrowserRequest> = {}): CanvasAgentBrowserRequest {
  return {
    id: 'pedido-1',
    url: 'https://example.com/',
    modo: 'externo',
    origem: '/home/pessoa/projeto',
    pedidoEm: '2026-09-29T12:00:00.000Z',
    ...overrides,
  }
}

describe('cartão de pedido de abertura de página', () => {
  it('atende o mais antigo primeiro (o main já manda em ordem)', () => {
    const first = request({ id: 'a' })
    expect(pickBrowserRequest([first, request({ id: 'b' })])).toBe(first)
    expect(pickBrowserRequest([])).toBeNull()
    expect(pickBrowserRequest(undefined)).toBeNull()
  })

  it('diz de onde o pedido veio', () => {
    expect(describeBrowserRequestOrigin(request())).toBe('Pedido de um agente em /home/pessoa/projeto')
    expect(describeBrowserRequestOrigin(request({ origem: '' }))).toBe('Pedido de um agente')
  })

  it('a sugestão do agente é só sugestão, com o perfil quando ele pediu um', () => {
    expect(describeBrowserRequestSuggestion(request())).toBe('O agente sugeriu o navegador.')
    expect(describeBrowserRequestSuggestion(request({ modo: 'embutido' }))).toBe(
      'O agente sugeriu a Página Web.',
    )
    expect(describeBrowserRequestSuggestion(request({ modo: 'embutido', perfil: 'Trabalho' }))).toBe(
      'O agente sugeriu a Página Web, no perfil Trabalho.',
    )
  })

  it('campo que não é texto não derruba o cartão: vira a frase sem ele', () => {
    // A sonda da revisão: `{"toString":1}` lança ao entrar num template, e o
    // render do cartão levava a interface junto.
    const torto = { toString: 1 } as unknown as string
    expect(describeBrowserRequestSuggestion(request({ modo: 'embutido', perfil: torto }))).toBe(
      'O agente sugeriu a Página Web.',
    )
    expect(describeBrowserRequestOrigin(request({ origem: torto }))).toBe('Pedido de um agente')
  })
})
