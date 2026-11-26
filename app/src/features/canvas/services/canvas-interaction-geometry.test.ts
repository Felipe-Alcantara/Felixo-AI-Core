import { describe, expect, it } from 'vitest'
import {
  CANVAS_STATUSBAR_HEIGHT,
  CANVAS_TOPBAR_HEIGHT,
  fitZoomForSafeArea,
  flowCenterForSafeArea,
  getCanvasSafeArea,
  safeViewportOffset,
  screenRectsOverlap,
  MIN_SAFE_AREA_SIDE,
  viewportForSafeArea,
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

  it('enquadra bounds largos dentro da faixa livre, inclusive nas laterais', () => {
    const safe = getCanvasSafeArea(viewport, {
      toolbar: 288,
      panel: 0,
      drawer: 0,
      inspector: 288,
    })
    const fitted = viewportForSafeArea(
      { x: 0, y: 0, width: 1800, height: 1720 },
      viewport,
      safe,
      { padding: 0.15, minZoom: 0.05, maxZoom: 2 },
    )

    expect(fitted).toBeDefined()
    const result = fitted as NonNullable<typeof fitted>
    const left = viewport.left + result.x
    const top = viewport.top + result.y
    const right = left + 1800 * result.zoom
    const bottom = top + 1720 * result.zoom

    expect(left).toBeGreaterThanOrEqual(safe.left)
    expect(top).toBeGreaterThanOrEqual(safe.top)
    expect(right).toBeLessThanOrEqual(safe.right)
    expect(bottom).toBeLessThanOrEqual(safe.bottom)
  })

  it('recusa bounds vazios ou faixa sem largura', () => {
    expect(
      viewportForSafeArea(
        { x: 0, y: 0, width: 0, height: 100 },
        viewport,
        getCanvasSafeArea(viewport, { toolbar: 0, panel: 0, drawer: 0, inspector: 0 }),
      ),
    ).toBeUndefined()
    expect(
      viewportForSafeArea(
        { x: 0, y: 0, width: 100, height: 100 },
        viewport,
        { left: 320, top: 48, right: 320, bottom: 708 },
      ),
    ).toBeUndefined()
  })

  it('uma fresta de área útil não vale: janela de 320 px com sidebar recolhida e inspector aberto cai no fitView comum', () => {
    const grafo = { x: 0, y: 0, width: 1800, height: 1100 }
    // Rail de 52 px à esquerda e inspector a partir de 53 px: sobra 1 px de largura.
    const fresta = { left: 52, top: 48, right: 53, bottom: 700 }
    expect(viewportForSafeArea(grafo, viewport, fresta)).toBeUndefined()
    // Logo abaixo do piso também não vale; no piso passa a valer.
    expect(viewportForSafeArea(grafo, viewport, { left: 52, top: 48, right: 52 + MIN_SAFE_AREA_SIDE - 1, bottom: 700 })).toBeUndefined()
    expect(viewportForSafeArea(grafo, viewport, { left: 52, top: 48, right: 52 + MIN_SAFE_AREA_SIDE, bottom: 700 })).toBeDefined()
    // Altura pequena demais também.
    expect(viewportForSafeArea(grafo, viewport, { left: 52, top: 48, right: 400, bottom: 48 + MIN_SAFE_AREA_SIDE - 1 })).toBeUndefined()
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

describe('fitZoomForSafeArea', () => {
  const pagina = { width: 560, height: 420 }

  it('em janela grande devolve o zoom preferido, sem mudar nada', () => {
    expect(fitZoomForSafeArea(pagina, { width: 1280, height: 660 }, 1.2)).toBe(1.2)
    expect(fitZoomForSafeArea(pagina, { width: 1280, height: 660 }, 0.9)).toBe(0.9)
  })

  it('na janela de 1008x655 com a lista Elementos aberta, reduz o zoom até o bloco caber', () => {
    // ~432 px de largura livre e ~560 de altura: a largura manda.
    const zoom = fitZoomForSafeArea(pagina, { width: 432, height: 560 }, 1.2)
    expect(zoom).toBeLessThan(1.2)
    expect(pagina.width * zoom).toBeLessThanOrEqual(432 - 2 * 24)
    expect(pagina.height * zoom).toBeLessThanOrEqual(560 - 2 * 24)
  })

  it('nunca desce abaixo do mínimo legível, mesmo que o bloco não caiba', () => {
    expect(fitZoomForSafeArea(pagina, { width: 200, height: 200 }, 1.2)).toBe(0.5)
    expect(fitZoomForSafeArea(pagina, { width: 200, height: 200 }, 1.2, { minimum: 0.4 })).toBe(0.4)
  })

  it('o mínimo nunca empurra o zoom para cima do preferido', () => {
    expect(fitZoomForSafeArea(pagina, { width: 200, height: 200 }, 0.3)).toBe(0.3)
  })

  it('com medida inválida (área ou bloco sem tamanho) mantém o preferido', () => {
    expect(fitZoomForSafeArea(pagina, { width: 0, height: 0 }, 1.2)).toBe(1.2)
    expect(fitZoomForSafeArea({ width: 0, height: 0 }, { width: 400, height: 400 }, 0.9)).toBe(0.9)
    expect(fitZoomForSafeArea(pagina, { width: 30, height: 600 }, 1.2)).toBe(1.2)
  })
})
