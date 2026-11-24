// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TerminalMenu } from './TerminalMenu'
import { instalarLocalStorageEmMemoria } from '../../shared/test-support/jsdom-storage'
import { instalarShimsDeLayout } from '../../shared/test-support/jsdom-shims'

instalarShimsDeLayout()

const PROJETOS = [{ id: 'p1', name: 'loja', path: '/tmp/loja' }]

function montar() {
  const props = {
    onAdd: vi.fn(),
    onAddMany: vi.fn(),
    onAddTeam: vi.fn(),
    onAddCloud: vi.fn(),
    onAddClaudeApi: vi.fn(),
    onAddFolder: vi.fn(async () => [] as string[]),
  }
  ;(window as unknown as { felixo: unknown }).felixo = {}
  render(<TerminalMenu projects={PROJETOS} {...props} />)
  return props
}

async function esperar() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function clicar(elemento: HTMLElement) {
  await act(async () => {
    fireEvent.click(elemento)
  })
  await esperar()
}

/** Abre o painel do agente e põe a configuração atual na fila, `vezes` vezes. */
async function abrirEEnfileirar(vezes: number) {
  await clicar(screen.getAllByRole('button', { name: 'Configurar novo agente' })[0])
  for (let i = 0; i < vezes; i += 1) {
    await clicar(screen.getByRole('button', { name: 'Adicionar à fila de terminais' }))
  }
}

describe('TerminalMenu: fila de terminais', () => {
  beforeEach(() => instalarLocalStorageEmMemoria())
  afterEach(() => cleanup())

  it('sem nada na fila não existe a seção Fila', async () => {
    montar()
    await clicar(screen.getAllByRole('button', { name: 'Configurar novo agente' })[0])
    expect(screen.queryByText(/^Fila \(/)).toBeNull()
  })

  it('Adicionar à fila empilha a configuração atual, sem abrir terminal nenhum', async () => {
    const props = montar()

    await abrirEEnfileirar(2)

    expect(screen.getByText('Fila (2)')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Iniciar 2 terminais$/ })).toBeTruthy()
    expect(props.onAdd).not.toHaveBeenCalled()
    expect(props.onAddMany).not.toHaveBeenCalled()
  })

  it('Renomear um item muda o nome com que ele abre', async () => {
    const props = montar()
    await abrirEEnfileirar(1)

    const campo = screen.getByTitle('Renomear antes de iniciar') as HTMLInputElement
    fireEvent.change(campo, { target: { value: 'Revisor de PR' } })
    await clicar(screen.getByRole('button', { name: /^Iniciar 1 terminais$/ }))

    expect(props.onAddMany).toHaveBeenCalledTimes(1)
    expect(props.onAddMany.mock.calls[0][0][0].label).toBe('Revisor de PR')
  })

  it('Remover tira só aquele item da fila', async () => {
    montar()
    await abrirEEnfileirar(3)
    const campos = screen.getAllByTitle('Renomear antes de iniciar') as HTMLInputElement[]
    fireEvent.change(campos[0], { target: { value: 'A' } })
    fireEvent.change(screen.getAllByTitle('Renomear antes de iniciar')[1], { target: { value: 'B' } })
    fireEvent.change(screen.getAllByTitle('Renomear antes de iniciar')[2], { target: { value: 'C' } })

    await clicar(screen.getByRole('button', { name: 'Remover "B" da fila' }))

    expect(screen.getByText('Fila (2)')).toBeTruthy()
    const restantes = (screen.getAllByTitle('Renomear antes de iniciar') as HTMLInputElement[]).map((c) => c.value)
    expect(restantes).toEqual(['A', 'C'])
  })

  it('Esvaziar fila limpa tudo de uma vez', async () => {
    montar()
    await abrirEEnfileirar(3)

    await clicar(screen.getByRole('button', { name: 'Esvaziar fila de terminais' }))

    expect(screen.queryByText(/^Fila \(/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Iniciar \d+ terminais/ })).toBeNull()
  })

  it('Iniciar N abre todos de uma vez, na ordem, e esvazia a fila', async () => {
    const props = montar()
    await abrirEEnfileirar(3)
    const campos = screen.getAllByTitle('Renomear antes de iniciar') as HTMLInputElement[]
    campos.forEach((campo, i) => fireEvent.change(campo, { target: { value: `agente-${i + 1}` } }))

    await clicar(screen.getByRole('button', { name: /^Iniciar 3 terminais$/ }))

    expect(props.onAddMany).toHaveBeenCalledTimes(1)
    expect((props.onAddMany.mock.calls[0][0] as Array<{ label: string }>).map((o) => o.label)).toEqual(['agente-1', 'agente-2', 'agente-3'])
    expect(screen.queryByText(/^Fila \(/)).toBeNull()
    expect(props.onAdd).not.toHaveBeenCalled()
  })
})
