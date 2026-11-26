// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useCanvasSurfaces } from '../hooks/canvas-surfaces-context'
import { CanvasSurfacesProvider } from './CanvasSurfacesProvider'

afterEach(cleanup)

describe('sidebar quando a gaveta aperta a janela', () => {
  it('recolhe sozinha, abre se a pessoa pedir e volta a recolher no próximo aperto', () => {
    window.innerWidth = 1100
    const { result } = renderHook(useCanvasSurfaces, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <CanvasSurfacesProvider toolbarWidth={288}>{children}</CanvasSurfacesProvider>
      ),
    })
    expect(result.current.sidebarAutoCollapsed).toBe(false)

    act(() => result.current.reportDrawerWidth(440))
    expect(result.current.sidebarAutoCollapsed).toBe(true)
    expect(result.current.occupancy.toolbar).toBe(52)

    act(() => result.current.setSidebarExpandedAnyway(true))
    expect(result.current.sidebarAutoCollapsed).toBe(false)
    expect(result.current.occupancy.toolbar).toBe(288)

    act(() => result.current.reportDrawerWidth(44))
    act(() => result.current.reportDrawerWidth(440))
    expect(result.current.sidebarAutoCollapsed).toBe(true)
  })
})
