import { describe, expect, it } from 'vitest'

import {
  browserDecisionError,
  browserDecisionParams,
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

  it('a decisão leva o que o cartão mostrou, para o main conferir com o pedido gravado', () => {
    expect(browserDecisionParams(request(), 'externo')).toEqual({
      id: 'pedido-1',
      destino: 'externo',
      url: 'https://example.com/',
    })
    expect(browserDecisionParams(request({ modo: 'embutido', perfil: 'Trabalho' }), null)).toEqual({
      id: 'pedido-1',
      destino: null,
      url: 'https://example.com/',
      perfil: 'Trabalho',
    })
  })

  it('só uma decisão atendida fica calada; o resto mostra o motivo', () => {
    expect(browserDecisionError({ ok: true, resolved: { estado: 'aceito' } })).toBeNull()
    // Nada feito: o pedido mudou, já está sendo atendido ou não está mais pendente.
    const mudou = 'O pedido mudou depois de aparecer no cartão. Confira de novo.'
    expect(browserDecisionError({ ok: true, resolved: null, message: mudou })).toBe(mudou)
    // Tentou e não conseguiu (o navegador não abriu): a pessoa pode escolher de novo.
    expect(browserDecisionError({ ok: false, message: 'navegador indisponível' })).toBe('navegador indisponível')
    expect(browserDecisionError(undefined)).toBe('Não foi possível atender o pedido.')
    expect(browserDecisionError({ ok: true, resolved: null })).toBe('Não foi possível atender o pedido.')
  })
})
