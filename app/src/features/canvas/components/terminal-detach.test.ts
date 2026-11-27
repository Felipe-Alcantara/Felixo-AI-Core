// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ESPERA_PARA_ESQUECER_MS, janelasLembradas, reiniciarReaberturaParaTeste } from './detached-windows-memory'
import { instalarLocalStorageEmMemoria } from '../../shared/test-support/jsdom-storage'
import { auxIdDoTerminal, detachTerminal, type DetachStore } from './terminal-detach'

/** Janela auxiliar falsa: um documento de verdade (jsdom), sem Electron. */
function fakeWindow() {
  const doc = document.implementation.createHTMLDocument('aux')
  const listeners = new Map<string, Set<() => void>>()
  class FakeResizeObserver {
    observe() {}
    disconnect() {}
  }
  const win = {
    document: doc,
    requestAnimationFrame: vi.fn(() => 1),
    cancelAnimationFrame: vi.fn(),
    ResizeObserver: FakeResizeObserver,
    close: vi.fn(),
    addEventListener: (name: string, fn: () => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name)?.add(fn)
    },
    removeEventListener: (name: string, fn: () => void) => listeners.get(name)?.delete(fn),
    emit: (name: string) => listeners.get(name)?.forEach((fn) => fn()),
    listenerCount: (name: string) => listeners.get(name)?.size ?? 0,
  }
  return win
}

function fakeStore() {
  return {
    attach: vi.fn<DetachStore['attach']>(),
    fit: vi.fn<DetachStore['fit']>(),
    moveTo: vi.fn<DetachStore['moveTo']>(() => true),
    release: vi.fn<DetachStore['release']>(),
  }
}

function setup() {
  const win = fakeWindow()
  const store = fakeStore()
  const home = document.createElement('div')
  const onClosed = vi.fn()
  const handle = detachTerminal({
    sessionId: 'agente-1',
    title: 'Claude da casa',
    store,
    getHome: () => home,
    onClosed,
    open: () => win as unknown as Window,
  })
  return { win, store, home, onClosed, handle }
}

describe('detachTerminal', () => {
  beforeEach(() => {
    instalarLocalStorageEmMemoria()
    reiniciarReaberturaParaTeste()
  })

  it('abre a janela do terminal, titula e encaixa o xterm no contêiner dela', () => {
    const { win, store, handle } = setup()

    expect(handle).not.toBeNull()
    expect(win.document.title).toBe('Claude da casa — Felixo AI Core')
    expect(win.document.body.contains(handle!.container)).toBe(true)
    expect(store.attach).toHaveBeenCalledWith('agente-1', handle!.container)
    // O encaixe usa o rAF da janela onde o terminal está, não o da principal.
    expect(win.requestAnimationFrame).toHaveBeenCalled()
  })

  it('devolve null quando o processo principal nega a janela', () => {
    const handle = detachTerminal({
      sessionId: 'x',
      title: 'x',
      store: fakeStore(),
      getHome: () => null,
      onClosed: vi.fn(),
      open: () => null,
    })
    expect(handle).toBeNull()
  })

  it('picture-in-picture abre a janela de id pip-<sessão>, que o main faz pequena e sempre no topo', () => {
    const win = fakeWindow()
    const abrir = vi.fn(() => win as unknown as Window)
    const handle = detachTerminal({
      sessionId: 'agente-1',
      title: 'Claude da casa',
      modo: 'pip',
      store: fakeStore(),
      getHome: () => null,
      onClosed: vi.fn(),
      open: abrir,
    })

    expect(abrir).toHaveBeenCalledWith('pip-agente-1')
    expect(handle?.modo).toBe('pip')
    expect(win.document.title).toBe('Claude da casa — picture-in-picture')
    expect(auxIdDoTerminal('agente-1')).toBe('t-agente-1')
    expect(auxIdDoTerminal('agente-1', 'pip')).toBe('pip-agente-1')
  })

  it('o id da janela vem da sessão e só tem o formato que o main aceita', () => {
    expect(auxIdDoTerminal('Agente #1 / Ação')).toBe('t-agente-1-a-o')
    expect(auxIdDoTerminal('???')).toBe('t-terminal')
    expect(auxIdDoTerminal('a'.repeat(80))).toMatch(/^t-[a-z0-9-]{1,32}$/)
  })

  it('trazer de volta move o xterm ao painel ANTES de fechar a janela, e só uma vez', () => {
    const { win, store, home, handle } = setup()
    const ordem: string[] = []
    store.moveTo.mockImplementation(() => {
      ordem.push('moveTo')
      return true
    })
    win.close.mockImplementation(() => ordem.push('close'))

    handle!.bringBack()
    handle!.bringBack()

    expect(store.moveTo).toHaveBeenCalledTimes(1)
    expect(store.moveTo).toHaveBeenCalledWith('agente-1', home)
    expect(win.close).toHaveBeenCalledTimes(1)
    expect(ordem).toEqual(['moveTo', 'close'])
    expect(win.listenerCount('pagehide')).toBe(0)
  })

  it('fechar a janela por fora (X) devolve o xterm ao painel e avisa uma vez', () => {
    const { win, store, home, onClosed } = setup()

    win.emit('pagehide')
    win.emit('pagehide')

    expect(store.moveTo).toHaveBeenCalledTimes(1)
    expect(store.moveTo).toHaveBeenCalledWith('agente-1', home)
    expect(onClosed).toHaveBeenCalledTimes(1)
    // Fechou por fora: não pede para fechar de novo.
    expect(win.close).not.toHaveBeenCalled()
  })

  it('sem encaixe do painel (já desmontado) não tenta mover para ele, mas ainda avisa o fechamento', () => {
    const win = fakeWindow()
    const store = fakeStore()
    const onClosed = vi.fn()
    detachTerminal({ sessionId: 'a', title: 'a', store, getHome: () => null, onClosed, open: () => win as unknown as Window })

    win.emit('pagehide')

    expect(store.moveTo).not.toHaveBeenCalled()
    expect(onClosed).toHaveBeenCalledTimes(1)
  })

  it('a janela fica lembrada para reabrir; trazer de volta e descartar esquecem na hora', () => {
    for (const fechar of ['bringBack', 'discard'] as const) {
      const { handle } = setup()
      expect(janelasLembradas()).toEqual([{ sessionId: 'agente-1', modo: 'janela' }])
      handle![fechar]()
      expect(janelasLembradas()).toEqual([])
    }
  })

  // Sair do app também dispara o `pagehide`: esquecer na hora perderia a reabertura.
  it('o X da janela só esquece depois da espera', () => {
    vi.useFakeTimers()
    const { win } = setup()

    win.emit('pagehide')
    expect(janelasLembradas()).toHaveLength(1)
    vi.advanceTimersByTime(ESPERA_PARA_ESQUECER_MS)
    expect(janelasLembradas()).toEqual([])
    vi.useRealTimers()
  })

  it('rebind refaz o encaixe na janela depois de um Reiniciar, e deixa de valer depois de fechar', () => {
    const { store, handle } = setup()

    handle!.rebind()
    expect(store.moveTo).toHaveBeenLastCalledWith('agente-1', handle!.container)
    expect(store.fit).toHaveBeenCalled()

    handle!.discard()
    store.moveTo.mockClear()
    handle!.rebind()
    expect(store.moveTo).not.toHaveBeenCalled()
  })

  it('discard fecha a janela sem mover o terminal (o painel foi desmontado)', () => {
    const { win, store, handle } = setup()

    handle!.discard()

    expect(win.close).toHaveBeenCalledTimes(1)
    expect(store.moveTo).not.toHaveBeenCalled()
  })

  // Um xterm que continua apontando para uma janela fechada derruba o renderer.
  it('discard tira o xterm da janela ANTES de fechá-la', () => {
    const { win, store, handle } = setup()
    const ordem: string[] = []
    store.release.mockImplementation(() => void ordem.push('release'))
    win.close.mockImplementation(() => ordem.push('close'))

    handle!.discard()

    expect(store.release).toHaveBeenCalledWith('agente-1')
    expect(ordem).toEqual(['release', 'close'])
  })

  it('sem encaixe do painel, fechar por fora ou trazer de volta ainda tira o xterm da janela', () => {
    for (const fechar of ['x', 'botao']) {
      const win = fakeWindow()
      const store = fakeStore()
      const handle = detachTerminal({ sessionId: 'a', title: 'a', store, getHome: () => null, onClosed: vi.fn(), open: () => win as unknown as Window })

      if (fechar === 'x') win.emit('pagehide')
      else handle!.bringBack()

      expect(store.release).toHaveBeenCalledWith('a')
    }
  })
})
