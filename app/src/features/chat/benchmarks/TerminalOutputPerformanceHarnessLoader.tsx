import { lazy } from 'react'

/**
 * Mantém a bancada de logs fora do bundle da aplicação. Ela só é alcançada
 * pela rota opt-in `?benchmark=terminal-output`.
 */
export const LazyTerminalOutputPerformanceHarness = lazy(() =>
  import('./TerminalOutputPerformanceHarness').then(
    ({ TerminalOutputPerformanceHarness: component }) => ({ default: component }),
  ),
)
