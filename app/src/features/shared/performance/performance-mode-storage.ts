const PERFORMANCE_MODE_STORAGE_KEY = 'felixo-ai-core.performance-mode'

export function loadPerformanceMode(): boolean {
  try {
    return window.localStorage.getItem(PERFORMANCE_MODE_STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

export function savePerformanceMode(enabled: boolean) {
  try {
    window.localStorage.setItem(PERFORMANCE_MODE_STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    // Sem localStorage o modo vale só para esta sessão; não é motivo de erro.
  }
}
