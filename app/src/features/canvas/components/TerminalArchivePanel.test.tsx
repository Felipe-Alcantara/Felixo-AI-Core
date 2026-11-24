// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const xterm = vi.hoisted(() => ({
  instancias: [] as Array<{ writes: string[]; resets: number; scrolledToTop: number; disposed: boolean }>,
}))

// O xterm de verdade precisa de canvas e de medidas reais; o painel só escreve nele, reinicia e rola.
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    estado = { writes: [] as string[], resets: 0, scrolledToTop: 0, disposed: false }
    constructor() {
      xterm.instancias.push(this.estado)
    }
    loadAddon() {}
    open() {}
    reset() {
      this.estado.resets += 1
    }
    write(texto: string, depois?: () => void) {
      this.estado.writes.push(texto)
      depois?.()
    }
    scrollToTop() {
      this.estado.scrolledToTop += 1
    }
    dispose() {
      this.estado.disposed = true
    }
  },
}))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }))

import { TerminalArchivePanel } from './TerminalArchivePanel'
import { instalarShimsDeLayout } from '../../shared/test-support/jsdom-shims'

instalarShimsDeLayout()

type Leitura = { ok: boolean; text?: string; start?: number; end?: number; firstOffset?: number; total?: number; message?: string }

function ponte(leituras: Leitura[]) {
  const readArchive = vi.fn(async () => leituras.shift() ?? { ok: false, message: 'sem mais respostas' })
  ;(window as unknown as { felixo: unknown }).felixo = { pty: { readArchive } }
  return readArchive
}

async function abrir(onClose = vi.fn()) {
  render(<TerminalArchivePanel ptySessionId="canvas:no-1" onClose={onClose} />)
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return onClose
}

async function clicar(elemento: HTMLElement) {
  await act(async () => {
    fireEvent.click(elemento)
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('TerminalArchivePanel', () => {
  beforeEach(() => {
    xterm.instancias.length = 0
  })
  afterEach(() => cleanup())

  it('abre pela cauda do arquivo e diz quanto está sendo mostrado', async () => {
    const readArchive = ponte([{ ok: true, text: 'fim da saida\n', start: 2048, end: 4096, firstOffset: 0, total: 4096 }])
    await abrir()

    expect(readArchive).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'canvas:no-1' }))
    expect(screen.getByRole('status').textContent).toBe('Mostrando 2 KB de 4 KB guardados.')
    expect(xterm.instancias[0].writes.at(-1)).toBe('fim da saida\n')
  })

  it('"Carregar mais" lê a página anterior, junta na frente e rola para o topo; sem mais nada, o botão para', async () => {
    const readArchive = ponte([
      { ok: true, text: 'segunda\n', start: 1024, end: 2048, firstOffset: 0, total: 2048 },
      { ok: true, text: 'primeira\n', start: 0, end: 1024, firstOffset: 0, total: 2048 },
    ])
    await abrir()
    const carregar = screen.getByRole('button', { name: 'Carregar mais' }) as HTMLButtonElement
    expect(carregar.disabled).toBe(false)

    await clicar(carregar)

    expect(readArchive).toHaveBeenLastCalledWith(expect.objectContaining({ before: 1024 }))
    expect(xterm.instancias[0].writes.at(-1)).toBe('primeira\nsegunda\n')
    expect(xterm.instancias[0].scrolledToTop).toBe(1)
    expect(screen.getByRole('status').textContent).toContain('desde o começo')
    expect((screen.getByRole('button', { name: 'Carregar mais' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('se a leitura da página anterior falha, o aviso aparece e dá para tentar de novo', async () => {
    const leituras: Leitura[] = [
      { ok: true, text: 'segunda\n', start: 1024, end: 2048, firstOffset: 0, total: 2048 },
      { ok: false, message: 'O arquivo foi apagado.' },
    ]
    ponte(leituras)
    await abrir()

    await clicar(screen.getByRole('button', { name: 'Carregar mais' }))

    expect(screen.getByRole('alert').textContent).toBe('O arquivo foi apagado.')
    expect((screen.getByRole('button', { name: 'Carregar mais' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('terminal sem nada arquivado avisa isso', async () => {
    ponte([{ ok: true, text: '', start: 0, end: 0, firstOffset: 0, total: 0 }])
    await abrir()
    expect(screen.getByRole('status').textContent).toBe('Nada arquivado ainda para este terminal.')
  })

  it('"Voltar ao terminal" fecha o painel e descarta o xterm de leitura', async () => {
    ponte([{ ok: true, text: 'x', start: 0, end: 1, firstOffset: 0, total: 1 }])
    const onClose = await abrir()

    await clicar(screen.getByRole('button', { name: 'Voltar ao terminal' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    cleanup()
    expect(xterm.instancias[0].disposed).toBe(true)
  })

  it('fora do aplicativo (sem a ponte) diz que o histórico só existe nele', async () => {
    ;(window as unknown as { felixo: unknown }).felixo = {}
    await abrir()
    expect(screen.getByRole('alert').textContent).toBe('O Histórico arquivado só existe no aplicativo.')
  })
})
