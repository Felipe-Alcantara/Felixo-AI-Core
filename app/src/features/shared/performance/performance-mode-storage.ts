export const PERFORMANCE_MODE_STORAGE_KEY = 'felixo-ai-core.performance-mode.v1'
const LEGACY_PERFORMANCE_MODE_STORAGE_KEY = 'felixo-ai-core.performance-mode'

function parseStoredMode(value: string | null): boolean | null {
  if (value === 'on') return true
  if (value === 'off') return false
  return null
}

export function loadPerformanceMode(): boolean {
  try {
    const current = parseStoredMode(window.localStorage.getItem(PERFORMANCE_MODE_STORAGE_KEY))
    if (current !== null) return current

    const legacyValue = window.localStorage.getItem(LEGACY_PERFORMANCE_MODE_STORAGE_KEY)
    const legacy = parseStoredMode(legacyValue)
    if (legacy !== null && legacyValue !== null) {
      try {
        window.localStorage.setItem(PERFORMANCE_MODE_STORAGE_KEY, legacyValue)
      } catch {
        // A preferência antiga continua valendo nesta sessão mesmo sem escrita.
      }
      return legacy
    }

    return false
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
