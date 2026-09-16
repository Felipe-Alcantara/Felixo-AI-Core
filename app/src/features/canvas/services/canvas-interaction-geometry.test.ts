import { describe, expect, it } from 'vitest'
import {
  CANVAS_STATUSBAR_HEIGHT,
  CANVAS_TOPBAR_HEIGHT,
  flowCenterForSafeArea,
  getCanvasSafeArea,
  safeViewportOffset,
  screenRectsOverlap,
} from './canvas-interaction-geometry'

const viewport = { left: 0, top: 0, right: 1280, bottom: 738, width: 1280, height: 738 }

describe('área útil de interação do Canvas', () => {
  it('reserva o chrome fixo e evita o grupo no canto sob a sidebar', () => {
    const safe = getCanvasSafeArea(viewport, {
      toolbar: 288,
      panel: 0,
      drawer: 0,
      inspector: 288,
    })

    expect(safe).toEqual({
      left: 288,
      top: CANVAS_TOPBAR_HEIGHT,
      right: 992,
      bottom: 738 - CANVAS_STATUSBAR_HEIGHT,
      width: 704,
      height: 660,
    })
  })

  it('não desconta a gaveta duas vezes quando ela é irmã do flow container', () => {
    const safe = getCanvasSafeArea(
      { left: 0, top: 0, right: 840, bottom: 738 },
      { toolbar: 288, panel: 300, drawer: 440, inspector: 288 },
      { drawerOutsideContainer: true },
    )

    expect(safe.left).toBe(588)
    expect(safe.right).toBe(552)
    expect(safe.bottom).toBe(708)
    expect(safe.width).toBe(0)
  })

  it('desloca o alvo de foco para o centro assimétrico da área útil', () => {
    const safe = getCanvasSafeArea(viewport, {
      toolbar: 288,
      panel: 300,
      drawer: 0,
      inspector: 288,
    })
    const target = flowCenterForSafeArea(
      { x: 500, y: 400 },
      viewport,
      safe,
      1.2,
    )

    // O painel desloca o centro útil 150px para a direita e 9px para baixo.
    expect(target).toEqual({ x: 375, y: 392.5 })
  })

  it('produz o offset em pixels para corrigir Ver tudo depois do fit', () => {
    const safe = getCanvasSafeArea(viewport, {
      toolbar: 288,
      panel: 0,
      drawer: 0,
      inspector: 288,
    })

    expect(safeViewportOffset(viewport, safe)).toEqual({ x: 0, y: 9 })
  })

  it('considera oclusão somente quando há área compartilhada', () => {
    expect(
      screenRectsOverlap(
        { left: 100, top: 100, right: 300, bottom: 300 },
        { left: 300, top: 100, right: 420, bottom: 300 },
      ),
    ).toBe(false)
    expect(
      screenRectsOverlap(
        { left: 100, top: 100, right: 301, bottom: 300 },
        { left: 300, top: 100, right: 420, bottom: 300 },
      ),
    ).toBe(true)
  })
})
