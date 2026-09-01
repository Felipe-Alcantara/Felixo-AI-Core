import { lazy } from 'react'

/**
 * Keeps the connection benchmark out of the normal renderer graph. It is
 * reached only through `?benchmark=canvas-connections` and still gets its own
 * chunk when the benchmark route is selected.
 */
export const LazyCanvasConnectionPerformanceHarness = lazy(() =>
  import('./CanvasConnectionPerformanceHarness').then(
    ({ CanvasConnectionPerformanceHarness: component }) => ({ default: component }),
  ),
)
