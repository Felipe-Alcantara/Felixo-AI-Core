import { SIDEBAR_RAIL_WIDTH, SIDEBAR_WIDTH } from '../services/canvas-surfaces'

/**
 * How far right of the window edge the workbench sidebar's own content ends
 * — where a tool panel (see `CanvasPanel.tsx`) must start so it opens beside
 * the sidebar instead of on top of it.
 *
 * The sidebar collapses to just its activity rail (`SIDEBAR_RAIL_WIDTH`) or
 * sits fully expanded (`SIDEBAR_WIDTH`) — both fixed, CSS-defined widths
 * (`.felixo-workbench-sidebar` in index.css), so this is a plain lookup, not
 * a runtime measurement.
 */
export function toolbarColumnOffset(sidebarCollapsed: boolean): number {
  return sidebarCollapsed ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH
}
