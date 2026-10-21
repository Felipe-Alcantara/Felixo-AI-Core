export type AppTheme = 'dark' | 'light' | 'high_contrast'

/** Também lida pelo script do `<head>` do index.html, antes do React montar. */
export const THEME_STORAGE_KEY = 'felixo-ai-core.theme'

const APP_THEMES: readonly AppTheme[] = ['dark', 'light', 'high_contrast']

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
  return (APP_THEMES as readonly unknown[]).includes(value)
}
