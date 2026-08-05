import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

/**
 * Where a toolbar popover opens.
 *
 * The toolbar is a single vertical column of 9rem buttons, all in one stacking
 * context, so a side flyout needs an explicit z-index and a measured horizontal
 * offset to remain usable while the column grows.
 *
 * The offset accounts for the tools menu, which widens the column to 18.5rem
 * while open; the popover slides over to clear it, with the same transition
 * the other flyouts use so it tracks that widening instead of jumping.
 *
 * The horizontal offset is measured at runtime. The toolbar can be narrower
 * than a CSS viewport after window resizing or browser zoom, so a fixed
 * `left-[calc(...)]` can place the entire panel outside the visible area.
 */
const FLYOUT_BASE =
  'absolute z-30 transition-[left] duration-[620ms] ease-[cubic-bezier(0.16,1,0.3,1)]'

const TOOLBAR_OFFSET = 9 * 16 + 8
const OPEN_TOOLS_OFFSET = 18.5 * 16 + 8
const DEFAULT_VIEWPORT_MARGIN = 16

export type ToolbarFlyoutPlacement = 'beside' | 'below'

/** Tailwind classes placing a popover beside the toolbar column. */
export function toolbarFlyoutClass(
  placement: ToolbarFlyoutPlacement = 'beside',
): string {
  return `${FLYOUT_BASE} ${placement === 'below' ? 'top-full mt-2' : 'top-0'}`
}

/** Breathing room kept between a flyout and the bottom of the window. */
const VIEWPORT_MARGIN = 16

/**
 * How tall a flyout may be before it would run off the bottom of the window.
 * Flyouts open level with their button (`top-0`), and the buttons low in the
 * toolbar have little room beneath them, so a flat `max-h-[60vh]` would spill
 * off-screen there.
 */
export function flyoutMaxHeight(
  anchorTop: number,
  viewportHeight: number,
  margin = VIEWPORT_MARGIN,
): number {
  return Math.max(0, viewportHeight - anchorTop - margin)
}

export type ToolbarFlyoutPosition = {
  left: number
  maxHeight: number
  maxWidth: string
}

/** Returns the panel's left offset relative to its toolbar anchor. */
export function flyoutLeft(
  containerLeft: number,
  desiredOffset: number,
  viewportWidth: number,
  panelWidth: number,
  margin = DEFAULT_VIEWPORT_MARGIN,
): number {
  const availableWidth = Math.max(0, viewportWidth - margin * 2)
  const width = Math.min(Math.max(0, panelWidth), availableWidth)
  const desiredLeft = containerLeft + desiredOffset
  const maxLeft = Math.max(margin, viewportWidth - margin - width)
  const viewportLeft = Math.min(Math.max(margin, desiredLeft), maxLeft)
  return Math.round(viewportLeft - containerLeft)
}

type UseToolbarFlyoutPositionOptions = {
  open: boolean
  toolsMenuOpen: boolean
  containerRef?: RefObject<HTMLElement | null>
  panelRef: RefObject<HTMLElement | null>
  panelWidth: number
  placement?: ToolbarFlyoutPlacement
  margin?: number
}

/**
 * Keeps a toolbar flyout inside the CSS viewport while preserving the local
 * absolute positioning used by the toolbar animations. The panel is measured
 * after mount and re-positioned when the toolbar, panel, or viewport changes.
 */
export function useToolbarFlyoutPosition({
  open,
  toolsMenuOpen,
  containerRef,
  panelRef,
  panelWidth,
  placement = 'beside',
  margin = DEFAULT_VIEWPORT_MARGIN,
}: UseToolbarFlyoutPositionOptions): ToolbarFlyoutPosition | undefined {
  const [position, setPosition] = useState<ToolbarFlyoutPosition>()

  useLayoutEffect(() => {
    if (!open) {
      return
    }

    const container = containerRef?.current ?? panelRef.current?.parentElement
    if (!container) {
      return
    }

    let frameId = 0
    const update = () => {
      const containerRect = container.getBoundingClientRect()
      const measuredWidth = panelRef.current?.getBoundingClientRect().width ?? panelWidth
      const desiredOffset = toolsMenuOpen ? OPEN_TOOLS_OFFSET : TOOLBAR_OFFSET
      const anchorTop = placement === 'below' ? containerRect.bottom : containerRect.top

      setPosition({
        left: flyoutLeft(
          containerRect.left,
          desiredOffset,
          window.innerWidth,
          measuredWidth,
          margin,
        ),
        maxHeight: flyoutMaxHeight(anchorTop, window.innerHeight, margin),
        maxWidth: `calc(100vw - ${margin * 2}px)`,
      })
    }
    const requestUpdate = () => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(update)
    }

    requestUpdate()
    window.addEventListener('resize', requestUpdate)
    window.addEventListener('scroll', requestUpdate, true)

    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(requestUpdate)
    observer?.observe(container)
    if (panelRef.current) {
      observer?.observe(panelRef.current)
    }

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', requestUpdate)
      window.removeEventListener('scroll', requestUpdate, true)
      observer?.disconnect()
    }
  }, [containerRef, margin, open, panelRef, panelWidth, placement, toolsMenuOpen])

  return position
}

/** Converts a measured position into the inline style expected by a panel. */
export function toolbarFlyoutStyle(position?: ToolbarFlyoutPosition): CSSProperties | undefined {
  if (!position) {
    return undefined
  }

  return {
    left: `${position.left}px`,
    maxHeight: `${position.maxHeight}px`,
    maxWidth: position.maxWidth,
  }
}
