import { describe, expect, it } from 'vitest'
import { flyoutLeft, flyoutMaxHeight, toolbarFlyoutClass } from './toolbar-flyout'

describe('toolbarFlyoutClass', () => {
  it('opens beside the toolbar column, above it, never below the buttons', () => {
    const classes = toolbarFlyoutClass()
    // The bug this fixes: a `top-full` popover with no z-index was painted
    // under the toolbar buttons that follow it in the DOM.
    expect(classes).toContain('z-30')
    expect(classes).not.toContain('top-full')
  })

  it('clears the widened column while the tools menu is open', () => {
    expect(toolbarFlyoutClass()).toContain('top-0')
  })

  it('animates between the two offsets instead of jumping', () => {
    expect(toolbarFlyoutClass()).toContain('transition-[left]')
  })
})

describe('flyoutLeft', () => {
  it('keeps a flyout inside the viewport when the preferred side has no room', () => {
    // Toolbar starts at 16px; the old preferred position was 168px and would
    // put a 320px panel past the 480px CSS viewport.
    expect(flyoutLeft(16, 152, 480, 320, 16)).toBe(128)
  })

  it('uses the preferred offset when enough horizontal room exists', () => {
    expect(flyoutLeft(16, 152, 1200, 320, 16)).toBe(152)
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
