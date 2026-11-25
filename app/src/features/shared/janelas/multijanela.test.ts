// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TerminalSessionStore } from '../../canvas/terminal/terminal-session-store'
import { AUX_FRAME_PREFIX, abrirJanelaAuxiliar, clonarEstilos, documentoDe, estaEmJanelaAuxiliar, janelaDe } from './multijanela'

function outraJanela(): Document {
  return document.implementation.createHTMLDocument('aux')
}

describe('documentoDe / janelaDe', () => {
  it('devolvem o global para um nó solto ou ausente e o da janela onde o nó está', () => {
    expect(documentoDe(null)).toBe(document)
    expect(documentoDe(document.createElement('div'))).toBe(document)
    expect(janelaDe(document.body)).toBe(window)

    const aux = outraJanela()
    const no = aux.createElement('div')
    aux.body.appendChild(no)
    expect(documentoDe(no)).toBe(aux)
    expect(documentoDe(aux)).toBe(aux)
    // Sem `defaultView` (documento solto), cai no global em vez de lançar.
    expect(janelaDe(no)).toBe(window)
  })

  it('estaEmJanelaAuxiliar é falso para a janela global', () => {
    expect(estaEmJanelaAuxiliar(document.body)).toBe(false)
  })
})

describe('abrirJanelaAuxiliar', () => {
  afterEach(() => vi.restoreAllMocks())

  it('usa só about:blank e o prefixo fixo que o processo principal aceita', () => {
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null)
    abrirJanelaAuxiliar('t1')
    expect(abrir).toHaveBeenCalledWith('about:blank', `${AUX_FRAME_PREFIX}t1`)
  })
})

describe('clonarEstilos', () => {
  it('copia os estilos, acompanha o que entra e sai e para ao desligar', async () => {
    const aux = outraJanela()
    const estilo = document.createElement('style')
    estilo.textContent = '.a{color:red}'
    document.head.appendChild(estilo)
    try {
      const parar = clonarEstilos(document, aux)
      expect(aux.head.querySelectorAll('style')).toHaveLength(1)
      expect(aux.head.querySelector('style')?.textContent).toBe('.a{color:red}')

      const novo = document.createElement('style')
      novo.textContent = '.b{}'
      document.head.appendChild(novo)
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(aux.head.querySelectorAll('style')).toHaveLength(2)

      estilo.remove()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(aux.head.querySelectorAll('style')).toHaveLength(1)

      parar()
      document.head.appendChild(document.createElement('style'))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(aux.head.querySelectorAll('style')).toHaveLength(1)
      novo.remove()
    } finally {
      estilo.remove()
    }
  })
})

describe('TerminalSessionStore: hostOf / moveTo (um dono por xterm vivo)', () => {
  function storeComSessao() {
    const origem = document.createElement('div')
    const elemento = document.createElement('div')
    origem.appendChild(elemento)
    const kill = vi.fn()
    ;(window as unknown as { felixo: unknown }).felixo = { pty: { kill }, contextFiles: { release: vi.fn() } }
    const store = new TerminalSessionStore()
    const sessoes = (store as unknown as { sessions: Map<string, unknown> }).sessions
    sessoes.set('t1', { terminal: { element: elemento }, ptySessionId: 'canvas:t1' })
    return { store, origem, elemento, kill }
  }

  it('hostOf é o container atual; sem sessão ou sem montagem, null', () => {
    const { store, origem } = storeComSessao()
    expect(store.hostOf('t1')).toBe(origem)
    expect(store.hostOf('nao-existe')).toBeNull()
  })

  it('moveTo recusa sessão inexistente e nunca encerra o PTY', () => {
    const { store, kill } = storeComSessao()
    const destino = outraJanela().createElement('div')
    expect(store.moveTo('nao-existe', destino)).toBe(false)
    expect(kill).not.toHaveBeenCalled()
  })

  it('moveTo leva o mesmo elemento do xterm para o container da outra janela', () => {
    const { store, elemento, kill } = storeComSessao()
    const aux = outraJanela()
    const destino = aux.createElement('div')
    aux.body.appendChild(destino)
    const attach = vi.spyOn(store, 'attach').mockImplementation((_id, container) => {
      container.appendChild(elemento) // o `attach` real faz o mesmo `appendChild`
    })

    expect(store.moveTo('t1', destino)).toBe(true)
    expect(attach).toHaveBeenCalledWith('t1', destino)
    expect(store.hostOf('t1')).toBe(destino)
    expect(documentoDe(elemento)).toBe(aux)
    expect(kill).not.toHaveBeenCalled()
  })
})
