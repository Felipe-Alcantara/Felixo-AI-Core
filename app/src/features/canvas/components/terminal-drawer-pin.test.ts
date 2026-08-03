import { describe, expect, it, vi } from 'vitest'
import {
  readPinnedPreference,
  shouldCloseOnOutsideClick,
  writePinnedPreference,
} from './terminal-drawer-pin'

describe('readPinnedPreference', () => {
  it('is true only when the stored value is exactly "1"', () => {
    expect(readPinnedPreference({ getItem: () => '1' })).toBe(true)
    expect(readPinnedPreference({ getItem: () => '0' })).toBe(false)
    expect(readPinnedPreference({ getItem: () => null })).toBe(false)
  })
})

describe('writePinnedPreference', () => {
  it('persists pinned as "1" and unpinned as "0"', () => {
    const setItem = vi.fn()
    writePinnedPreference({ setItem }, true)
    writePinnedPreference({ setItem }, false)
    expect(setItem).toHaveBeenNthCalledWith(1, 'felixo:terminal-drawer-pinned', '1')
    expect(setItem).toHaveBeenNthCalledWith(2, 'felixo:terminal-drawer-pinned', '0')
  })
})

describe('shouldCloseOnOutsideClick', () => {
  const container = {} as Node
  const inside = container
  const outside = {} as Node

  it('never closes a pinned drawer, even on an outside click', () => {
    expect(shouldCloseOnOutsideClick(true, { contains: () => false } as unknown as Node, outside)).toBe(false)
  })

  it('closes an unpinned drawer when the click lands outside the container', () => {
    const containerNode = { contains: (n: Node) => n === inside } as unknown as Node
    expect(shouldCloseOnOutsideClick(false, containerNode, outside)).toBe(true)
  })

  it('keeps an unpinned drawer open when the click lands inside the container', () => {
    const containerNode = { contains: (n: Node) => n === inside } as unknown as Node
    expect(shouldCloseOnOutsideClick(false, containerNode, inside)).toBe(false)
  })

  it('closes when there is no container ref yet (defensive default)', () => {
    expect(shouldCloseOnOutsideClick(false, null, outside)).toBe(true)
  })
})
