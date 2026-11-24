// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  chainEnabled: true,
  metadata: undefined as undefined | Record<string, unknown>,
  changeSessionAccountMode: vi.fn(),
}))

// A moldura e as ligações com a cadeia vivem em outros arquivos: o teste olha só os controles do painel.
vi.mock('./tools/CanvasPanel', () => ({
  CanvasPanel: ({ title, children }: { title: string; children: ReactNode }) => (
    <section aria-label={title}>{children}</section>
  ),
}))
vi.mock('./tools/AccountSwitchHistory', () => ({ AccountSwitchHistory: () => <p>historico de trocas</p> }))
vi.mock('../terminal/terminal-session-context', () => ({ useSessionMetadata: () => estado.metadata }))
vi.mock('../hooks/useAccountChain', () => ({
  useAccountChain: () => ({ snapshot: { state: { settings: { enabled: estado.chainEnabled } } }, store: { bridge: {} } }),
  useCliAccountLabel: (accountId?: string) => (accountId ? 'Conta de trabalho' : undefined),
}))
vi.mock('../services/account-chain-client', () => ({
  changeSessionAccountMode: (...args: unknown[]) => estado.changeSessionAccountMode(...args),
}))

import { TerminalDetailsPanel } from './TerminalDetailsPanel'
import type { TerminalNodeData } from '../types'

const SESSAO = { version: 1, provider: 'claude', sessionId: 'sessao-abc', cwd: '/tmp/loja', capturedAt: 1 }

function montar(data: Partial<TerminalNodeData> = {}) {
  const props = {
    onClose: vi.fn(),
    onClearAgentSession: vi.fn(),
    onAccountModeChange: vi.fn(),
    onResponsibleChange: vi.fn(),
    onFocusNode: vi.fn(),
  }
  render(
    <TerminalDetailsPanel
      nodeId="no-1"
      data={{ label: 'Agente', command: 'claude', args: [], cwd: '/tmp/loja', ...data } as TerminalNodeData}
      toolsMenuOpen={false}
      {...props}
    />,
  )
  return props
}

describe('TerminalDetailsPanel (clique)', () => {
  beforeEach(() => {
    estado.chainEnabled = true
    estado.metadata = undefined
    estado.changeSessionAccountMode.mockReset()
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  describe('Esquecer associação da conversa', () => {
    it('só aparece com uma conversa associada', () => {
      montar()
      expect(screen.queryByRole('button', { name: /Esquecer associação/ })).toBeNull()
    })

    it('depois do "ok" da confirmação, esquece a associação', () => {
      vi.stubGlobal('confirm', vi.fn(() => true))
      const props = montar({ agentSession: SESSAO } as Partial<TerminalNodeData>)

      fireEvent.click(screen.getByRole('button', { name: /Esquecer associação da conversa/ }))

      expect(props.onClearAgentSession).toHaveBeenCalledTimes(1)
    })

    it('cancelando a confirmação, nada é esquecido', () => {
      vi.stubGlobal('confirm', vi.fn(() => false))
      const props = montar({ agentSession: SESSAO } as Partial<TerminalNodeData>)

      fireEvent.click(screen.getByRole('button', { name: /Esquecer associação da conversa/ }))

      expect(props.onClearAgentSession).not.toHaveBeenCalled()
    })
  })

  describe('Copiar', () => {
    it('copia a pasta de trabalho e não mostra erro', async () => {
      const writeText = vi.fn(async () => {})
      vi.stubGlobal('navigator', { clipboard: { writeText } })
      montar()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copiar Pasta de trabalho' }))
      })

      expect(writeText).toHaveBeenCalledWith('/tmp/loja')
      expect(screen.getByRole('button', { name: 'Copiar Pasta de trabalho' })).toBeTruthy()
    })

    it('copia o ID do elemento e o ID da conversa pelos seus próprios botões', async () => {
      const writeText = vi.fn(async () => {})
      vi.stubGlobal('navigator', { clipboard: { writeText } })
      montar({ agentSession: SESSAO } as Partial<TerminalNodeData>)

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copiar ID do elemento' }))
      })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copiar Sessão do agente' }))
      })

      expect(writeText).toHaveBeenNthCalledWith(1, 'no-1')
      expect(writeText).toHaveBeenNthCalledWith(2, 'sessao-abc')
    })

    it('quando a área de transferência recusa, o botão mostra o motivo em vez de um ✓ falso', async () => {
      vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => { throw new Error('Document is not focused') }) } })
      montar()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copiar Pasta de trabalho' }))
      })

      expect(screen.getByRole('button', { name: /^Copiar Pasta de trabalho: Não foi possível copiar/ })).toBeTruthy()
    })
  })

  describe('modo da conta', () => {
    it('na cadeia, "Fixar nesta conta" grava o modo fixo no bloco quando a troca vale', async () => {
      estado.changeSessionAccountMode.mockResolvedValue({ persist: true, message: null })
      const props = montar({ accountId: 'conta-a', accountMode: 'chain' })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Fixar nesta conta' }))
      })

      expect(estado.changeSessionAccountMode).toHaveBeenCalledWith(expect.anything(), 'canvas:no-1', 'pinned')
      expect(props.onAccountModeChange).toHaveBeenCalledWith('pinned')
    })

    it('fixa, com a cadeia ligada, "Voltar para a cadeia" grava o modo cadeia', async () => {
      estado.changeSessionAccountMode.mockResolvedValue({ persist: true, message: null })
      const props = montar({ accountId: 'conta-a', accountMode: 'pinned' })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Voltar para a cadeia' }))
      })

      expect(props.onAccountModeChange).toHaveBeenCalledWith('chain')
    })

    it('se o main recusa a troca, o bloco não muda e o motivo aparece', async () => {
      estado.changeSessionAccountMode.mockResolvedValue({ persist: false, message: 'A cadeia não está disponível agora.' })
      const props = montar({ accountId: 'conta-a', accountMode: 'chain' })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Fixar nesta conta' }))
      })

      expect(props.onAccountModeChange).not.toHaveBeenCalled()
      expect(screen.getByRole('alert').textContent).toBe('A cadeia não está disponível agora.')
    })

    it('com a cadeia desligada não há como voltar para ela, e sem conta o bloco é do login do sistema', () => {
      estado.chainEnabled = false
      montar({ accountId: 'conta-a', accountMode: 'pinned' })
      expect(screen.queryByRole('button', { name: 'Voltar para a cadeia' })).toBeNull()
      cleanup()

      montar({ accountId: undefined })
      expect(screen.queryByRole('button', { name: /Fixar nesta conta|Voltar para a cadeia/ })).toBeNull()
      expect(screen.getByText(/Login do sistema: só recebe aviso/)).toBeTruthy()
    })
  })

  it('o campo Responsável grava o que se digita', () => {
    const props = montar()

    fireEvent.change(screen.getByPlaceholderText('Sem responsável'), { target: { value: 'Ana' } })

    expect(props.onResponsibleChange).toHaveBeenCalledWith('Ana')
  })
})
