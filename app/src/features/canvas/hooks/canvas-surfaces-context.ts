import { createContext, useContext } from 'react'
import type { SurfaceOccupancy } from '../services/canvas-surfaces'

export type MinimapSize = { width: number; height: number }

export type CanvasSurfacesValue = {
  occupancy: SurfaceOccupancy
  viewport: { width: number; height: number }
  /** Cada superfície publica a largura que está ocupando agora. */
  reportPanelWidth: (width: number) => void
  reportDrawerWidth: (width: number) => void
  /** Topo do dock "Elementos": é onde o painel da esquerda precisa parar. */
  dockTop: number
  reportDockTop: (top: number) => void
  /**
   * Altura do dock, DERIVADA de `dockTop` (nunca medida de novo): a
   * distância dele até o fim do viewport já é a altura ocupada + a margem
   * do canto. Existia um segundo caminho de medição (`onHeightChange` em
   * `TerminalsPanel`, com seu próprio `ResizeObserver`) que reportava
   * exatamente a mesma coisa por um canal separado — unificado aqui: quem
   * precisa reservar espaço pro dock (notificações, posicionamento de node)
   * lê isto, não reimplementa a conta.
   */
  dockHeight: number
  /**
   * Tamanho do Mini Map pra área livre atual, já calculado uma vez aqui —
   * `miniMapSize(freeCanvasArea(...).width)` era recalculado ad-hoc em
   * `CanvasView.tsx`; quem mais precisar dele (o sino de notificações, pra
   * não usar um deslocamento fixo) lê do mesmo lugar em vez de refazer a
   * conta com um viewport potencialmente desatualizado.
   */
  minimap: MinimapSize | null
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
      dockHeight: 0,
      minimap: null,
    }
  )
}
