import { describe, expect, it } from 'vitest'
import { toolbarColumnOffset } from './toolbar-flyout'

describe('toolbarColumnOffset', () => {
  it('reserves the full sidebar width when expanded', () => {
    expect(toolbarColumnOffset(false)).toBe(288)
  })

  it('reserves only the activity rail when collapsed', () => {
    expect(toolbarColumnOffset(true)).toBe(52)
  })
})
