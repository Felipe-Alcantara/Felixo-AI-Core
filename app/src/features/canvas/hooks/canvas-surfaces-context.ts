import { createContext, useContext } from 'react'
import type { SurfaceOccupancy } from '../services/canvas-surfaces'

export type CanvasSurfacesValue = {
  occupancy: SurfaceOccupancy
  viewport: { width: number; height: number }
  /** Cada superfície publica a largura que está ocupando agora. */
  reportPanelWidth: (width: number) => void
  reportDrawerWidth: (width: number) => void
  /** Topo do dock "Elementos": é onde o painel da esquerda precisa parar. */
  dockTop: number
  reportDockTop: (top: number) => void
}

/**
 * Contexto sem componente para o fast refresh continuar valendo no provider,
 * mesmo padrão já usado no tema.
 */
export const CanvasSurfacesContext = createContext<CanvasSurfacesValue | null>(
  null,
)

/**
 * Espaço que cada superfície flutuante do canvas está ocupando.
 *
 * Fora de um `<CanvasSurfacesProvider>` devolve um estado neutro em vez de
 * lançar: um painel renderizado isolado (num teste, por exemplo) continua
 * funcionando com o viewport inteiro à disposição.
 */
export function useCanvasSurfaces(): CanvasSurfacesValue {
  return (
    useContext(CanvasSurfacesContext) ?? {
      occupancy: { toolbar: 0, panel: 0, drawer: 0 },
      viewport: {
        width: typeof window === 'undefined' ? 1280 : window.innerWidth,
        height: typeof window === 'undefined' ? 800 : window.innerHeight,
      },
      reportPanelWidth: () => {},
      reportDrawerWidth: () => {},
      dockTop: Number.POSITIVE_INFINITY,
      reportDockTop: () => {},
    }
  )
}
