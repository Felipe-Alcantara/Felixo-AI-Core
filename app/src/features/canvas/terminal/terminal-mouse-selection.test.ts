import { describe, expect, it } from 'vitest'
import {
  buildForcedSelectionEventInit,
  isMacPlatform,
  shouldForceMouseSelection,
  xtermAlreadyForcesSelection,
} from './terminal-mouse-selection'

function mouseEvent(init: Partial<MouseEvent> = {}) {
  return {
    type: 'mousedown',
    button: 0,
    isTrusted: true,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    detail: 1,
    screenX: 10,
    screenY: 20,
    clientX: 30,
    clientY: 40,
    buttons: 1,
    view: null,
    relatedTarget: null,
    ...init,
  } as MouseEvent
}

describe('isMacPlatform', () => {
  it('lê userAgentData quando disponível', () => {
    expect(isMacPlatform({ platform: 'Win32', userAgentData: { platform: 'macOS' } })).toBe(true)
    expect(isMacPlatform({ platform: 'MacIntel', userAgentData: { platform: 'Windows' } })).toBe(false)
  })

  it('cai para navigator.platform sem userAgentData', () => {
    expect(isMacPlatform({ platform: 'MacIntel' })).toBe(true)
    expect(isMacPlatform({ platform: 'Linux x86_64' })).toBe(false)
  })

  it('string vazia (sem nenhuma das duas fontes) não é macOS', () => {
    expect(isMacPlatform({ platform: '' })).toBe(false)
  })
})

describe('xtermAlreadyForcesSelection', () => {
  it('fora do macOS, é o Shift que já força seleção no xterm.js', () => {
    expect(xtermAlreadyForcesSelection({ shiftKey: true, altKey: false }, false)).toBe(true)
    expect(xtermAlreadyForcesSelection({ shiftKey: false, altKey: true }, false)).toBe(false)
  })

  it('no macOS, é o Option (altKey) — Shift não vale', () => {
    expect(xtermAlreadyForcesSelection({ shiftKey: false, altKey: true }, true)).toBe(true)
    expect(xtermAlreadyForcesSelection({ shiftKey: true, altKey: false }, true)).toBe(false)
  })
})

describe('shouldForceMouseSelection', () => {
  it('intercepta um mousedown real de botão primário quando o mouse tracking está ligado', () => {
    expect(shouldForceMouseSelection(mouseEvent(), true)).toBe(true)
  })

  it('não intercepta nada quando o mouse tracking está desligado', () => {
    // Regressão medida em 25/08/2026: forçar Shift num shell puro (tracking
    // desligado, seleção já normal) cai em "estender seleção existente"
    // (_handleIncrementalClick), que sem âncora prévia não seleciona nada — o
    // primeiro clique-arrastar comum deixaria de funcionar.
    expect(shouldForceMouseSelection(mouseEvent(), false)).toBe(false)
  })

  it('ignora o evento sintético que este próprio módulo cria — sem isso, laço infinito', () => {
    expect(shouldForceMouseSelection(mouseEvent({ isTrusted: false }), true)).toBe(false)
  })

  it('ignora botão direito e do meio: menu de contexto e colar do X11 continuam intactos', () => {
    expect(shouldForceMouseSelection(mouseEvent({ button: 1 }), true)).toBe(false)
    expect(shouldForceMouseSelection(mouseEvent({ button: 2 }), true)).toBe(false)
  })

  it('ignora outros tipos de evento de mouse', () => {
    expect(shouldForceMouseSelection(mouseEvent({ type: 'mouseup' }), true)).toBe(false)
    expect(shouldForceMouseSelection(mouseEvent({ type: 'click' }), true)).toBe(false)
  })
})

describe('buildForcedSelectionEventInit', () => {
  it('fora do macOS, liga shiftKey e preserva o altKey real da pessoa', () => {
    const init = buildForcedSelectionEventInit(mouseEvent({ altKey: true, ctrlKey: true }), false)

    expect(init.shiftKey).toBe(true)
    expect(init.altKey).toBe(true)
    expect(init.ctrlKey).toBe(true)
  })

  it('no macOS, liga altKey e preserva o shiftKey real da pessoa', () => {
    const init = buildForcedSelectionEventInit(mouseEvent({ shiftKey: true, metaKey: true }), true)

    expect(init.altKey).toBe(true)
    expect(init.shiftKey).toBe(true)
    expect(init.metaKey).toBe(true)
  })

  it('preserva coordenadas e botão do evento original', () => {
    const original = mouseEvent({ clientX: 111, clientY: 222, detail: 2, button: 0, buttons: 1 })
    const init = buildForcedSelectionEventInit(original, false)

    expect(init.clientX).toBe(111)
    expect(init.clientY).toBe(222)
    expect(init.detail).toBe(2)
    expect(init.button).toBe(0)
    expect(init.buttons).toBe(1)
  })
})
