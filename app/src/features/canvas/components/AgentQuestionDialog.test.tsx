// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentQuestionDialog } from './AgentQuestionDialog'
import type { CanvasAgentQuestion } from '../types'

function pergunta(id: string, extra: Partial<CanvasAgentQuestion> = {}): CanvasAgentQuestion {
  return {
    id,
    acao: 'perguntar',
    pergunta: 'Qual banco usar?',
    opcoes: [{ label: 'SQLite' }, { label: 'Postgres', descricao: 'Mais pesado' }],
    estado: 'pendente',
    pedidoEm: '2026-11-24T12:00:00.000Z',
    origem: '/projeto',
    ...extra,
  }
}

function montarPonte(fila: CanvasAgentQuestion[], resposta: { ok: boolean; message?: string } = { ok: true }) {
  const respostas: Array<{ id: string; indice: number | null }> = []
  const canvas = {
    listQuestions: vi.fn(async () => ({ ok: true, requests: fila })),
    onQuestions: vi.fn(() => () => {}),
    answerQuestion: vi.fn(async (params: { id: string; indice: number | null }) => {
      respostas.push(params)
      return resposta
    }),
  }
  ;(window as unknown as { felixo: unknown }).felixo = { canvas }
  return { respostas }
}

async function abrir() {
  render(<AgentQuestionDialog />)
  await act(async () => {
    await Promise.resolve()
  })
}

describe('AgentQuestionDialog (clique)', () => {
  afterEach(() => cleanup())

  it('mostra a pergunta e as opções numeradas, e o foco vai ao painel (nunca a uma opção)', async () => {
    montarPonte([pergunta('p1')])
    await abrir()

    const dialogo = screen.getByRole('dialog')
    expect(dialogo.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByRole('heading').textContent).toBe('Qual banco usar?')
    expect(screen.getByRole('button', { name: /SQLite/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Postgres/ }).textContent).toContain('Mais pesado')
    expect(document.activeElement).toBe(dialogo)
  })

  it('clicar numa opção responde com o índice dela', async () => {
    const { respostas } = montarPonte([pergunta('p1')])
    await abrir()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Postgres/ }))
    })

    expect(respostas).toEqual([{ id: 'p1', indice: 1 }])
  })

  it('"Dispensar (Esc)" responde sem escolha (índice nulo)', async () => {
    const { respostas } = montarPonte([pergunta('p1')])
    await abrir()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Dispensar/ }))
    })

    expect(respostas).toEqual([{ id: 'p1', indice: null }])
  })

  it('o teclado responde pela mesma via: a tecla 2 escolhe a segunda opção e Esc dispensa', async () => {
    const { respostas } = montarPonte([pergunta('p1')])
    await abrir()

    await act(async () => {
      fireEvent.keyDown(screen.getByRole('dialog'), { key: '2' })
    })
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    })

    expect(respostas).toEqual([{ id: 'p1', indice: 1 }, { id: 'p1', indice: null }])
  })

  it('quando o main recusa a resposta, o diálogo continua aberto e mostra o motivo', async () => {
    montarPonte([pergunta('p1')], { ok: false, message: 'A pergunta já foi respondida.' })
    await abrir()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /SQLite/ }))
    })

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('A pergunta já foi respondida.')).toBeTruthy()
  })

  it('sem pergunta pendente não desenha nada', async () => {
    montarPonte([])
    await abrir()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
