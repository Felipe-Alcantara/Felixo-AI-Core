/**
 * Janela estreita: abaixo disto (CSS px, o que o zoom de página também alcança: 1280 px a 300% são 427) a sidebar
 * expandida (até 240 px) deixa menos de 240 px para o canvas e para a pílula de zoom (208 px), e a lista Elementos
 * abre por cima dela. A sidebar abre recolhida; a pessoa pode expandi-la, e a escolha vale só enquanto a janela
 * seguir estreita (não sobrescreve a preferência gravada).
 */
import { COLLAPSED_SURFACE_WIDTH, DRAWER_MIN_WIDTH, INSPECTOR_WIDTH } from './canvas-surfaces'

export const NARROW_VIEWPORT_WIDTH = 480
/** Abaixo disto, com a gaveta aberta, a conta preserva `DRAWER_CANVAS_STRIP` de canvas em vez da faixa normal. */
export const DRAWER_LAYOUT_BREAKPOINT = 1400
/** Faixa de canvas ao lado da gaveta: cabe a pílula de zoom. */
export const DRAWER_CANVAS_STRIP = 240

export function isNarrowViewport(width: number): boolean {
  return width < NARROW_VIEWPORT_WIDTH
}

export function isDrawerOpen(drawerWidth: number): boolean {
  return drawerWidth > COLLAPSED_SURFACE_WIDTH
}

/** Só recolhe quando a sidebar expandida não cabe ao lado da gaveta, da faixa do canvas e da lista Elementos. */
export function shouldCollapseSidebarForDrawer(width: number, drawerWidth: number, sidebarWidth: number): boolean {
  return isDrawerOpen(drawerWidth) && width < sidebarWidth + DRAWER_MIN_WIDTH + DRAWER_CANVAS_STRIP + INSPECTOR_WIDTH
}

/** A sidebar está recolhida? Estreita: recolhida até a pessoa expandir. Senão: o que ela gravou. */
export function effectiveSidebarCollapsed(input: { narrow: boolean; stored: boolean; narrowExpanded: boolean }): boolean {
  return input.narrow ? !input.narrowExpanded : input.stored
}
