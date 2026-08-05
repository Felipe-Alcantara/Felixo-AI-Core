import { describe, expect, it, vi } from 'vitest'
import {
  readCollapsedPreference,
  readPinnedPreference,
  readWidthPreference,
  shouldCloseOnOutsideClick,
  writeCollapsedPreference,
  writePinnedPreference,
  writeWidthPreference,
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

describe('collapsed preference', () => {
  it('defaults to expanded and round-trips an explicit collapse', () => {
    expect(readCollapsedPreference({ getItem: () => null })).toBe(false)
    expect(readCollapsedPreference({ getItem: () => '1' })).toBe(true)

    const setItem = vi.fn()
    writeCollapsedPreference({ setItem }, true)
    expect(setItem).toHaveBeenCalledWith('felixo:terminal-drawer-collapsed', '1')
  })
})

describe('width preference', () => {
  it('falls back when nothing valid is stored', () => {
    expect(readWidthPreference({ getItem: () => null }, 700, 440, 1200)).toBe(700)
    expect(readWidthPreference({ getItem: () => 'abc' }, 700, 440, 1200)).toBe(700)
    expect(readWidthPreference({ getItem: () => '0' }, 700, 440, 1200)).toBe(700)
  })

  it('clamps a stored width into the allowed range', () => {
    expect(readWidthPreference({ getItem: () => '100' }, 700, 440, 1200)).toBe(440)
    expect(readWidthPreference({ getItem: () => '5000' }, 700, 440, 1200)).toBe(1200)
    expect(readWidthPreference({ getItem: () => '800' }, 700, 440, 1200)).toBe(800)
  })

  it('persists a rounded width', () => {
    const setItem = vi.fn()
    writeWidthPreference({ setItem }, 812.6)
    expect(setItem).toHaveBeenCalledWith('felixo:terminal-drawer-width', '813')
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
