import { useCallback, useEffect, useState } from 'react'
import {
  getMenuPanelPreparationDelay,
  prefersReducedMotion,
} from '../services/menu-panel-timing'

/**
 * Coordinates a side panel with the button that reveals it. The panel mounts
 * shortly before the button finishes growing, so its own first delayed item
 * becomes visible exactly when the button reaches its final width.
 */
export function useDeferredExpansionPanel(open: boolean) {
  const [panelReady, setPanelReady] = useState(false)

  const preparePanel = useCallback(() => {
    setPanelReady(prefersReducedMotion())
  }, [])

  const resetPanel = useCallback(() => {
    setPanelReady(false)
  }, [])

  const markPanelReady = useCallback(() => {
    setPanelReady(true)
  }, [])

  useEffect(() => {
    if (!open || panelReady || prefersReducedMotion()) {
      return
    }

    const timer = window.setTimeout(
      () => setPanelReady(true),
      getMenuPanelPreparationDelay(),
    )
    return () => window.clearTimeout(timer)
  }, [open, panelReady])

  return {
    panelReady,
    preparePanel,
    resetPanel,
    markPanelReady,
  }
}
