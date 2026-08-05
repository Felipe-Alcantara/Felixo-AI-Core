import { describe, expect, it, vi } from 'vitest'
import { readDockCollapsed, writeDockCollapsed } from './terminals-panel-collapse'

describe('elements dock collapse preference', () => {
  it('defaults to expanded', () => {
    expect(readDockCollapsed({ getItem: () => null })).toBe(false)
    expect(readDockCollapsed(undefined)).toBe(false)
  })

  it('reads an explicit collapse', () => {
    expect(readDockCollapsed({ getItem: () => '1' })).toBe(true)
    expect(readDockCollapsed({ getItem: () => '0' })).toBe(false)
  })

  it('persists both states', () => {
    const setItem = vi.fn()
    writeDockCollapsed(true, { setItem })
    writeDockCollapsed(false, { setItem })
    expect(setItem).toHaveBeenNthCalledWith(1, 'felixo:elements-dock-collapsed', '1')
    expect(setItem).toHaveBeenNthCalledWith(2, 'felixo:elements-dock-collapsed', '0')
  })

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readDockCollapsed(broken)).toBe(false)
    expect(() => writeDockCollapsed(true, broken)).not.toThrow()
  })
})
