import { describe, expect, it } from 'vitest'
import {
  DIALOG_MIN_HEIGHT,
  DIALOG_MIN_WIDTH,
  DIALOG_VIEWPORT_MARGIN,
  clampDialogSize,
  clearDialogSize,
  readDialogSize,
  resizeCentered,
  swallowNextClick,
  writeDialogSize,
} from './dialog-sizing'

const both = { horizontal: true, vertical: true }

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

describe('clampDialogSize', () => {
  it('em qualquer janela o resultado cabe na janela com folga e respeita o piso quando cabe', () => {
    for (const vw of [200, 320, 360, 800, 1366, 1920, 3840]) {
      for (const vh of [150, 240, 480, 768, 1080]) {
        for (const w of [-50, 0, 10, 500, 5000]) {
          for (const h of [-50, 0, 10, 400, 5000]) {
            const r = clampDialogSize({ width: w, height: h }, { width: vw, height: vh })
            expect(r.width).toBeLessThanOrEqual(Math.max(0, vw - 2 * DIALOG_VIEWPORT_MARGIN))
            expect(r.height).toBeLessThanOrEqual(Math.max(0, vh - 2 * DIALOG_VIEWPORT_MARGIN))
            expect(r.width).toBeGreaterThanOrEqual(Math.min(DIALOG_MIN_WIDTH, vw - 2 * DIALOG_VIEWPORT_MARGIN))
            expect(r.height).toBeGreaterThanOrEqual(Math.min(DIALOG_MIN_HEIGHT, vh - 2 * DIALOG_VIEWPORT_MARGIN))
          }
        }
      }
    }
  })
  it('não mexe em um tamanho já válido', () => {
    expect(clampDialogSize({ width: 700, height: 500 }, { width: 1366, height: 768 })).toEqual({ width: 700, height: 500 })
  })
})

describe('resizeCentered', () => {
  const vp = { width: 1366, height: 768 }
  it('a borda arrastada acompanha o ponteiro: dx vira 2·dx de largura', () => {
    expect(resizeCentered({ width: 600, height: 400 }, { dx: 50, dy: 0 }, both, vp)).toEqual({ width: 700, height: 400 })
    expect(resizeCentered({ width: 600, height: 400 }, { dx: 0, dy: -30 }, both, vp)).toEqual({ width: 600, height: 340 })
  })
  it('só o eixo pedido muda', () => {
    expect(resizeCentered({ width: 600, height: 400 }, { dx: 50, dy: 50 }, { horizontal: true, vertical: false }, vp)).toEqual({ width: 700, height: 400 })
    expect(resizeCentered({ width: 600, height: 400 }, { dx: 50, dy: 50 }, { horizontal: false, vertical: true }, vp)).toEqual({ width: 600, height: 500 })
  })
  it('arrastar para longe para no limite da janela e encolher para no piso', () => {
    expect(resizeCentered({ width: 600, height: 400 }, { dx: 9999, dy: 9999 }, both, vp)).toEqual({ width: 1334, height: 736 })
    expect(resizeCentered({ width: 600, height: 400 }, { dx: -9999, dy: -9999 }, both, vp)).toEqual({ width: DIALOG_MIN_WIDTH, height: DIALOG_MIN_HEIGHT })
  })
})

describe('persistência', () => {
  const vp = { width: 1366, height: 768 }
  it('ida e volta, com valor trazido para a janela atual', () => {
    const s = memoryStorage()
    expect(readDialogSize(s, 'notes', vp)).toBeNull()
    writeDialogSize(s, 'notes', { width: 900.4, height: 500 })
    expect(readDialogSize(s, 'notes', vp)).toEqual({ width: 900, height: 500 })
    expect(readDialogSize(s, 'notes', { width: 600, height: 400 })).toEqual({ width: 568, height: 368 })
    clearDialogSize(s, 'notes')
    expect(readDialogSize(s, 'notes', vp)).toBeNull()
  })
  it('lixo salvo vira "nunca ajustado"', () => {
    for (const raw of ['x', 'null', '3', '{}', '{"width":"a","height":2}', '{"width":-1,"height":100}']) {
      expect(readDialogSize(memoryStorage({ 'felixo:dialog-size:d': raw }), 'd', vp), raw).toBeNull()
    }
  })
  it('armazenamento que lança não quebra nada', () => {
    const quebrado = {
      getItem: () => { throw new Error('x') },
      setItem: () => { throw new Error('x') },
      removeItem: () => { throw new Error('x') },
    }
    expect(readDialogSize(quebrado, 'd', vp)).toBeNull()
    expect(() => writeDialogSize(quebrado, 'd', { width: 1, height: 1 })).not.toThrow()
    expect(() => clearDialogSize(quebrado, 'd')).not.toThrow()
  })
})

describe('swallowNextClick — soltar o mouse fora do modal não pode fechá-lo', () => {
  function fakeTarget() {
    const listeners: Array<(e: Event) => void> = []
    return {
      listeners,
      addEventListener: (_t: string, fn: (e: Event) => void) => void listeners.push(fn),
      removeEventListener: (_t: string, fn: (e: Event) => void) => {
        const i = listeners.indexOf(fn)
        if (i >= 0) listeners.splice(i, 1)
      },
    }
  }
  const fakeEvent = () => {
    const calls = { stop: 0, prevent: 0 }
    return { calls, event: { stopPropagation: () => calls.stop++, preventDefault: () => calls.prevent++ } as unknown as Event }
  }
  it('engole exatamente um clique e se desarma', () => {
    const t = fakeTarget()
    swallowNextClick(t as never, () => 0, () => undefined)
    const a = fakeEvent()
    t.listeners[0](a.event)
    expect(a.calls).toEqual({ stop: 1, prevent: 1 })
    expect(t.listeners).toHaveLength(0)
  })
  it('sem clique, some sozinho depois da janela de tempo', () => {
    const t = fakeTarget()
    let due: (() => void) | undefined
    swallowNextClick(t as never, (fn) => { due = fn }, () => undefined)
    expect(t.listeners).toHaveLength(1)
    due?.()
    expect(t.listeners).toHaveLength(0)
  })
})
