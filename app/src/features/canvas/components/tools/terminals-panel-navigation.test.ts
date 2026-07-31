import { describe, expect, it } from 'vitest'
import { nextActiveIndex, shouldHandleGlobalShiftArrow } from './terminals-panel-navigation'

describe('nextActiveIndex', () => {
  it('wraps forward past the end of the list', () => {
    expect(nextActiveIndex(2, 1, 3)).toBe(0)
  })

  it('wraps backward past the start of the list', () => {
    expect(nextActiveIndex(0, -1, 3)).toBe(2)
  })

  it('steps normally within bounds', () => {
    expect(nextActiveIndex(1, 1, 3)).toBe(2)
  })

  it('is 0 for an empty list instead of dividing by zero', () => {
    expect(nextActiveIndex(0, 1, 0)).toBe(0)
  })
})

function elementWithMatchingCloser(matches: string[]): HTMLElement {
  return {
    closest: (selector: string) => (matches.includes(selector) ? {} : null),
  } as unknown as HTMLElement
}

describe('shouldHandleGlobalShiftArrow', () => {
  it('allows a null target (e.g. synthetic dispatch)', () => {
    expect(shouldHandleGlobalShiftArrow(null)).toBe(true)
  })

  it('ignores events that already hit the dock, so the ul handler is the single source of truth and the row does not move twice', () => {
    const target = elementWithMatchingCloser(['[data-terminals-dock]'])
    expect(shouldHandleGlobalShiftArrow(target)).toBe(false)
  })

  it('ignores text-editing fields so Shift+Arrow keeps extending text selection there', () => {
    const target = elementWithMatchingCloser([
      'input, textarea, [contenteditable="true"]',
    ])
    expect(shouldHandleGlobalShiftArrow(target)).toBe(false)
  })

  it('allows a plain, non-terminal, non-field target (e.g. the canvas pane)', () => {
    const target = elementWithMatchingCloser([])
    expect(shouldHandleGlobalShiftArrow(target)).toBe(true)
  })

  it('allows xterm\'s real focus target — a <textarea class="xterm-helper-textarea"> nested inside .xterm — even though it also matches the generic textarea selector', () => {
    // Regression test: xterm.js's hidden input IS a <textarea>, so it matches
    // BOTH '.xterm' and 'input, textarea, [contenteditable="true"]'. An
    // earlier version of this guard checked the text-field exclusion first,
    // which silently disabled the shortcut while a terminal was focused —
    // exactly the one place the task required it to keep working.
    const target = elementWithMatchingCloser([
      '.xterm',
      'input, textarea, [contenteditable="true"]',
    ])
    expect(shouldHandleGlobalShiftArrow(target)).toBe(true)
  })

  it('ignores a plain textarea that is NOT inside a terminal (e.g. the chat composer or a note)', () => {
    const target = elementWithMatchingCloser([
      'input, textarea, [contenteditable="true"]',
    ])
    expect(shouldHandleGlobalShiftArrow(target)).toBe(false)
  })
})
