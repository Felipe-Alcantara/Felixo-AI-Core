// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpeniaOutdatedNotice } from './OpeniaOutdatedNotice'

function ponte(version: string, outdated: boolean) {
  const installOfficial = vi.fn(async () => ({ ok: true }))
  const listOfficial = vi.fn(async () => ({
    ok: true,
    clis: [{ id: 'openia', version, outdated, minimumVersion: '0.2.0' }],
  }))
  ;(window as unknown as { felixo: unknown }).felixo = { cli: { listOfficial, installOfficial } }
  return { installOfficial }
}

afterEach(() => {
  cleanup()
  delete (window as unknown as { felixo?: unknown }).felixo
})

describe('OpeniaOutdatedNotice', () => {
  it('com 0.1.0 avisa e só atualiza no segundo clique', async () => {
    const { installOfficial } = ponte('0.1.0', true)
    await act(async () => {
      render(<OpeniaOutdatedNotice />)
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Atualizar' }))
    expect(installOfficial).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar atualização' }))
    })
    expect(installOfficial).toHaveBeenCalledWith({ id: 'openia', confirmed: true })
    expect(screen.getByText(/Openia atualizado/)).toBeTruthy()
  })

  it('com 0.2.0 não mostra nada', async () => {
    ponte('0.2.0', false)
    let container!: HTMLElement
    await act(async () => {
      container = render(<OpeniaOutdatedNotice />).container
    })
    expect(container.textContent).toBe('')
  })
})
