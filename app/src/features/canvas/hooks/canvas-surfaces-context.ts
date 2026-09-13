import { createContext, useContext } from 'react'
import type { SurfaceOccupancy } from '../services/canvas-surfaces'

export type MinimapSize = { width: number; height: number }

export type CanvasSurfacesValue = {
  /**
   * `occupancy.panel`/`occupancy.drawer` são as larguras FINAIS já
   * decididas por `splitHorizontalSpace` — o que cada superfície de fato
   * deve renderizar. Não são o que cada lado pediu (isso é `reportPanelWidth`/
   * `reportDrawerWidth`, abaixo); ler `occupancy` de volta pra decidir a
   * própria largura é seguro porque é resultado de uma conta feita uma vez,
   * nunca de um relato do outro lado — ver o comentário em
   * `CanvasSurfacesProvider.tsx` sobre o loop que essa distinção corrige.
   */
  occupancy: SurfaceOccupancy
  viewport: { width: number; height: number }
  /**
   * Cada superfície publica o que QUER ocupar — sem corte nenhum, nem pelo
   * próprio piso nem pelo que o outro lado está usando. O provider decide a
   * largura final dos dois de uma vez (`splitHorizontalSpace`) e devolve o
   * resultado em `occupancy`; quem relata nunca deve calcular o próprio
   * clamp sozinho, ou a referência circular volta.
   */
  reportPanelWidth: (width: number) => void
  reportDrawerWidth: (width: number) => void
  /**
   * Largura do inspector "Elementos", publicada por `TerminalsPanel`: 0
   * quando está recolhido no puck, `INSPECTOR_WIDTH` quando expandido. Ele é
   * permanente (não é medido via `ResizeObserver` — a largura é fixa por
   * desenho), então é só um número reportado a cada troca de estado, igual
   * `reportDrawerWidth`.
   */
  reportInspectorWidth: (width: number) => void
  /** Topo medido do dock Elementos; infinito quando não está disponível. */
  dockTop: number
  reportDockTop: (top: number) => void
  /** Altura do dock que precisa ser reservada no rodapé do canvas. */
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
      occupancy: { toolbar: 0, panel: 0, drawer: 0, inspector: 0 },
      viewport: {
        width: typeof window === 'undefined' ? 1280 : window.innerWidth,
        height: typeof window === 'undefined' ? 800 : window.innerHeight,
      },
      reportPanelWidth: () => {},
      reportDrawerWidth: () => {},
      reportInspectorWidth: () => {},
      dockTop: Number.POSITIVE_INFINITY,
      reportDockTop: () => {},
      dockHeight: 0,
      minimap: null,
    }
  )
}
