// Repartição do espaço entre as superfícies flutuantes do canvas.
//
// A barra de ferramentas e o painel de ferramenta ancoram na esquerda; a
// gaveta do terminal, o Mini Map e o dock "Elementos" ancoram na direita.
// Cada um era dimensionado sem saber da existência dos outros, então eles se
// cobriam: medido em 1320x738, com o painel de prompts aberto, o painel
// invadia o Mini Map (188x104 px) e o dock (306x53 px), e escapava da gaveta
// por 35 px — que sumiam ao primeiro arrasto.
//
// Aqui mora a conta, em funções puras: quem está na esquerda e quem está na
// direita disputam a mesma largura, e o que sobra é o canvas. Nenhuma
// superfície some para caber; todas encolhem até um piso, e é o piso que
// impede o arrasto de continuar.

/** Faixa de canvas que continua visível por baixo de tudo. */
export const MIN_CANVAS_STRIP = 160

export type SurfaceOccupancy = {
  /** Largura da coluna da barra de ferramentas, com a margem dela. */
  toolbar: number
  /** Largura do painel de ferramenta aberto; zero quando não há nenhum. */
  panel: number
  /** Largura da gaveta do terminal; zero quando ela está fechada. */
  drawer: number
}

/**
 * Largura que sobra para uma superfície, descontando o que as outras ocupam.
 *
 * O `minimo` é devolvido mesmo quando não cabe: espremer abaixo dele deixaria
 * a superfície inútil, e nesse caso é melhor a sobreposição declarada de um
 * piso do que um painel de 40 px que não mostra nada.
 */
export function availableWidth(
  viewportWidth: number,
  occupied: number,
  minimum: number,
  minCanvas = MIN_CANVAS_STRIP,
): number {
  return Math.max(minimum, viewportWidth - occupied - minCanvas)
}

/** Quanto o painel da esquerda pode ocupar, dado o que está na direita. */
export function panelWidthLimit(
  viewportWidth: number,
  { toolbar, drawer }: Pick<SurfaceOccupancy, 'toolbar' | 'drawer'>,
  minimum: number,
): number {
  return availableWidth(viewportWidth, toolbar + drawer, minimum)
}

/** Quanto a gaveta da direita pode ocupar, dado o que está na esquerda. */
export function drawerWidthLimit(
  viewportWidth: number,
  { toolbar, panel }: Pick<SurfaceOccupancy, 'toolbar' | 'panel'>,
  minimum: number,
): number {
  return availableWidth(viewportWidth, toolbar + panel, minimum)
}

/**
 * A área livre do canvas: o retângulo que não está debaixo de superfície
 * nenhuma. É dela que saem o tamanho do Mini Map e a largura do dock, que
 * ancoram à direita e por isso são os primeiros a serem cobertos quando o
 * painel da esquerda cresce.
 */
export function freeCanvasArea(
  viewport: { width: number; height: number },
  occupancy: SurfaceOccupancy,
): { left: number; width: number; height: number } {
  const left = occupancy.toolbar + occupancy.panel

  return {
    left,
    width: Math.max(0, viewport.width - left - occupancy.drawer),
    height: viewport.height,
  }
}

/**
 * Tamanho do Mini Map para a largura livre atual.
 *
 * Ele encolhe em vez de sumir — é um mapa, e um mapa menor continua sendo um
 * mapa — mas para de encolher num piso, abaixo do qual não dá para reconhecer
 * bloco nenhum. Sem largura livre suficiente nem o piso cabe, e aí ele sai da
 * tela: é a única superfície que pode sumir, porque é a única cuja ausência
 * não impede nenhuma ação.
 */
const MINIMAP_DEFAULT = { width: 200, height: 150 }
const MINIMAP_MIN = { width: 96, height: 72 }
const MINIMAP_MARGIN = 32

export function miniMapSize(
  freeWidth: number,
): { width: number; height: number } | null {
  const available = freeWidth - MINIMAP_MARGIN

  if (available < MINIMAP_MIN.width) {
    return null
  }

  const width = Math.min(MINIMAP_DEFAULT.width, available)
  const scale = width / MINIMAP_DEFAULT.width

  return {
    width: Math.round(width),
    height: Math.max(
      MINIMAP_MIN.height,
      Math.round(MINIMAP_DEFAULT.height * scale),
    ),
  }
}
