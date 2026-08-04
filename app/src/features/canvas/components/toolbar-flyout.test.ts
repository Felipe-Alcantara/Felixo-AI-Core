import { describe, expect, it } from 'vitest'
import { flyoutMaxHeight, toolbarFlyoutClass } from './toolbar-flyout'

describe('toolbarFlyoutClass', () => {
  it('opens beside the toolbar column, above it, never below the buttons', () => {
    const classes = toolbarFlyoutClass(false)
    // The bug this fixes: a `top-full` popover with no z-index was painted
    // under the toolbar buttons that follow it in the DOM.
    expect(classes).toContain('left-[calc(9rem+0.5rem)]')
    expect(classes).toContain('z-30')
    expect(classes).not.toContain('top-full')
  })

  it('clears the widened column while the tools menu is open', () => {
    expect(toolbarFlyoutClass(true)).toContain('left-[calc(18.5rem+0.5rem)]')
  })

  it('animates between the two offsets instead of jumping', () => {
    expect(toolbarFlyoutClass(false)).toContain('transition-[left]')
  })
})

describe('flyoutMaxHeight', () => {
  it('leaves a margin above the bottom of the window', () => {
    expect(flyoutMaxHeight(100, 800, 16)).toBe(684)
  })

  it('shrinks for a button low in the toolbar, where a flat 60vh would overflow', () => {
    expect(flyoutMaxHeight(700, 800, 16)).toBe(84)
  })

  it('never goes negative for a button below the fold', () => {
    expect(flyoutMaxHeight(900, 800, 16)).toBe(0)
  })
})
