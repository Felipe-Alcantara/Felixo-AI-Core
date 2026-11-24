// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HandoffDialog } from './HandoffDialog'
import { instalarLocalStorageEmMemoria } from '../../shared/test-support/jsdom-storage'

const PROJETOS = [{ id: 'p1', name: 'loja', path: '/tmp/loja' }]

type Resposta = { ok: boolean; message?: string }

function montar(extra: Partial<Parameters<typeof HandoffDialog>[0]> = {}, resposta: Resposta | Error = { ok: true }) {
  const onConfirm = vi.fn(async (options: Record<string, unknown>) => {
    void options
    if (resposta instanceof Error) throw resposta
    return resposta
  })
  const onClose = vi.fn()
  const recordManual = vi.fn(async () => ({ ok: true }))
  ;(window as unknown as { felixo: unknown }).felixo = { accountChain: { recordManual } }
  render(
    <HandoffDialog
      sourceLabel="Agente antigo"
      projects={PROJETOS}
      onAddFolder={async () => []}
      onConfirm={onConfirm}
      onClose={onClose}
      {...extra}
    />,
  )
  return { onConfirm, onClose, recordManual }
}

const confirmar = () => screen.getByRole('button', { name: 'Passar responsabilidade' })

async function clicar(botao: HTMLElement) {
  await act(async () => {
    fireEvent.click(botao)
    await Promise.resolve()
  })
  await act(async () => {
    await Promise.resolve()
  })
}

describe('HandoffDialog', () => {
  beforeEach(() => {
    instalarLocalStorageEmMemoria()
  })
  afterEach(() => cleanup())

  it('abre como diálogo modal com o nome do agente de origem', async () => {
    montar()
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText('Agente antigo')).toBeTruthy()
  })

  it('Passar responsabilidade cria o agente novo com o rótulo de continuação e fecha o diálogo', async () => {
    const { onConfirm, onClose } = montar()

    await clicar(confirmar())

    expect(onConfirm).toHaveBeenCalledTimes(1)
    const opcoes = onConfirm.mock.calls[0][0]
    expect(String(opcoes.label)).toMatch(/ · continuação$/)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Cancelar, o × e Esc fecham sem criar nada', async () => {
    const { onConfirm, onClose } = montar()

    await clicar(screen.getByRole('button', { name: 'Cancelar' }))
    await clicar(screen.getByRole('button', { name: 'Fechar' }))
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })

    expect(onClose).toHaveBeenCalledTimes(3)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('quando a criação do agente falha, o diálogo fica aberto e mostra o motivo', async () => {
    const { onClose } = montar({}, { ok: false, message: 'Sem espaço para mais um terminal.' })

    await clicar(confirmar())

    expect(screen.getByText('Sem espaço para mais um terminal.')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    // E dá para tentar de novo: o botão voltou a ficar livre.
    expect((confirmar() as HTMLButtonElement).disabled).toBe(false)
  })

  it('uma exceção ao criar o agente também vira mensagem, sem fechar', async () => {
    const { onClose } = montar({}, new Error('IPC caiu'))

    await clicar(confirmar())

    expect(screen.getByText('IPC caiu')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('a passagem por causa de uma detecção entra no registro de trocas, com o motivo', async () => {
    const { recordManual } = montar({
      sourceSessionId: 'canvas:terminal-1',
      reason: { failureClass: 'rate_limit', detectedAt: '2026-11-24T12:00:00.000Z' },
    })
    expect(screen.getByText(/Motivo:/)).toBeTruthy()

    await clicar(confirmar())

    expect(recordManual).toHaveBeenCalledTimes(1)
    expect(recordManual).toHaveBeenCalledWith(expect.objectContaining({ sourceSessionId: 'canvas:terminal-1', reasonClass: 'rate_limit' }))
  })

  it('sem motivo detectado a passagem não escreve no registro de trocas', async () => {
    const { recordManual } = montar({ sourceSessionId: 'canvas:terminal-1' })

    await clicar(confirmar())

    expect(recordManual).not.toHaveBeenCalled()
  })

  it('com a tela alternativa avisa que só a tela vai como contexto', async () => {
    montar({ screenOnly: true })
    expect(screen.getByRole('note').textContent).toMatch(/tela/i)
    expect(screen.getByText(/a tela de/)).toBeTruthy()
  })
})
