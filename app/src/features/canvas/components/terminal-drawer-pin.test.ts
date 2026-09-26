import { describe, expect, it, vi } from 'vitest'
import {
  clampDrawerWidth,
  DRAWER_DEFAULT_WIDTH,
  getDefaultDrawerWidth,
  getDrawerMaxWidth,
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

describe('responsive drawer width', () => {
  it('keeps the drag range valid when the CSS viewport is narrower than the normal minimum', () => {
    expect(getDrawerMaxWidth(576)).toBe(376)
    expect(clampDrawerWidth(440, 576, 440)).toBe(376)
    expect(clampDrawerWidth(320, 576, 440)).toBe(376)
  })

  it('keeps the normal minimum on a desktop-sized viewport', () => {
    expect(clampDrawerWidth(320, 1200, 440)).toBe(440)
    expect(clampDrawerWidth(1600, 1200, 440)).toBe(1000)
  })
})

describe('getDefaultDrawerWidth', () => {
  it('caps at the default width on a wide screen', () => {
    expect(getDefaultDrawerWidth(1920, 440)).toBe(DRAWER_DEFAULT_WIDTH)
  })

  it('takes 45% of a mid-sized viewport', () => {
    expect(getDefaultDrawerWidth(1366, 440)).toBe(614)
  })

  it('never goes below the minimum while there is room for it', () => {
    expect(getDefaultDrawerWidth(900, 440)).toBe(440)
  })

  it('shrinks with the viewport instead of overflowing it', () => {
    expect(getDefaultDrawerWidth(576, 440)).toBe(getDrawerMaxWidth(576))
  })

  // Antes, o estado inicial e o reset (Home) calculavam a largura padrão com
  // duas expressões diferentes. Esta varredura prende a de abertura, para o
  // reset nunca voltar a uma largura diferente da que a gaveta abre.
  it('matches the width the drawer used to open with on every viewport', () => {
    for (let viewport = 320; viewport <= 3840; viewport += 7) {
      const openingWidth = clampDrawerWidth(
        Math.min(DRAWER_DEFAULT_WIDTH, Math.max(440, Math.floor(viewport * 0.45))),
        viewport,
        440,
      )
      expect(getDefaultDrawerWidth(viewport, 440)).toBe(openingWidth)
    }
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
