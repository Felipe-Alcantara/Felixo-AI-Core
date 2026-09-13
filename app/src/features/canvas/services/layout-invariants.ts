// Contrato de "nunca sobrepor" do canvas — versão testável.
//
// `canvas-surfaces.ts` já resolve a divisão horizontal (sidebar + painel +
// gaveta + inspector). O que faltava era um lugar ÚNICO que junte tudo isso
// e o Mini Map, e vire uma bateria de asserções — em vez de cada componente
// confiar isoladamente que os números dos outros nunca vão colidir com os
// dele.
//
// Este módulo NÃO reimplementa o layout: importa as mesmas funções puras que
// os componentes reais usam (`canvas-surfaces.ts`) e só soma as invariantes
// que ainda não tinham um lugar comum.

import {
  DRAWER_MIN_WIDTH,
  INSPECTOR_WIDTH,
  MIN_CANVAS_STRIP,
  PANEL_MIN_WIDTH,
  SIDEBAR_WIDTH,
  drawerWidthLimit,
  freeCanvasArea,
  miniMapSize,
  panelWidthLimit,
  type SurfaceOccupancy,
} from './canvas-surfaces'

export { DRAWER_MIN_WIDTH, PANEL_MIN_WIDTH }

/** Largura da sidebar no pior caso plausível: sempre expandida (ver canvas-surfaces.ts). */
export const TOOLBAR_WIDTH = SIDEBAR_WIDTH

/** Trilho da gaveta recolhida: só os botões do cabeçalho, sem terminal. */
export const DRAWER_COLLAPSED_WIDTH = 44

/** Reserva do inspector "Elementos" no pior caso plausível: sempre expandido. */
export const INSPECTOR_RESERVED_WIDTH = INSPECTOR_WIDTH

/** Largura fixa e margem do dock "Elementos" no canto inferior direito. */
export const DOCK_WIDTH = 320
export const DOCK_CORNER_MARGIN = 16
export const DOCK_MAX_HEIGHT_FRACTION = 0.6
export const PANEL_TO_DOCK_GAP = 16
const MIN_USABLE_PANEL_HEIGHT = 160

export type LayoutViewport = { width: number; height: number }

export type LayoutInvariantViolation = {
  rule: string
  detail: string
}

/**
 * Pior caso plausível: sidebar + painel + gaveta + inspector, todos abertos
 * ao mesmo tempo. Se as invariantes seguram aqui, seguram em qualquer
 * combinação mais folgada.
 *
 * @param viewport Viewport útil (sem levar em conta zoom/DPR — ver limitação
 *   no corpo da task de origem).
 * @returns Violações encontradas; vazio quando o pior caso está seguro.
 */
export function checkWorstCaseLayout(viewport: LayoutViewport): LayoutInvariantViolation[] {
  const violations: LayoutInvariantViolation[] = []
  const { width: viewportWidth } = viewport

  // 1. Sidebar + painel + gaveta + inspector nunca passam da largura da
  //    tela — cada um encolhe até o piso (o inspector não encolhe: ou está
  //    na largura cheia, ou é um puck que não reserva nada — aqui entra
  //    sempre no seu pior caso, expandido), e a soma dos pisos é o limite
  //    físico.
  const panelWidth = panelWidthLimit(
    viewportWidth,
    {
      toolbar: TOOLBAR_WIDTH,
      drawer: getWorstCaseDrawerWidth(viewportWidth),
      inspector: INSPECTOR_RESERVED_WIDTH,
    },
    PANEL_MIN_WIDTH,
  )
  const drawerWidth = drawerWidthLimit(
    viewportWidth,
    { toolbar: TOOLBAR_WIDTH, panel: panelWidth, inspector: INSPECTOR_RESERVED_WIDTH },
    DRAWER_MIN_WIDTH,
  )
  const horizontalTotal = TOOLBAR_WIDTH + panelWidth + drawerWidth + INSPECTOR_RESERVED_WIDTH

  if (horizontalTotal > viewportWidth) {
    violations.push({
      rule: 'barra+painel+gaveta+inspector-cabem-na-largura',
      detail: `soma ${horizontalTotal}px passa da largura ${viewportWidth}px`,
    })
  }

  // 2. A área livre do canvas nunca fica negativa — vira zero, nunca menos
  //    (freeCanvasArea já clampa isso, mas a invariante trava a regressão).
  const occupancy: SurfaceOccupancy = {
    toolbar: TOOLBAR_WIDTH,
    panel: panelWidth,
    drawer: drawerWidth,
    inspector: INSPECTOR_RESERVED_WIDTH,
  }
  const free = freeCanvasArea(viewport, occupancy)

  if (free.width < 0) {
    violations.push({
      rule: 'area-livre-nunca-negativa',
      detail: `largura livre calculada como ${free.width}px`,
    })
  }

  // 3. O Mini Map, quando existe, cabe dentro da área livre — ele é a única
  //    superfície que pode sumir (miniMapSize devolve null), então "existir
  //    mas não caber" é sempre uma violação, nunca um estado válido.
  const minimap = miniMapSize(free.width)
  if (minimap && minimap.width > free.width) {
    violations.push({
      rule: 'minimap-cabe-na-area-livre',
      detail: `Mini Map de ${minimap.width}px em área livre de ${free.width}px`,
    })
  }

  const dockWidth = Math.min(DOCK_WIDTH, viewportWidth - DOCK_CORNER_MARGIN * 2)
  if (dockWidth + DOCK_CORNER_MARGIN * 2 > viewportWidth) {
    violations.push({
      rule: 'dock-cabe-na-largura',
      detail: `dock de ${dockWidth}px + margens passa de ${viewportWidth}px`,
    })
  }

  const dockHeight = Math.round(viewport.height * DOCK_MAX_HEIGHT_FRACTION)
  const dockTop = viewport.height - dockHeight
  const panelMaxHeight = dockTop - PANEL_TO_DOCK_GAP
  if (panelMaxHeight < MIN_USABLE_PANEL_HEIGHT) {
    violations.push({
      rule: 'painel-esquerdo-tem-altura-usavel-acima-do-dock',
      detail: `altura disponível ${panelMaxHeight}px, abaixo do piso ${MIN_USABLE_PANEL_HEIGHT}px`,
    })
  }

  return violations
}

/**
 * Largura da gaveta no pior caso: aberta e no máximo que
 * `terminal-drawer-pin.ts` permite para este viewport, nunca colapsada
 * (o trilho colapsado, 44px, é o MELHOR caso, não o pior).
 */
function getWorstCaseDrawerWidth(viewportWidth: number): number {
  const reserve = 200 // DRAWER_VIEWPORT_RESERVE, ver terminal-drawer-pin.ts
  return Math.max(DRAWER_COLLAPSED_WIDTH, viewportWidth - reserve)
}

/** Nenhuma violação encontrada. */
export function isWorstCaseLayoutSafe(viewport: LayoutViewport): boolean {
  return checkWorstCaseLayout(viewport).length === 0
}

/**
 * Abaixo desta largura, `panelWidthLimit`/`drawerWidthLimit` devolvem o piso
 * de cada superfície mesmo sem caber — por desenho (ver o comentário de
 * `availableWidth` em `canvas-surfaces.ts`): "é melhor a sobreposição
 * declarada de um piso do que um painel que não mostra nada". Painel de
 * ferramenta E gaveta do terminal abertos ao mesmo tempo abaixo deste
 * número são uma SOBREPOSIÇÃO INTENCIONAL, não uma violação — é o único
 * caso hoje em que `checkWorstCaseLayout` espera encontrar a regra
 * `barra+painel+gaveta+inspector-cabem-na-largura`.
 */
export const COMBINED_FLOOR_WIDTH =
  TOOLBAR_WIDTH + PANEL_MIN_WIDTH + DRAWER_MIN_WIDTH + INSPECTOR_RESERVED_WIDTH

/** Nunca é zero: abaixo disto o canvas não teria faixa visível nenhuma. */
export const MIN_GUARANTEED_CANVAS_STRIP = MIN_CANVAS_STRIP

export type LiveLayoutSnapshot = {
  viewport: LayoutViewport
  /** Larguras REAIS ocupadas agora — não o pior caso plausível. */
  occupancy: SurfaceOccupancy
  /** Topo real do dock; infinito quando ele está colapsado ou não medido. */
  dockTop?: number
}

/**
 * Diagnóstico do estado AO VIVO (não o pior caso hipotético de
 * `checkWorstCaseLayout`) — pra saber se o clamp que o código já faz
 * silenciosamente (painel/gaveta no piso) está acontecendo agora de
 * verdade, e por quê.
 *
 * Devolve no máximo UMA violação (a mais relevante) — é pra virar um evento
 * de log na transição, não uma lista de tudo que está no limite.
 */
export function detectLiveLayoutClamp({
  viewport,
  occupancy,
  dockTop = Number.POSITIVE_INFINITY,
}: LiveLayoutSnapshot): LayoutInvariantViolation | null {
  // Painel e gaveta abertos ao mesmo tempo, de verdade, ultrapassando a
  // largura disponível — a sobreposição intencional documentada em
  // COMBINED_FLOOR_WIDTH acontecendo agora, não hipoteticamente. Uma faixa
  // menor que o piso, por si só, não é clamp: pode ser uma composição válida
  // quando ainda existe espaço físico suficiente para os elementos.
  const horizontalTotal = occupancy.toolbar + occupancy.panel + occupancy.drawer + occupancy.inspector
  const canvasStrip = viewport.width - horizontalTotal
  if (occupancy.panel > 0 && occupancy.drawer > 0 && horizontalTotal > viewport.width) {
    return {
      rule:
        occupancy.inspector > 0 && horizontalTotal > viewport.width
          ? 'painel+gaveta-sobrepostos-de-verdade'
          : 'painel+gaveta-espremem-a-faixa-de-canvas',
      detail: `barra ${occupancy.toolbar}px + painel ${occupancy.panel}px + gaveta ${occupancy.drawer}px + inspector ${occupancy.inspector}px = ${horizontalTotal}px, sobrando ${canvasStrip}px de canvas (piso ${MIN_CANVAS_STRIP}px), viewport ${viewport.width}px`,
    }
  }

  // Painel esquerdo aberto e esticado até o dock, com o dock ocupando tanto
  // que sobra menos altura do que dá pra usar.
  if (occupancy.panel > 0 && Number.isFinite(dockTop)) {
    const panelMaxHeight = dockTop - PANEL_TO_DOCK_GAP
    if (panelMaxHeight < MIN_USABLE_PANEL_HEIGHT) {
      return {
        rule: 'painel-esquerdo-espremido-pelo-dock',
        detail: `altura disponível ${Math.round(panelMaxHeight)}px, abaixo do piso ${MIN_USABLE_PANEL_HEIGHT}px (dockTop=${Math.round(dockTop)}, viewport.height=${viewport.height})`,
      }
    }
  }

  return null
}
