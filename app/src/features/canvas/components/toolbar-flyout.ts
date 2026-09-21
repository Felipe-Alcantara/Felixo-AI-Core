import { SIDEBAR_RAIL_WIDTH, SIDEBAR_WIDTH } from '../services/canvas-surfaces'

/**
 * How far right of the window edge the workbench sidebar's own content ends
 * — where a tool panel (see `CanvasPanel.tsx`) must start so it opens beside
 * the sidebar instead of on top of it.
 *
 * Collapsed, the sidebar is just its activity rail (`SIDEBAR_RAIL_WIDTH`).
 * Expanded, it is whatever width the person dragged it to
 * (`useResizableSidebarWidth`), defaulting to `SIDEBAR_WIDTH`.
 */
export function toolbarColumnOffset(
  sidebarCollapsed: boolean,
  expandedWidth: number = SIDEBAR_WIDTH,
): number {
  return sidebarCollapsed ? SIDEBAR_RAIL_WIDTH : expandedWidth
}
