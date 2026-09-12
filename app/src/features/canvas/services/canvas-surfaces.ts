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

/**
 * Pisos de largura do painel de ferramenta e da gaveta do terminal —
 * únicos, aqui, pra `CanvasSurfacesProvider.tsx` (que faz a divisão) e
 * `useResizablePanelWidth.ts`/`TerminalDrawer.tsx` (que liam cada um o seu
 * próprio piso local, sem garantia de bater com o que o outro lado achava
 * que o piso era) nunca mais divergirem silenciosamente.
 */
export const PANEL_MIN_WIDTH = 260
export const DRAWER_MIN_WIDTH = 440

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
 * Divide a largura disponível entre painel e gaveta NUMA PASSADA SÓ — dado
 * o que cada um quer (`desiredPanel`/`desiredDrawer`, sem corte nenhum) e o
 * piso de cada um, devolve os dois valores finais.
 *
 * Bug real encontrado em 12/09/2026, reportado como "painéis conflitando com
 * o terminal, os dois ficam em looping se mexendo": `panelWidthLimit` e
 * `drawerWidthLimit` cada um calcula o próprio teto lendo a largura JÁ
 * RELATADA do outro lado — e cada lado relata de volta o valor já cortado
 * pelo próprio teto. Isso é uma referência circular: painel encolhe porque a
 * gaveta cresceu, a gaveta recalcula o teto dela vendo o painel menor e
 * cresce mais, o painel vê a gaveta maior e encolhe mais — provado com
 * números reais que isso pode alternar entre dois valores PARA SEMPRE (nunca
 * converge), e medido ao vivo que mesmo quando não oscila de verdade, a
 * "faixa de canvas garantida" (`MIN_CANVAS_STRIP`) podia ficar espremida
 * bem abaixo do piso pretendido (32px medidos onde deveriam ser 160px).
 *
 * Esta função resolve os dois de uma vez, a partir só do que cada um QUER —
 * nunca do que o outro já tem relatado — então não existe referência
 * circular pra oscilar: é uma conta, não uma negociação entre dois efeitos.
 */
export function splitHorizontalSpace(
  viewportWidth: number,
  toolbarWidth: number,
  desiredPanel: number,
  minPanel: number,
  desiredDrawer: number,
  minDrawer: number,
  minCanvas = MIN_CANVAS_STRIP,
): { panel: number; drawer: number } {
  const available = Math.max(0, viewportWidth - toolbarWidth - minCanvas)

  if (desiredPanel <= 0) {
    return { panel: 0, drawer: Math.min(desiredDrawer, Math.max(minDrawer, available)) }
  }
  if (desiredDrawer <= 0) {
    return { panel: Math.min(desiredPanel, Math.max(minPanel, available)), drawer: 0 }
  }

  // Quem já pediu menos que o próprio piso "normal" (a gaveta recolhida a
  // um trilho de 44px, por exemplo) não está disputando espaço nenhum — é
  // uma escolha explícita, não uma superfície espremida. Devolve exatamente
  // o que foi pedido e deixa o resto pro outro lado, sem forçar o piso dele
  // numa superfície que nem quer aquele tamanho.
  if (desiredPanel < minPanel) {
    const finalPanel = Math.min(desiredPanel, available)
    return {
      panel: finalPanel,
      drawer: Math.min(desiredDrawer, Math.max(minDrawer, available - finalPanel)),
    }
  }
  if (desiredDrawer < minDrawer) {
    const finalDrawer = Math.min(desiredDrawer, available)
    return {
      panel: Math.min(desiredPanel, Math.max(minPanel, available - finalDrawer)),
      drawer: finalDrawer,
    }
  }

  // Nem os dois pisos juntos cabem: sobreposição intencional, cada um no
  // próprio piso — a mesma filosofia que `availableWidth` já documentava
  // pra um lado só, aplicada aos dois de uma vez em vez de descoberta aos
  // poucos por rodadas de relato.
  if (minPanel + minDrawer > available) {
    return { panel: minPanel, drawer: minDrawer }
  }

  const extraAvailable = available - minPanel - minDrawer
  const extraPanelWanted = Math.max(0, desiredPanel - minPanel)
  const extraDrawerWanted = Math.max(0, desiredDrawer - minDrawer)
  const totalExtraWanted = extraPanelWanted + extraDrawerWanted

  if (totalExtraWanted <= extraAvailable) {
    // Os dois cabem inteiros do jeito que pediram.
    return { panel: minPanel + extraPanelWanted, drawer: minDrawer + extraDrawerWanted }
  }

  // Não cabem os dois inteiros: divide o espaço extra proporcionalmente ao
  // que cada um pediu além do próprio piso — quem pediu mais folga cede
  // mais, mas nenhum dos dois é espremido abaixo do que já tinha garantido.
  const panelShare = Math.round(extraAvailable * (extraPanelWanted / totalExtraWanted))
  const drawerShare = extraAvailable - panelShare

  return { panel: minPanel + panelShare, drawer: minDrawer + drawerShare }
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

/**
 * Altura, em pixels de tela, que o dock "Elementos" ocupa por cima do
 * canvas agora — a partir do topo real dele (`dockTop`, medido via
 * `getBoundingClientRect`, nunca estimado) até o fim do container do canvas.
 *
 * Existe porque um node novo era posicionado com uma margem fixa de 40px de
 * rodapé (pensada pra quando o dock está vazio/colapsado): com vários
 * elementos, o dock cresce até 60vh de altura e o node nascia atrás dele —
 * sobreposição real, medida numa captura de tela em 760px de largura.
 * `dockTop = Infinity` (dock nunca mediu, ou está colapsado) devolve 0: sem
 * medida real, é mais seguro não reservar nada do que reservar demais.
 */
export function dockReservedBottom(
  containerBottom: number,
  dockTop: number,
): number {
  if (!Number.isFinite(dockTop)) {
    return 0
  }
  return Math.max(0, containerBottom - dockTop)
}

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
