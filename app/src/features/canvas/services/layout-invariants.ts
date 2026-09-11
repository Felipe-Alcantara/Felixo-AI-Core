// Contrato de "nunca sobrepor" do canvas — versão testável.
//
// `canvas-surfaces.ts` já resolve a divisão horizontal (barra + painel +
// gaveta) e `CanvasPanel.tsx` já clampa a altura do painel esquerdo contra o
// topo medido do dock (`dockTop`). O que faltava era um lugar ÚNICO que
// junte as duas coisas, mais o dock e o Mini Map, e vire uma bateria de
// asserções — em vez de cada componente confiar isoladamente que os números
// dos outros nunca vão colidir com os dele.
//
// Este módulo NÃO reimplementa o layout: importa as mesmas funções puras que
// os componentes reais usam (`canvas-surfaces.ts`) e só soma as invariantes
// que ainda não tinham um lugar comum — dock e Mini Map inclusos.

import {
  MIN_CANVAS_STRIP,
  drawerWidthLimit,
  freeCanvasArea,
  miniMapSize,
  panelWidthLimit,
  type SurfaceOccupancy,
} from './canvas-surfaces'

/** Largura da coluna da barra de ferramentas com a margem dela (ver CanvasView.tsx). */
export const TOOLBAR_WIDTH = 176

/**
 * Piso de largura do painel de ferramenta e da gaveta do terminal — os
 * mesmos usados hoje por `panel-sizing.ts` (`sm`) e `terminal-drawer-pin.ts`.
 */
export const PANEL_MIN_WIDTH = 260
export const DRAWER_MIN_WIDTH = 300
/** Trilho da gaveta recolhida: só os botões do cabeçalho, sem terminal. */
export const DRAWER_COLLAPSED_WIDTH = 44

/** Largura fixa do dock "Elementos" (`w-80` em TerminalsPanel.tsx) e sua margem do canto. */
export const DOCK_WIDTH = 320
export const DOCK_CORNER_MARGIN = 16
/** Altura máxima do dock, em fração do viewport (`max-h-[60vh]`). */
export const DOCK_MAX_HEIGHT_FRACTION = 0.6

/** Reservado entre o topo do painel esquerdo e o do dock (ver CanvasPanel.tsx). */
export const PANEL_TO_DOCK_GAP = 16

export type LayoutViewport = { width: number; height: number }

export type LayoutInvariantViolation = {
  rule: string
  detail: string
}

/**
 * Pior caso plausível: barra + painel + gaveta abertos ao mesmo tempo, dock
 * cheio de elementos (altura máxima), painel de ferramenta também esticado
 * até a altura máxima que o dock permite. Se as invariantes seguram aqui,
 * seguram em qualquer combinação mais folgada.
 *
 * @param viewport Viewport útil (sem levar em conta zoom/DPR — ver limitação
 *   no corpo da task de origem).
 * @returns Violações encontradas; vazio quando o pior caso está seguro.
 */
export function checkWorstCaseLayout(viewport: LayoutViewport): LayoutInvariantViolation[] {
  const violations: LayoutInvariantViolation[] = []
  const { width: viewportWidth, height: viewportHeight } = viewport

  // 1. Barra + painel + gaveta nunca passam da largura da tela — cada um
  //    encolhe até o piso, e a soma dos pisos é o limite físico.
  const panelWidth = panelWidthLimit(
    viewportWidth,
    { toolbar: TOOLBAR_WIDTH, drawer: getWorstCaseDrawerWidth(viewportWidth) },
    PANEL_MIN_WIDTH,
  )
  const drawerWidth = drawerWidthLimit(
    viewportWidth,
    { toolbar: TOOLBAR_WIDTH, panel: panelWidth },
    DRAWER_MIN_WIDTH,
  )
  const horizontalTotal = TOOLBAR_WIDTH + panelWidth + drawerWidth

  if (horizontalTotal > viewportWidth) {
    violations.push({
      rule: 'barra+painel+gaveta-cabem-na-largura',
      detail: `soma ${horizontalTotal}px passa da largura ${viewportWidth}px`,
    })
  }

  // 2. A área livre do canvas nunca fica negativa — vira zero, nunca menos
  //    (freeCanvasArea já clampa isso, mas a invariante trava a regressão).
  const occupancy: SurfaceOccupancy = {
    toolbar: TOOLBAR_WIDTH,
    panel: panelWidth,
    drawer: drawerWidth,
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

  // 4. O dock nunca passa da largura da tela, mesmo com a margem do canto —
  //    é o que `max-w-[calc(100vw-2rem)]` garante em CSS; aqui é o
  //    equivalente testável em número.
  const dockWidth = Math.min(DOCK_WIDTH, viewportWidth - DOCK_CORNER_MARGIN * 2)
  if (dockWidth + DOCK_CORNER_MARGIN * 2 > viewportWidth) {
    violations.push({
      rule: 'dock-cabe-na-largura',
      detail: `dock de ${dockWidth}px + margens passa de ${viewportWidth}px`,
    })
  }

  // 5. O painel esquerdo, esticado até a altura máxima que o dock permite
  //    (pior caso: dock ocupando toda a altura reservada a ele), continua
  //    com uma altura utilizável — nunca negativa nem ilegivelmente pequena.
  const dockHeight = Math.round(viewportHeight * DOCK_MAX_HEIGHT_FRACTION)
  const dockTop = viewportHeight - dockHeight
  const panelMaxHeight = dockTop - PANEL_TO_DOCK_GAP
  const MIN_USABLE_PANEL_HEIGHT = 160

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
 * `barra+painel+gaveta-cabem-na-largura`.
 */
export const COMBINED_FLOOR_WIDTH = TOOLBAR_WIDTH + PANEL_MIN_WIDTH + DRAWER_MIN_WIDTH

/** Nunca é zero: abaixo disto o canvas não teria faixa visível nenhuma. */
export const MIN_GUARANTEED_CANVAS_STRIP = MIN_CANVAS_STRIP

/** Abaixo disto, um painel esticado até o dock já não mostra conteúdo útil. */
const MIN_USABLE_PANEL_HEIGHT = 160

export type LiveLayoutSnapshot = {
  viewport: LayoutViewport
  /** Larguras REAIS ocupadas agora — não o pior caso plausível. */
  occupancy: SurfaceOccupancy
  /** `dockTop` medido de verdade (`Infinity` quando o dock não existe). */
  dockTop: number
}

/**
 * Diagnóstico do estado AO VIVO (não o pior caso hipotético de
 * `checkWorstCaseLayout`) — pra saber se o clamp que o código já faz
 * silenciosamente (painel/gaveta no piso, painel esticado até o dock) está
 * acontecendo agora de verdade, e por quê.
 *
 * Devolve no máximo UMA violação (a mais relevante) — é pra virar um evento
 * de log na transição, não uma lista de tudo que está no limite.
 */
export function detectLiveLayoutClamp({
  viewport,
  occupancy,
  dockTop,
}: LiveLayoutSnapshot): LayoutInvariantViolation | null {
  // Painel e gaveta abertos ao mesmo tempo, de verdade, sem caber — a
  // sobreposição intencional documentada em COMBINED_FLOOR_WIDTH acontecendo
  // agora, não hipoteticamente.
  const horizontalTotal = occupancy.toolbar + occupancy.panel + occupancy.drawer
  if (occupancy.panel > 0 && occupancy.drawer > 0 && horizontalTotal > viewport.width) {
    return {
      rule: 'painel+gaveta-sobrepostos-de-verdade',
      detail: `barra ${occupancy.toolbar}px + painel ${occupancy.panel}px + gaveta ${occupancy.drawer}px = ${horizontalTotal}px, viewport ${viewport.width}px`,
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
