import { useCallback, useEffect, useState } from 'react'
import {
  getMenuPanelPreparationDelay,
  prefersReducedMotion,
} from '../services/menu-panel-timing'
import { usePerformanceMode } from '../../shared/performance/performance-mode-context'

/**
 * Coordinates a side panel with the button that reveals it. The panel mounts
 * shortly before the button finishes growing, so its own first delayed item
 * becomes visible exactly when the button reaches its final width.
 *
 * Modo Performance skips the wait the same way the OS reduced-motion
 * preference already does: the button itself doesn't grow (index.css), so
 * the panel must not sit there waiting for a growth that never plays.
 */
export function useDeferredExpansionPanel(open: boolean) {
  const [panelReady, setPanelReady] = useState(false)
  const { performanceMode } = usePerformanceMode()
  const skipDelay = useCallback(
    () => performanceMode || prefersReducedMotion(),
    [performanceMode],
  )

  const preparePanel = useCallback(() => {
    setPanelReady(skipDelay())
  }, [skipDelay])

  const resetPanel = useCallback(() => {
    setPanelReady(false)
  }, [])

  const markPanelReady = useCallback(() => {
    setPanelReady(true)
  }, [])

  useEffect(() => {
    if (!open || panelReady || skipDelay()) {
      return
    }

    const timer = window.setTimeout(
      () => setPanelReady(true),
      getMenuPanelPreparationDelay(),
    )
    return () => window.clearTimeout(timer)
  }, [open, panelReady, skipDelay])

  return {
    panelReady,
    preparePanel,
    resetPanel,
    markPanelReady,
  }
}
