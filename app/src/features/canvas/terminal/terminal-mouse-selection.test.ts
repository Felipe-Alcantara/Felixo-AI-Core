import { describe, expect, it } from 'vitest'
import {
  buildForcedSelectionEventInit,
  buildReplayEventInit,
  DRAG_THRESHOLD_PX,
  exceedsDragThreshold,
  isMacPlatform,
  shouldDeferMouseDown,
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

describe('shouldDeferMouseDown', () => {
  it('retém um mousedown real de botão primário quando o mouse tracking está ligado', () => {
    expect(shouldDeferMouseDown(mouseEvent(), true)).toBe(true)
  })

  it('não retém nada quando o mouse tracking está desligado', () => {
    // Regressão medida em 25/08/2026: forçar Shift num shell puro (tracking
    // desligado, seleção já normal) cai em "estender seleção existente"
    // (_handleIncrementalClick), que sem âncora prévia não seleciona nada — o
    // primeiro clique-arrastar comum deixaria de funcionar.
    expect(shouldDeferMouseDown(mouseEvent(), false)).toBe(false)
  })

  it('ignora os eventos sintéticos que este próprio módulo dispara — sem isso, laço infinito', () => {
    expect(shouldDeferMouseDown(mouseEvent({ isTrusted: false }), true)).toBe(false)
  })

  it('ignora botão direito e do meio: menu de contexto e colar do X11 continuam intactos', () => {
    expect(shouldDeferMouseDown(mouseEvent({ button: 1 }), true)).toBe(false)
    expect(shouldDeferMouseDown(mouseEvent({ button: 2 }), true)).toBe(false)
  })

  it('ignora outros tipos de evento de mouse', () => {
    expect(shouldDeferMouseDown(mouseEvent({ type: 'mouseup' }), true)).toBe(false)
    expect(shouldDeferMouseDown(mouseEvent({ type: 'click' }), true)).toBe(false)
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

describe('exceedsDragThreshold', () => {
  const origem = { clientX: 100, clientY: 100 }

  it('um clique parado não é arrasto — é o caso que devolve o clique à CLI', () => {
    expect(exceedsDragThreshold(origem, { clientX: 100, clientY: 100 })).toBe(false)
  })

  it('tremer a mão dentro do limiar continua sendo clique', () => {
    expect(exceedsDragThreshold(origem, { clientX: 102, clientY: 98 })).toBe(false)
  })

  it('passar do limiar em qualquer eixo, para qualquer lado, é arrasto', () => {
    expect(exceedsDragThreshold(origem, { clientX: 100 + DRAG_THRESHOLD_PX, clientY: 100 })).toBe(true)
    expect(exceedsDragThreshold(origem, { clientX: 100 - DRAG_THRESHOLD_PX, clientY: 100 })).toBe(true)
    expect(exceedsDragThreshold(origem, { clientX: 100, clientY: 100 + DRAG_THRESHOLD_PX })).toBe(true)
    expect(exceedsDragThreshold(origem, { clientX: 100, clientY: 100 - DRAG_THRESHOLD_PX })).toBe(true)
  })
})

describe('buildReplayEventInit', () => {
  it('não força modificador nenhum — é isto que faz o clique voltar a chegar na CLI', () => {
    // Regressão medida em 27/08/2026: o commit e2e55fc ligava shiftKey em todo
    // mousedown, e o xterm.js só chama `sendEvent` quando
    // `shouldForceSelection` é falso. Com o modificador ligado, o relatório de
    // mouse nunca saía e clicar numa opção da Claude Code não fazia nada.
    const init = buildReplayEventInit(mouseEvent())

    expect(init.shiftKey).toBe(false)
    expect(init.altKey).toBe(false)
  })

  it('preserva os modificadores que a pessoa realmente apertou', () => {
    const init = buildReplayEventInit(mouseEvent({ ctrlKey: true, metaKey: true, altKey: true }))

    expect(init.ctrlKey).toBe(true)
    expect(init.metaKey).toBe(true)
    expect(init.altKey).toBe(true)
  })

  it('preserva posição e botões, para o processo receber o clique onde ele foi dado', () => {
    const init = buildReplayEventInit(mouseEvent({ clientX: 77, clientY: 88, buttons: 0 }))

    expect(init.clientX).toBe(77)
    expect(init.clientY).toBe(88)
    expect(init.buttons).toBe(0)
  })
})
