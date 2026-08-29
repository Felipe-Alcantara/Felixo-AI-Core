import { createContext, useContext } from 'react'
import type { AppTheme } from './theme-storage'

export type ThemeContextValue = {
  theme: AppTheme
  setTheme: (theme: AppTheme) => void
}

// O contexto mora num arquivo sem componente para o fast refresh continuar
// funcionando no provider.
export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useAppTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useAppTheme precisa estar dentro de <ThemeProvider>.')
  }

  return context
}
