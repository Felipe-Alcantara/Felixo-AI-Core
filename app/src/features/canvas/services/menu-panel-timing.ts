/**
 * Duration shared by toolbar buttons that grow before exposing a side panel.
 * Mirrored by the `duration-[180ms]` utility on every such button and panel —
 * change both together, or the panel mounts out of step with the growth.
 */
export const MENU_BUTTON_EXPANSION_MS = 180

/** Lets the panel mount just early enough for its first delayed item to start on time. */
export const MENU_PANEL_PREPARE_LEAD_MS = 30

export function getMenuPanelPreparationDelay(
  expansionMs = MENU_BUTTON_EXPANSION_MS,
  prepareLeadMs = MENU_PANEL_PREPARE_LEAD_MS,
): number {
  return Math.max(0, expansionMs - prepareLeadMs)
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}
