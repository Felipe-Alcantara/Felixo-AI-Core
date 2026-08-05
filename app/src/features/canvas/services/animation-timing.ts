/**
 * Durations shared between CSS animations and the JS that unmounts a surface
 * after they finish. Keeping them here stops the two from drifting apart: a JS
 * timer shorter than its CSS animation cuts the exit off mid-flight.
 *
 * Each constant names the CSS class it mirrors — change both together.
 */

/** Mirrors `.felixo-anim-drawer-out` in index.css. */
export const DRAWER_EXIT_MS = 300

/** Mirrors `.felixo-anim-panel-out` in index.css. */
export const PANEL_EXIT_MS = 260
