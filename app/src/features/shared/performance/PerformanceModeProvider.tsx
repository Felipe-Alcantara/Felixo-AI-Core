import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { PerformanceModeContext } from './performance-mode-context'
import { loadPerformanceMode, savePerformanceMode } from './performance-mode-storage'

/**
 * Modo Performance do app inteiro — mesmo padrão do ThemeProvider: aplicado
 * uma vez no elemento raiz (`data-performance-mode`) para valer em qualquer
 * tela, canvas ou chat, independente de onde a pessoa ligou o modo.
 *
 * O atributo no `<html>` é o que os cortes em `index.css` (animações de
 * painel/dock/toolbar, pulso de aresta, controles de formulário) e os
 * componentes que decidem não montar decoração (`CanvasAmbientLayer`,
 * o minimapa) enxergam — sem precisar recarregar o app.
 */
export function PerformanceModeProvider({ children }: { children: ReactNode }) {
  const [performanceMode, setPerformanceModeState] = useState(() => loadPerformanceMode())

  useEffect(() => {
    document.documentElement.dataset.performanceMode = performanceMode ? 'on' : 'off'
    savePerformanceMode(performanceMode)
  }, [performanceMode])

  const setPerformanceMode = useCallback((next: boolean) => setPerformanceModeState(next), [])
  const value = useMemo(
    () => ({ performanceMode, setPerformanceMode }),
    [performanceMode, setPerformanceMode],
  )

  return (
    <PerformanceModeContext.Provider value={value}>{children}</PerformanceModeContext.Provider>
  )
}
