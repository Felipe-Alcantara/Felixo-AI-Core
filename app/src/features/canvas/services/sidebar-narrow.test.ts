import { describe, expect, it } from 'vitest'
import {
  DRAWER_LAYOUT_BREAKPOINT,
  NARROW_VIEWPORT_WIDTH,
  effectiveSidebarCollapsed,
  isNarrowViewport,
  shouldCollapseSidebarForDrawer,
} from './sidebar-narrow'

describe('sidebar em janela estreita', () => {
  it('estreita é abaixo de 480 px, e 480 px já é janela normal', () => {
    expect(isNarrowViewport(NARROW_VIEWPORT_WIDTH - 1)).toBe(true)
    expect(isNarrowViewport(320)).toBe(true)
    expect(isNarrowViewport(NARROW_VIEWPORT_WIDTH)).toBe(false)
    expect(isNarrowViewport(768)).toBe(false)
  })

  it('numa janela normal vale o que a pessoa gravou', () => {
    expect(effectiveSidebarCollapsed({ narrow: false, stored: false, narrowExpanded: false })).toBe(false)
    expect(effectiveSidebarCollapsed({ narrow: false, stored: true, narrowExpanded: false })).toBe(true)
    // Expandir numa janela estreita não vaza para a janela normal.
    expect(effectiveSidebarCollapsed({ narrow: false, stored: true, narrowExpanded: true })).toBe(true)
  })

  it('numa janela estreita abre recolhida mesmo com a preferência de expandida', () => {
    expect(effectiveSidebarCollapsed({ narrow: true, stored: false, narrowExpanded: false })).toBe(true)
  })

  it('numa janela estreita a pessoa ainda pode expandir', () => {
    expect(effectiveSidebarCollapsed({ narrow: true, stored: true, narrowExpanded: true })).toBe(false)
    expect(effectiveSidebarCollapsed({ narrow: true, stored: false, narrowExpanded: true })).toBe(false)
  })

  it('recolhe a navegação só com a gaveta expandida e abaixo de 1400 px', () => {
    expect(shouldCollapseSidebarForDrawer(DRAWER_LAYOUT_BREAKPOINT - 1, 320)).toBe(true)
    expect(shouldCollapseSidebarForDrawer(DRAWER_LAYOUT_BREAKPOINT, 320)).toBe(false)
    expect(shouldCollapseSidebarForDrawer(768, 44)).toBe(false)
  })
})
