/** Wrapping index math for the dock's active row, extracted so it's unit-testable. */
export function nextActiveIndex(current: number, delta: number, length: number) {
  if (length <= 0) return 0
  return (current + delta + length) % length
}

/**
 * A key event anywhere on screen should navigate the dock UNLESS it's inside
 * a text-editing field (where Shift+Arrow means "extend selection", not
 * "switch element") or it originated inside the dock itself — the dock's own
 * `<ul onKeyDown>` already handles that case, and letting both handlers run
 * would move the selection twice per key press (the native event bubbles
 * from the `<ul>` to `window`).
 *
 * Terminal (`.xterm`) targets are deliberately allowed, checked BEFORE the
 * text-field exclusion below: xterm.js's real focus target is a hidden
 * `<textarea class="xterm-helper-textarea">`, which would otherwise match
 * the generic `textarea` exclusion and silently disable the shortcut in the
 * one place it matters most — navigating away from a focused terminal is
 * exactly what the global shortcut is for.
 */
export function shouldHandleGlobalShiftArrow(target: EventTarget | null) {
  const element = target as { closest?: (selector: string) => unknown } | null
  if (!element?.closest) return true
  if (element.closest('[data-terminals-dock]')) return false
  if (element.closest('.xterm')) return true
  if (element.closest('input, textarea, [contenteditable="true"]')) return false
  return true
}
