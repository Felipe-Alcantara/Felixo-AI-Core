import { describe, expect, it } from 'vitest'
import {
  MIN_CANVAS_STRIP,
  dockReservedBottom,
  drawerWidthLimit,
  freeCanvasArea,
  miniMapSize,
  panelWidthLimit,
  splitHorizontalSpace,
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

describe('divisão de uma vez só entre painel e gaveta (splitHorizontalSpace)', () => {
  // Bug real reportado em 12/09/2026: "painéis conflitando com o terminal,
  // os dois ficam em looping se mexendo". `panelWidthLimit`/`drawerWidthLimit`
  // usados em duas mãos (cada lado lendo o valor JÁ CORTADO do outro, via
  // relato assíncrono num contexto compartilhado) formam uma referência
  // circular: provado com os mesmos números abaixo que isso pode alternar
  // entre dois valores PARA SEMPRE, nunca convergir. `splitHorizontalSpace`
  // calcula os dois de uma vez só, a partir só do que cada um QUER — sem
  // referência circular possível.
  it('nunca oscila: a mesma entrada sempre devolve a mesma saída (determinístico)', () => {
    const resultado1 = splitHorizontalSpace(900, 176, 380, 260, 700, 440)
    const resultado2 = splitHorizontalSpace(900, 176, 380, 260, 700, 440)

    expect(resultado1).toEqual(resultado2)
  })

  it('cabendo os dois inteiros, cada um recebe exatamente o que pediu', () => {
    expect(splitHorizontalSpace(1400, 176, 360, 260, 440, 440)).toEqual({
      panel: 360,
      drawer: 440,
    })
  })

  it('nem os dois pisos juntos cabem: sobreposição intencional, cada um no próprio piso', () => {
    // O cenário real medido ao vivo: painel `xl` (quer ~360px) + gaveta numa
    // janela de 900px. A gaveta nunca relata abaixo do próprio piso (440) —
    // `clampDrawerWidth` já garante isso antes do relato, mesmo quando a
    // fração de 45% da tela (405px aqui) ficaria menor. Piso do painel (260)
    // + piso da gaveta (440) = 700, e só sobram 564px (900-176-160) — nem os
    // pisos cabem os dois juntos.
    expect(splitHorizontalSpace(900, 176, 360, 260, 440, 440)).toEqual({
      panel: 260,
      drawer: 440,
    })
  })

  it('pisos cabem mas os dois inteiros não: divide o extra proporcionalmente ao que cada um pediu', () => {
    const resultado = splitHorizontalSpace(900, 176, 380, 260, 700, 300)

    expect(resultado.panel + resultado.drawer).toBeLessThanOrEqual(900 - 176 - MIN_CANVAS_STRIP)
    expect(resultado.panel).toBeGreaterThanOrEqual(260)
    expect(resultado.drawer).toBeGreaterThanOrEqual(300)
    // Quem pediu mais folga (gaveta: quer 400 a mais que o piso, painel só
    // 120) cede proporcionalmente mais do que faltou.
    expect(resultado.drawer - 300).toBeGreaterThan(resultado.panel - 260)
  })

  it('gaveta recolhida (pede menos que o próprio piso) não força o piso dela sobre o painel', () => {
    // A gaveta colapsada (44px, um trilho) é uma escolha explícita, não uma
    // superfície espremida — não deve reservar os 440px do piso "normal"
    // dela às custas do painel.
    const resultado = splitHorizontalSpace(900, 176, 360, 260, 44, 440)

    expect(resultado.drawer).toBe(44)
    expect(resultado.panel).toBe(360)
  })

  it('painel fechado: gaveta usa tudo que quiser, até o disponível', () => {
    expect(splitHorizontalSpace(900, 176, 0, 260, 2000, 440)).toEqual({
      panel: 0,
      drawer: 900 - 176 - MIN_CANVAS_STRIP,
    })
  })

  it('gaveta fechada: painel usa tudo que quiser, até o disponível', () => {
    expect(splitHorizontalSpace(900, 176, 2000, 260, 0, 440)).toEqual({
      panel: 900 - 176 - MIN_CANVAS_STRIP,
      drawer: 0,
    })
  })
})

describe('reserva de rodapé do dock "Elementos"', () => {
  // Bug real confirmado numa captura de tela em 760px de largura: um node
  // recém-criado nascia atrás do dock porque só 40px fixos eram reservados,
  // não a altura real dele.
  it('reserva a altura real do dock, medida do topo dele até o fim do container', () => {
    expect(dockReservedBottom(700, 580)).toBe(120)
  })

  it('nunca reserva negativo quando o dock mediu abaixo do fim do container', () => {
    expect(dockReservedBottom(700, 750)).toBe(0)
  })

  it('sem medida real (dockTop infinito, dock nunca reportou ou está colapsado), reserva zero', () => {
    // Melhor não reservar nada do que reservar um número inventado — o dock
    // colapsado praticamente não ocupa espaço mesmo.
    expect(dockReservedBottom(700, Number.POSITIVE_INFINITY)).toBe(0)
  })
})
