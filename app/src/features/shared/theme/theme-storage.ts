export type AppTheme = 'dark' | 'high_contrast'

const THEME_STORAGE_KEY = 'felixo-ai-core.theme'

export function loadTheme(): AppTheme {
  try {
    const theme = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isAppTheme(theme) ? theme : 'dark'
  } catch {
    return 'dark'
  }
}

export function saveTheme(theme: AppTheme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Sem localStorage o tema vale só para esta sessão; não é motivo de erro.
  }
}

export function isAppTheme(value: unknown): value is AppTheme {
  return value === 'dark' || value === 'high_contrast'
}
