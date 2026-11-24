// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountSwitchDialog } from './AccountSwitchDialog'
import type { AccountSwitchDialogBinding } from '../hooks/useAccountContinuation'
import { makeCandidate, makeProposal } from '../services/__fixtures__/account-chain-fixtures'

/** Ligação do diálogo com funções espiãs: cada botão tem de chamar a sua, e só a sua. */
function ligar(overrides: Partial<AccountSwitchDialogBinding> = {}) {
  const b: AccountSwitchDialogBinding = {
    proposal: makeProposal(),
    closedElsewhere: false,
    transcript: { ok: true, text: 'contexto', chars: 8, lines: 1 },
    busy: false,
    error: null,
    sourceActiveRequired: false,
    sourceYolo: false,
    openiaModelPrice: null,
    canPin: true,
    screenOnly: false,
    onConfirm: vi.fn(),
    onLater: vi.fn(),
    onNotALimit: vi.fn(),
    onPin: vi.fn(),
    onMeasureNow: vi.fn(),
    onCheckLogin: vi.fn(),
    onOpenChainSettings: vi.fn(),
    onGoToSource: vi.fn(),
    onCancelAutoContinue: vi.fn(async () => 'cancelled' as const),
    onClose: vi.fn(),
    ...overrides,
  }
  return b
}

function abrir(b: AccountSwitchDialogBinding) {
  render(<AccountSwitchDialog binding={b} />)
}

const botao = (nome: string | RegExp) => screen.getByRole('button', { name: nome })
/** O botão primário (o texto muda com o destino: "Abrir em …"). */
const confirmar = () => document.querySelector('.felixo-primary-action') as HTMLButtonElement

describe('AccountSwitchDialog (clique)', () => {
  afterEach(() => cleanup())

  it('abre com a conta recomendada marcada e o foco nela, nunca no botão de confirmar', () => {
    abrir(ligar())
    const marcado = screen.getAllByRole('radio').find((r) => (r as HTMLInputElement).checked) as HTMLInputElement
    expect(marcado).toBeTruthy()
    expect(document.activeElement).toBe(marcado)
  })

  it('Trocar de conta confirma com o destino escolhido, "enviar o texto" ligado e sem reconhecer origem ativa', () => {
    const b = ligar()
    abrir(b)

    fireEvent.click(confirmar())

    expect(b.onConfirm).toHaveBeenCalledTimes(1)
    expect(b.onConfirm).toHaveBeenCalledWith(expect.objectContaining({ destinationAccountId: 'conta-b', autoSubmit: true, acknowledgeSourceActive: false }))
  })

  it('escolher outro rádio muda o destino confirmado', () => {
    const b = ligar()
    abrir(b)

    fireEvent.click(screen.getAllByRole('radio')[1])
    fireEvent.click(confirmar())

    expect(b.onConfirm).toHaveBeenCalledWith(expect.objectContaining({ destinationAccountId: 'conta-c' }))
  })

  it('"Agora não" e o X chamam onLater; Esc também, e Enter sobre um rádio não confirma nada', () => {
    const b = ligar()
    abrir(b)

    fireEvent.click(screen.getAllByRole('button', { name: 'Agora não' })[0])
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.keyDown(screen.getAllByRole('radio')[0], { key: 'Enter' })

    expect(b.onLater).toHaveBeenCalledTimes(2)
    expect(b.onConfirm).not.toHaveBeenCalled()
  })

  it('"Ir para o terminal antigo", "Fixar nesta conta", "Não era limite" e "Medir agora" chamam cada um o seu', () => {
    const b = ligar()
    abrir(b)

    fireEvent.click(botao('Ir para o terminal antigo'))
    fireEvent.click(botao(/Fixar/))
    fireEvent.click(botao(/Não era limite/))

    expect(b.onGoToSource).toHaveBeenCalledTimes(1)
    expect(b.onPin).toHaveBeenCalledTimes(1)
    expect(b.onNotALimit).toHaveBeenCalledTimes(1)
    expect(b.onConfirm).not.toHaveBeenCalled()
  })

  it('"Medir agora" só existe na estratégia de maior capacidade, e chama onMeasureNow', () => {
    const comum = ligar()
    abrir(comum)
    expect(screen.queryByRole('button', { name: /Medir agora/ })).toBeNull()
    cleanup()

    const b = ligar({ proposal: makeProposal({ strategy: 'most_capacity' }) })
    abrir(b)
    fireEvent.click(botao(/Medir agora/))
    expect(b.onMeasureNow).toHaveBeenCalledTimes(1)
  })

  it('sem conta apta: "Conferir login de novo" leva as contas fora da lista, "Configurar cadeia" e "Fechar" chamam os seus', () => {
    const b = ligar({
      proposal: makeProposal({
        candidates: [],
        recommendedAccountId: null,
        excluded: [
          { accountId: 'conta-b', providerId: 'codex', label: 'Trabalho', reason: 'sem-chave', reasonText: null },
          { accountId: 'conta-c', providerId: 'codex', label: 'Reserva', reason: 'sem-chave', reasonText: null },
        ],
      }),
    })
    abrir(b)

    fireEvent.click(botao('Conferir login de novo'))
    fireEvent.click(botao('Configurar cadeia'))
    fireEvent.click(botao('Fechar'))

    expect(b.onCheckLogin).toHaveBeenCalledWith(['conta-b', 'conta-c'])
    expect(b.onOpenChainSettings).toHaveBeenCalledTimes(1)
    expect(b.onClose).toHaveBeenCalledTimes(1)
  })

  it('destino de outro provedor: "Yolo no bloco novo" vem marcado, e desmarcar vai na confirmação', () => {
    const b = ligar({
      proposal: makeProposal({ candidates: [makeCandidate({ accountId: 'conta-b', label: 'Max', providerId: 'claude' })] }),
    })
    abrir(b)
    const caixa = screen.getByRole('checkbox', { name: /Yolo no bloco novo/ }) as HTMLInputElement
    expect(caixa.checked).toBe(true)

    fireEvent.click(caixa)
    fireEvent.click(confirmar())

    expect(b.onConfirm).toHaveBeenCalledWith(expect.objectContaining({ destinationAccountId: 'conta-b', yolo: false }))
  })

  it('o terminal de origem ainda ativo exige o reconhecimento antes de confirmar', () => {
    const b = ligar({ sourceActiveRequired: true })
    abrir(b)
    const primario = confirmar()
    expect(primario.disabled).toBe(true)

    fireEvent.click(screen.getByRole('checkbox', { name: /Entendo; abrir mesmo assim/ }))
    expect(primario.disabled).toBe(false)
    fireEvent.click(primario)

    expect(b.onConfirm).toHaveBeenCalledWith(expect.objectContaining({ acknowledgeSourceActive: true }))
  })

  it('com o confirm em curso, nada pode ser confirmado nem dispensado de novo', () => {
    const b = ligar({ busy: true })
    abrir(b)

    expect(botao(/Abrindo/)).toBeTruthy()
    expect(confirmar().disabled).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(b.onLater).not.toHaveBeenCalled()
  })

  describe('Cancelar a continuação automática', () => {
    const programado = () => makeProposal({ sourceAutoResumeAt: '2026-09-28T19:40:00.000Z' })

    it('manda um Esc ao terminal antigo só pelo clique e mostra o resultado', async () => {
      const b = ligar({ proposal: programado() })
      abrir(b)
      expect(b.onCancelAutoContinue).not.toHaveBeenCalled()

      await act(async () => {
        fireEvent.click(botao('Cancelar a continuação automática'))
      })

      expect(b.onCancelAutoContinue).toHaveBeenCalledTimes(1)
      expect(screen.getByText(/Continuação automática cancelada/)).toBeTruthy()
    })

    it('um segundo clique depois de cancelado não manda outro Esc', async () => {
      const b = ligar({ proposal: programado() })
      abrir(b)

      await act(async () => {
        fireEvent.click(botao('Cancelar a continuação automática'))
      })
      await act(async () => {
        fireEvent.click(botao('Cancelar a continuação automática'))
      })

      expect(b.onCancelAutoContinue).toHaveBeenCalledTimes(1)
    })

    it('quando o Claude não cancela (texto digitado na caixa), o aviso manda cancelar no terminal antigo e dá para tentar de novo', async () => {
      const onCancelAutoContinue = vi.fn(async () => 'not-cancelled' as const)
      abrir(ligar({ proposal: programado(), onCancelAutoContinue }))

      await act(async () => {
        fireEvent.click(botao('Cancelar a continuação automática'))
      })
      expect(screen.getByText(/abra o terminal antigo e cancele lá/)).toBeTruthy()

      await act(async () => {
        fireEvent.click(botao('Cancelar a continuação automática'))
      })
      expect(onCancelAutoContinue).toHaveBeenCalledTimes(2)
    })

    it('se o envio falha, diz que o terminal antigo não está mais aberto', async () => {
      const onCancelAutoContinue = vi.fn(async () => {
        throw new Error('IPC caiu')
      })
      abrir(ligar({ proposal: programado(), onCancelAutoContinue }))

      await act(async () => {
        fireEvent.click(botao('Cancelar a continuação automática'))
      })

      expect(screen.getByText(/não está mais aberto/)).toBeTruthy()
    })

    it('o botão nem existe quando o Claude não está programado para continuar sozinho', () => {
      abrir(ligar())
      expect(screen.queryByRole('button', { name: 'Cancelar a continuação automática' })).toBeNull()
    })
  })
})
