// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ preview: vi.fn<(...args: unknown[]) => unknown>(), discard: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}) }))

// A cadeia ligada, com Claude e Codex como membros: é o que faz a opção "Automática (cadeia)" existir.
vi.mock('../hooks/useAccountChain', async (original) => {
  const real = await original<typeof import('../hooks/useAccountChain')>()
  return {
    ...real,
    useAccountChain: () => ({
      snapshot: {
        status: 'ready',
        state: {
          settings: { enabled: true },
          members: [
            { providerId: 'claude', locked: false },
            { providerId: 'codex', locked: false },
          ],
        },
      },
      store: { bridge: null },
    }),
  }
})
vi.mock('../services/account-chain-client', async (original) => {
  const real = await original<typeof import('../services/account-chain-client')>()
  return {
    ...real,
    getAccountChainBridge: () => null,
    previewChainLaunch: (...args: unknown[]) => estado.preview(...args),
    discardChainPreview: (...args: unknown[]) => estado.discard(...args),
  }
})

import { AgentConfigFields } from './AgentConfigFields'
import { useAgentConfig } from '../hooks/useAgentConfig'
import { instalarLocalStorageEmMemoria } from '../../shared/test-support/jsdom-storage'
import { instalarShimsDeLayout } from '../../shared/test-support/jsdom-shims'

instalarShimsDeLayout()

function Formulario() {
  const config = useAgentConfig([], { persistPreferences: false })
  return <AgentConfigFields config={config} projects={[]} onAddFolder={async () => []} />
}

async function passar() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function clicar(elemento: HTMLElement) {
  await act(async () => {
    fireEvent.click(elemento)
  })
  await passar()
}

describe('AgentConfigFields: conta automática (cadeia)', () => {
  beforeEach(() => {
    instalarLocalStorageEmMemoria()
    estado.preview.mockReset()
    estado.preview.mockResolvedValue({ status: 'ready', proposal: { id: 'proposta-1' }, summary: 'Conta Trabalho (Claude).' })
    ;(window as unknown as { felixo: unknown }).felixo = {
      cliAccounts: { list: vi.fn(async () => ({ ok: true, accounts: [] })) },
    }
  })
  afterEach(() => cleanup())

  it('escolher "Automática (cadeia)" pede a prévia e mostra a conta que a cadeia indicou', async () => {
    render(<Formulario />)
    await passar()

    await clicar(screen.getByRole('combobox', { name: 'Conta' }))
    await clicar(screen.getByRole('option', { name: /Automática \(cadeia\)/ }))

    expect(estado.preview).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status').textContent).toContain('Conta Trabalho (Claude). Abrir confirma essa conta.')
  })

  it('"Recalcular" pede uma prévia nova, e a anterior é descartada para não ficar proposta aberta', async () => {
    render(<Formulario />)
    await passar()
    await clicar(screen.getByRole('combobox', { name: 'Conta' }))
    await clicar(screen.getByRole('option', { name: /Automática \(cadeia\)/ }))
    estado.preview.mockResolvedValue({ status: 'ready', proposal: { id: 'proposta-2' }, summary: 'Conta Reserva (Claude).' })

    await clicar(screen.getByRole('button', { name: 'Recalcular' }))

    expect(estado.preview).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('status').textContent).toContain('Conta Reserva (Claude).')
    expect(estado.discard).toHaveBeenCalledWith(null, 'proposta-1')
  })
})
