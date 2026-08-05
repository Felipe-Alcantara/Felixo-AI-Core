/**
 * Where a toolbar popover opens.
 *
 * The toolbar is a single vertical column of 9rem buttons, all in one stacking
 * context, so a popover that opens DOWNWARDS is painted under the buttons that
 * follow it in the DOM — it showed up behind "Nota"/"Arquivo"/"Grupo". Every
 * toolbar popover therefore opens to the RIGHT of the column instead (the
 * behaviour "Ferramentas" and "Agente" already had), lifted above the toolbar
 * with a z-index.
 *
 * The offset accounts for the tools menu, which widens the column to 18.5rem
 * while open; the popover slides over to clear it, with the same transition
 * the other flyouts use so it tracks that widening instead of jumping.
 *
 * Both class strings are written out in full (no interpolation) because
 * Tailwind generates utilities by scanning the source text — a composed
 * `left-[calc(${column}+0.5rem)]` would never be emitted.
 */
const BESIDE_TOOLBAR = 'left-[calc(9rem+0.5rem)]'
const BESIDE_OPEN_TOOLS_MENU = 'left-[calc(18.5rem+0.5rem)]'

const FLYOUT_BASE =
  'absolute top-0 z-30 transition-[left] duration-[620ms] ease-[cubic-bezier(0.16,1,0.3,1)]'

/** Tailwind classes placing a popover beside the toolbar column. */
export function toolbarFlyoutClass(toolsMenuOpen: boolean): string {
  return `${FLYOUT_BASE} ${toolsMenuOpen ? BESIDE_OPEN_TOOLS_MENU : BESIDE_TOOLBAR}`
}

/** Breathing room kept between a flyout and the bottom of the window. */
const VIEWPORT_MARGIN = 16

/**
 * How tall a flyout may be before it would run off the bottom of the window.
 * Flyouts open level with their button (`top-0`), and the buttons low in the
 * toolbar have little room beneath them, so a flat `max-h-[60vh]` would spill
 * off-screen there.
 */
export function flyoutMaxHeight(
  anchorTop: number,
  viewportHeight: number,
  margin = VIEWPORT_MARGIN,
): number {
  return Math.max(0, viewportHeight - anchorTop - margin)
}
