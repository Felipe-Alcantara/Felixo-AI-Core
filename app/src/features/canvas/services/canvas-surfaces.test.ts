import { describe, expect, it } from 'vitest'
import {
  MIN_CANVAS_STRIP,
  drawerWidthLimit,
  freeCanvasArea,
  miniMapSize,
  panelWidthLimit,
} from './canvas-surfaces'

/** Notebook do relato: viewport útil de 1320x738. */
const LARGURA = 1320
/** Coluna da barra de ferramentas com as margens. */
const BARRA = 176
const MIN_PAINEL = 260
const MIN_GAVETA = 440

describe('painel e gaveta dividem a largura', () => {
  it('o painel encolhe quando a gaveta está aberta', () => {
    const semGaveta = panelWidthLimit(
      LARGURA,
      { toolbar: BARRA, drawer: 0 },
      MIN_PAINEL,
    )
    const comGaveta = panelWidthLimit(
      LARGURA,
      { toolbar: BARRA, drawer: 585 },
      MIN_PAINEL,
    )

    expect(comGaveta).toBeLessThan(semGaveta)
    // O que era 528 de largura padrão não cabe mais com a gaveta aberta.
    expect(comGaveta).toBe(LARGURA - BARRA - 585 - MIN_CANVAS_STRIP)
  })

  it('a gaveta encolhe quando o painel está aberto', () => {
    const comPainel = drawerWidthLimit(
      LARGURA,
      { toolbar: BARRA, panel: 528 },
      MIN_GAVETA,
    )

    expect(comPainel).toBe(LARGURA - BARRA - 528 - MIN_CANVAS_STRIP)
  })

  it('somados, os dois nunca passam da tela', () => {
    const painel = panelWidthLimit(LARGURA, { toolbar: BARRA, drawer: 585 }, MIN_PAINEL)
    const gaveta = drawerWidthLimit(LARGURA, { toolbar: BARRA, panel: painel }, MIN_GAVETA)

    expect(BARRA + painel + gaveta).toBeLessThanOrEqual(LARGURA)
  })

  it('devolve o piso quando nem o piso caberia, em vez de um painel inútil', () => {
    // Tela estreita: espremer abaixo do mínimo daria um painel de poucos
    // pixels, que não mostra nada. Aí a sobreposição é declarada, não um
    // painel ilegível.
    const painel = panelWidthLimit(700, { toolbar: BARRA, drawer: 585 }, MIN_PAINEL)

    expect(painel).toBe(MIN_PAINEL)
  })
})

describe('área livre do canvas', () => {
  it('desconta barra, painel e gaveta', () => {
    const area = freeCanvasArea(
      { width: LARGURA, height: 738 },
      { toolbar: BARRA, panel: 528, drawer: 0 },
    )

    expect(area.left).toBe(BARRA + 528)
    expect(area.width).toBe(LARGURA - BARRA - 528)
  })

  it('não fica negativa quando tudo somado passa da tela', () => {
    const area = freeCanvasArea(
      { width: 600, height: 738 },
      { toolbar: BARRA, panel: 400, drawer: 400 },
    )

    expect(area.width).toBe(0)
  })
})

describe('Mini Map', () => {
  it('mantém o tamanho quando há espaço', () => {
    expect(miniMapSize(616)).toEqual({ width: 200, height: 150 })
  })

  it('encolhe proporcionalmente quando o painel avança', () => {
    // Era isto que faltava: com o painel largo, o mapa ficava por baixo dele.
    const mapa = miniMapSize(180)

    expect(mapa).not.toBeNull()
    expect(mapa!.width).toBe(148)
    expect(mapa!.width / mapa!.height).toBeCloseTo(200 / 150, 1)
  })

  it('some quando nem o tamanho mínimo cabe', () => {
    expect(miniMapSize(100)).toBeNull()
    expect(miniMapSize(0)).toBeNull()
  })
})
