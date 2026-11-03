export const PERFORMANCE_MODE_BENCHMARK_MODES = ['normal', 'performance'] as const

export type PerformanceModeBenchmarkMode =
  (typeof PERFORMANCE_MODE_BENCHMARK_MODES)[number]

export function performanceModeAttributeValue(
  mode: PerformanceModeBenchmarkMode,
): 'on' | 'off' {
  return mode === 'performance' ? 'on' : 'off'
}

export function applyPerformanceModeBenchmarkMode(
  mode: PerformanceModeBenchmarkMode,
): void {
  document.documentElement.dataset.performanceMode = performanceModeAttributeValue(mode)
}
