// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentBrowserRequestCard } from './AgentBrowserRequestCard'
import { BROWSER_REQUEST_ARM_MS } from './agent-browser-request'
import type { CanvasAgentBrowserRequest } from '../types'

function pedido(id: string, extra: Partial<CanvasAgentBrowserRequest> = {}): CanvasAgentBrowserRequest {
  return { id, url: `https://example.com/${id}`, modo: 'externo', origem: '/projeto', pedidoEm: '2026-11-24T12:00:00.000Z', ...extra }
}

/** Ponte falsa do canvas: a lista que o main devolve e as decisões que o cartão manda de volta. */
function montarPonte(fila: CanvasAgentBrowserRequest[], resposta: { ok: boolean; message?: string; resolved?: boolean } = { ok: true, resolved: true }) {
  const decisoes: Array<Record<string, unknown>> = []
  const canvas = {
    listBrowserRequests: vi.fn(async () => ({ ok: true, requests: fila })),
    onBrowserRequests: vi.fn(() => () => {}),
    decideBrowserRequest: vi.fn(async (params: Record<string, unknown>) => {
      decisoes.push(params)
      return resposta
    }),
  }
  ;(window as unknown as { felixo: unknown }).felixo = { canvas }
  return { canvas, decisoes }
}

/** Mostra o cartão e deixa passar o prazo em que os botões ainda não valem (um Enter apressado não decide). */
async function abrir() {
  render(<AgentBrowserRequestCard />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(BROWSER_REQUEST_ARM_MS + 50)
  })
}

describe('AgentBrowserRequestCard (clique)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('"Abrir no navegador" decide o pedido como externo, com o endereço que o cartão mostrou', async () => {
    const { decisoes } = montarPonte([pedido('a')])
    await abrir()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Abrir no navegador/ }))
    })

    expect(decisoes).toEqual([{ id: 'a', destino: 'externo', url: 'https://example.com/a' }])
  })

  it('"Recusar" decide com destino nulo', async () => {
    const { decisoes } = montarPonte([pedido('a')])
    await abrir()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Recusar$/ }))
    })

    expect(decisoes).toEqual([{ id: 'a', destino: null, url: 'https://example.com/a' }])
  })

  it('"Recusar todos" recusa cada pedido da fila, em ordem', async () => {
    const { decisoes } = montarPonte([pedido('a'), pedido('b'), pedido('c')])
    await abrir()
    expect(screen.getByText('+2 na fila')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Recusar todos \(3\)/ }))
    })

    expect(decisoes.map((d) => [d.id, d.destino])).toEqual([['a', null], ['b', null], ['c', null]])
  })

  it('só vale depois do prazo de armar: um clique logo que o cartão aparece não decide nada', async () => {
    const { decisoes } = montarPonte([pedido('a')])
    render(<AgentBrowserRequestCard />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    const botao = screen.getByRole('button', { name: /^Recusar$/ }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    await act(async () => {
      fireEvent.click(botao)
    })
    expect(decisoes).toEqual([])
  })

  it('o segundo clique de um duplo clique não decide de novo', async () => {
    const { decisoes } = montarPonte([pedido('a'), pedido('b')])
    await abrir()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Recusar$/ }), { detail: 2 })
    })

    expect(decisoes).toEqual([])
  })

  it('quando o main recusa a decisão, o cartão mostra o motivo e para a fila no pedido que falhou', async () => {
    const { decisoes } = montarPonte([pedido('a'), pedido('b')], { ok: false, message: 'Pedido expirou.' })
    await abrir()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Recusar todos/ }))
    })

    expect(decisoes).toHaveLength(1)
    expect(screen.getByRole('alert').textContent).toBe('Pedido expirou.')
  })
})
