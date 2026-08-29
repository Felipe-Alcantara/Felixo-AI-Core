import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ThemeContext } from './theme-context'
import { loadTheme, saveTheme, type AppTheme } from './theme-storage'

/**
 * Tema do app inteiro.
 *
 * Ficava dentro da tela de chat, o que amarrava a aparência a uma tela só: com
 * o canvas aberto o `data-theme` nunca era aplicado e a escolha da pessoa
 * simplesmente não valia. Aqui ele é aplicado no elemento raiz, uma vez, valha
 * qual tela estiver montada.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(() => loadTheme())

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    saveTheme(theme)
  }, [theme])

  const setTheme = useCallback((next: AppTheme) => setThemeState(next), [])
  const value = useMemo(() => ({ theme, setTheme }), [setTheme, theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
