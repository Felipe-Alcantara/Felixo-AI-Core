// Repartição do espaço entre as superfícies fixas do canvas.
//
// A sidebar (trilho de atividades + navegação) ancora na esquerda; o painel
// de ferramenta abre ao lado dela, também na esquerda. A gaveta do terminal e
// o inspector "Elementos" ancoram na direita — o inspector é permanente
// (largura fixa, `TerminalsPanel.tsx`), a gaveta só existe com um terminal
// expandido. Cada um era dimensionado sem saber da existência dos outros,
// então eles se cobriam: medido em 1320x738, com o painel de prompts aberto,
// o painel invadia o Mini Map (188x104 px) e o dock antigo (306x53 px), e
// escapava da gaveta por 35 px — que sumiam ao primeiro arrasto.
//
// Aqui mora a conta, em funções puras: quem está na esquerda e quem está na
// direita disputam a mesma largura, e o que sobra é o canvas. Nenhuma
// superfície some para caber; todas encolhem até um piso, e é o piso que
// impede o arrasto de continuar — exceto o Mini Map, que pode sumir.

/** Faixa de canvas que continua visível por baixo de tudo. */
export const MIN_CANVAS_STRIP = 160
export const COLLAPSED_SURFACE_WIDTH = 44
/** Pisos compartilhados por painel, gaveta e os cálculos de ocupação. */
export const PANEL_MIN_WIDTH = 260
export const DRAWER_MIN_WIDTH = 440
// Nomes antigos continuam exportados para consumidores/testes que ainda usam
// a nomenclatura anterior; há uma única fonte numérica acima.
export const MIN_PANEL_WIDTH = PANEL_MIN_WIDTH
export const MIN_DRAWER_WIDTH = DRAWER_MIN_WIDTH
const MIN_PANEL_HEIGHT = 304
const MIN_DRAWER_HEIGHT = 200

/**
 * Largura da sidebar (trilho de atividades + navegação), expandida e
 * recolhida — mesmos números de `.felixo-workbench-sidebar` em index.css
 * (18rem / 3.25rem). Único lugar que os declara; `CanvasView.tsx` e
 * `toolbar-flyout.ts` importam daqui em vez de repetir o par.
 */
export const SIDEBAR_WIDTH = 288
export const SIDEBAR_RAIL_WIDTH = 52
/**
 * Faixa em que a pessoa pode arrastar a sidebar expandida. O piso mantém os
 * rótulos das seções legíveis; o teto é só um freio de sanidade — o limite
 * real, por tela, sai de `sidebarWidthLimit`.
 */
export const SIDEBAR_MIN_WIDTH = 240
export const SIDEBAR_MAX_WIDTH = 560

/**
 * Largura do inspector "Elementos", sempre visível à direita — mesmo número
 * de `w-72` em `TerminalsPanel.tsx`. Recolhido ele vira um puck flutuante que
 * não reserva espaço nenhum (0).
 */
export const INSPECTOR_WIDTH = 288

export type SurfaceOccupancy = {
  /** Largura da sidebar, com a margem dela. */
  toolbar: number
  /** Largura do painel de ferramenta aberto; zero quando não há nenhum. */
  panel: number
  /** Largura da gaveta do terminal; zero quando ela está fechada. */
  drawer: number
  /** Largura do inspector "Elementos"; zero quando está recolhido no puck. */
  inspector: number
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
  { toolbar, drawer, inspector }: Pick<SurfaceOccupancy, 'toolbar' | 'drawer' | 'inspector'>,
  minimum: number,
): number {
  return availableWidth(viewportWidth, toolbar + drawer + inspector, minimum)
}

/**
 * Até onde a sidebar expandida pode ser arrastada nesta tela.
 *
 * Reserva o inspector inteiro, um painel de ferramenta no piso e a faixa
 * mínima de canvas — a gaveta fica de fora de propósito: ela só existe com
 * um terminal expandido e já encolhe sozinha (`splitHorizontalSpace`).
 */
export function sidebarWidthLimit(viewportWidth: number): number {
  const reserved = INSPECTOR_WIDTH + PANEL_MIN_WIDTH + MIN_CANVAS_STRIP
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, viewportWidth - reserved))
}

/** Quanto a gaveta da direita pode ocupar, dado o que está na esquerda. */
export function drawerWidthLimit(
  viewportWidth: number,
  { toolbar, panel, inspector }: Pick<SurfaceOccupancy, 'toolbar' | 'panel' | 'inspector'>,
  minimum: number,
): number {
  return availableWidth(viewportWidth, toolbar + panel + inspector, minimum)
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
  inspectorWidth = 0,
): { panel: number; drawer: number } {
  const available = Math.max(0, viewportWidth - toolbarWidth - inspectorWidth - minCanvas)

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
 * nenhuma. É dela que sai o tamanho do Mini Map, que ancora à direita e por
 * isso é o primeiro a ser coberto quando o painel da esquerda cresce.
 */
export function freeCanvasArea(
  viewport: { width: number; height: number },
  occupancy: SurfaceOccupancy,
): { left: number; width: number; height: number } {
  const left = occupancy.toolbar + occupancy.panel

  return {
    left,
    width: Math.max(0, viewport.width - left - occupancy.drawer - occupancy.inspector),
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

/** Altura real ocupada pelo dock "Elementos" sobre a base do canvas. */
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

/**
 * Texto para anunciar quando as superfícies abertas já não cabem nos pisos
 * acessíveis. O mapa pode desaparecer; painel, terminal e faixa de canvas
 * precisam continuar com uma saída clara para a pessoa.
 */
export function canvasSurfaceLayoutWarning(
  viewport: { width: number; height: number },
  occupancy: SurfaceOccupancy,
): string | null {
  const panelExpanded = occupancy.panel > COLLAPSED_SURFACE_WIDTH
  const drawerExpanded = occupancy.drawer > COLLAPSED_SURFACE_WIDTH

  if (!panelExpanded && !drawerExpanded) return null

  const requiredWidth =
    occupancy.toolbar +
    (panelExpanded ? MIN_PANEL_WIDTH : occupancy.panel) +
    (drawerExpanded ? MIN_DRAWER_WIDTH : occupancy.drawer) +
    occupancy.inspector +
    MIN_CANVAS_STRIP

  if (viewport.width < requiredWidth) {
    return 'Pouco espaço horizontal: recolha o painel ou o terminal, ou aumente a janela para manter as superfícies acessíveis.'
  }

  const requiredHeight = Math.max(
    panelExpanded ? MIN_PANEL_HEIGHT : 0,
    drawerExpanded ? MIN_DRAWER_HEIGHT : 0,
  )
  if (viewport.height < requiredHeight) {
    return 'Pouco espaço vertical: role o conteúdo do painel ou aumente a altura da janela para acessar todas as ações.'
  }

  return null
}
