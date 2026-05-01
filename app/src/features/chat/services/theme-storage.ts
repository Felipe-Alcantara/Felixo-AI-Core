import type { AppTheme } from '../types'

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
  window.localStorage.setItem(THEME_STORAGE_KEY, theme)
}

function isAppTheme(value: unknown): value is AppTheme {
  return value === 'dark' || value === 'high_contrast'
}
