/**
 * Janela estreita: abaixo disto (CSS px, o que o zoom de página também alcança: 1280 px a 300% são 427) a sidebar
 * expandida (até 240 px) deixa menos de 240 px para o canvas e para a pílula de zoom (208 px), e a lista Elementos
 * abre por cima dela. A sidebar abre recolhida; a pessoa pode expandi-la, e a escolha vale só enquanto a janela
 * seguir estreita (não sobrescreve a preferência gravada).
 */
import { COLLAPSED_SURFACE_WIDTH } from './canvas-surfaces'

export const NARROW_VIEWPORT_WIDTH = 480
/** Expanded drawer layouts need a rail navigation when the window is narrower than the drawer and inspector together. */
export const DRAWER_LAYOUT_BREAKPOINT = 1400

export function isNarrowViewport(width: number): boolean {
  return width < NARROW_VIEWPORT_WIDTH
}

export function shouldCollapseSidebarForDrawer(width: number, drawerWidth: number): boolean {
  return width < DRAWER_LAYOUT_BREAKPOINT && drawerWidth > COLLAPSED_SURFACE_WIDTH
}

/** A sidebar está recolhida? Estreita: recolhida até a pessoa expandir. Senão: o que ela gravou. */
export function effectiveSidebarCollapsed(input: { narrow: boolean; stored: boolean; narrowExpanded: boolean }): boolean {
  return input.narrow ? !input.narrowExpanded : input.stored
}
