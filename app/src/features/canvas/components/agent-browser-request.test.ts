import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  BROWSER_REQUEST_ARM_MS,
  browserDecisionError,
  browserDecisionParams,
  browserRequestArmKey,
  describeBrowserRequestOrigin,
  describeBrowserRequestSuggestion,
  isRepeatedClick,
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

  it('os botões esperam de novo quando o cartão mostra outra coisa', () => {
    // Um duplo clique leva uns 300 ms; a espera cobre o segundo clique com folga.
    expect(BROWSER_REQUEST_ARM_MS).toBeGreaterThanOrEqual(500)
    const base = browserRequestArmKey(request())
    expect(browserRequestArmKey(request())).toBe(base)
    expect(browserRequestArmKey(null)).toBeNull()
    // Outro pedido, ou o mesmo pedido reescrito: a pessoa precisa ler de novo.
    for (const outro of [
      request({ id: 'pedido-2' }),
      request({ url: 'https://evil.example/' }),
      request({ modo: 'embutido' }),
      request({ modo: 'embutido', perfil: 'Pessoal' }),
    ]) {
      expect(browserRequestArmKey(outro)).not.toBe(base)
    }
    // A fila crescer atrás do pedido não muda o que o cartão mostra.
    expect(browserRequestArmKey(request({ origem: '/outra/pasta' }))).toBe(base)
  })

  it('o clique repetido de um duplo clique não decide; o teclado (detail 0) decide', () => {
    expect(isRepeatedClick(0)).toBe(false)
    expect(isRepeatedClick(1)).toBe(false)
    expect(isRepeatedClick(2)).toBe(true)
    expect(isRepeatedClick(3)).toBe(true)
  })
})

describe('AgentBrowserRequestCard (sonda do código)', () => {
  const source = readFileSync(new URL('./AgentBrowserRequestCard.tsx', import.meta.url), 'utf8')

  it('clicar no cartão não fecha a gaveta do terminal', () => {
    // `shouldCloseOnOutsideClick` ignora o que está dentro desse marcador.
    expect(source).toMatch(/<section[^>]*\sdata-felixo-floating-layer\s/)
  })

  it('mostra o endereço inteiro numa caixa com rolagem, sem cortar o fim', () => {
    expect(source).not.toMatch(/line-clamp/)
    expect(source).toMatch(/max-h-\S+ overflow-y-auto/)
    expect(source).toMatch(/\{destination\.url\}/)
  })

  it('não rouba o foco nem ouve teclas globais', () => {
    expect(source).not.toMatch(/autoFocus|\.focus\(|addEventListener\(|onKeyDown/)
  })

  it('todo botão de decisão espera o cartão armar e ignora o clique repetido', () => {
    const buttons = source.match(/<button\b/g) ?? []
    expect(buttons).toHaveLength(4)
    expect(source.match(/disabled=\{actionsDisabled\}/g)).toHaveLength(4)
    expect(source.match(/onClick=\{onChoose\(/g)).toHaveLength(4)
  })
})
