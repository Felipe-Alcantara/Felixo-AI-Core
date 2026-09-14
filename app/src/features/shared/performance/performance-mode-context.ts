import { createContext, useContext } from 'react'

export type PerformanceModeContextValue = {
  performanceMode: boolean
  setPerformanceMode: (enabled: boolean) => void
}

// O contexto mora num arquivo sem componente para o fast refresh continuar
// funcionando no provider (mesmo padrão do theme-context).
export const PerformanceModeContext = createContext<PerformanceModeContextValue | null>(null)

export function usePerformanceMode(): PerformanceModeContextValue {
  const context = useContext(PerformanceModeContext)

  if (!context) {
    throw new Error('usePerformanceMode precisa estar dentro de <PerformanceModeProvider>.')
  }

  return context
}
