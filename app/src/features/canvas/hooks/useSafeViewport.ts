import { useCallback, type RefObject } from 'react'
import type { Node } from '@xyflow/react'
import {
  flowCenterForSafeArea,
  getCanvasSafeArea,
  safeViewportOffset,
  viewportForSafeArea,
} from '../services/canvas-interaction-geometry'
import type { SurfaceOccupancy } from '../services/canvas-surfaces'

/** O pedaço da instância do React Flow que o canvas usa para mover a câmera. */
export type FlowPositionMapper = {
  screenToFlowPosition: (position: { x: number; y: number }) => {
    x: number
    y: number
  }
  /** O React Flow devolve a promessa que resolve quando a câmera chega. */
  setCenter: (
    x: number,
    y: number,
    options?: { zoom?: number; duration?: number },
  ) => Promise<boolean> | void
  fitView: (options?: { padding?: number; duration?: number }) => void
  /** Enquadra uma área do canvas — usado para mostrar a matriz recém-organizada. */
  fitBounds: (
    bounds: { x: number; y: number; width: number; height: number },
    options?: { padding?: number; duration?: number },
  ) => void
  getViewport?: () => { x: number; y: number; zoom: number }
  setViewport?: (
    viewport: { x: number; y: number; zoom: number },
    options?: { duration?: number },
  ) => void
  getNodes?: () => Node[]
  /** O que a tecla Delete chama: dispara onNodesChange/onEdgesChange com
   *  `remove` e leva junto as conexões dos blocos removidos. */
  deleteElements?: (params: {
    nodes?: Array<{ id: string }>
    edges?: Array<{ id: string }>
  }) => Promise<unknown>
  // `getNodesBounds` is generic over the node union supplied to React Flow;
  // `never[]` keeps this local mapper assignable to any concrete instance.
  getNodesBounds?: (nodes: never[]) => {
    x: number
    y: number
    width: number
    height: number
  }
}

type SafeViewportOptions = {
  flowContainerRef: RefObject<HTMLDivElement | null>
  flowInstanceRef: RefObject<FlowPositionMapper | null>
  occupancy: SurfaceOccupancy
}

/**
 * Câmera do canvas dentro da área útil: centralizar um bloco, enquadrar uma
 * área ou o canvas inteiro descontando topbar, sidebar, painéis e inspector,
 * que ficam por cima do React Flow.
 */
export function useSafeViewport({ flowContainerRef, flowInstanceRef, occupancy }: SafeViewportOptions) {
  /**
   * O React Flow ocupa o retângulo inteiro do container, mas o chrome do
   * workspace fica por cima dele. Centralizar esta medida evita que cada ação
   * invente seu próprio desconto para topbar, sidebar, painéis e inspector.
   * A gaveta é irmã do container no flex root, portanto não é descontada aqui
   * uma segunda vez.
   */
  const getSafeCanvasScreenRect = useCallback(() => {
    const container = flowContainerRef.current
    if (!container) {
      return undefined
    }

    return getCanvasSafeArea(
      container.getBoundingClientRect(),
      occupancy,
      { drawerOutsideContainer: true },
    )
  }, [flowContainerRef, occupancy])

  const centerNodeInSafeArea = useCallback(
    (
      position: { x: number; y: number },
      size: { width: number; height: number },
      zoom: number,
      duration: number,
    ): Promise<boolean> | undefined => {
      const settledOrVoid = (value: Promise<boolean> | void) =>
        value instanceof Promise ? value : undefined
      const flowInstance = flowInstanceRef.current
      if (!flowInstance) {
        return undefined
      }

      const nodeCenter = {
        x: position.x + size.width / 2,
        y: position.y + size.height / 2,
      }
      const container = flowContainerRef.current
      const safeArea = getSafeCanvasScreenRect()
      if (!container || !safeArea) {
        return settledOrVoid(flowInstance.setCenter(nodeCenter.x, nodeCenter.y, { zoom, duration }))
      }

      const target = flowCenterForSafeArea(
        nodeCenter,
        container.getBoundingClientRect(),
        safeArea,
        zoom,
      )
      // A promessa resolve quando a câmera chega (o menu de link espera por
      // ela para focar o bloco novo; ver `OpenedWebpage`).
      return settledOrVoid(flowInstance.setCenter(target.x, target.y, { zoom, duration }))
    },
    [flowContainerRef, flowInstanceRef, getSafeCanvasScreenRect],
  )

  /** Move um viewport já calculado pelo React Flow para o centro da área útil. */
  const shiftViewportToSafeArea = useCallback(() => {
    const flowInstance = flowInstanceRef.current
    const container = flowContainerRef.current
    const safeArea = getSafeCanvasScreenRect()
    if (
      !flowInstance?.getViewport ||
      !flowInstance.setViewport ||
      !container ||
      !safeArea
    ) {
      return
    }

    const offset = safeViewportOffset(container.getBoundingClientRect(), safeArea)
    if (Math.abs(offset.x) < 0.5 && Math.abs(offset.y) < 0.5) {
      return
    }

    const current = flowInstance.getViewport()
    flowInstance.setViewport(
      { ...current, x: current.x + offset.x, y: current.y + offset.y },
      { duration: 0 },
    )
  }, [flowContainerRef, flowInstanceRef, getSafeCanvasScreenRect])

  const setSafeViewportForBounds = useCallback(
    (
      bounds: { x: number; y: number; width: number; height: number },
      duration: number,
    ) => {
      const flowInstance = flowInstanceRef.current
      const container = flowContainerRef.current
      const safeArea = getSafeCanvasScreenRect()
      if (!flowInstance || !container || !safeArea || !flowInstance.setViewport) {
        return false
      }

      const viewport = viewportForSafeArea(
        bounds,
        container.getBoundingClientRect(),
        safeArea,
        { padding: 0.15, minZoom: 0.05, maxZoom: 2 },
      )
      if (!viewport) {
        return false
      }

      flowInstance.setViewport(viewport, { duration })
      return true
    },
    [flowContainerRef, flowInstanceRef, getSafeCanvasScreenRect],
  )

  const fitCanvasViewSafely = useCallback(
    (duration = 240) => {
      const flowInstance = flowInstanceRef.current
      if (!flowInstance) {
        return
      }

      // React Flow resolve a promise quando a animação termina. O fallback
      // para `void` mantém o mapper pequeno e permite os doubles dos testes.
      const bounds =
        flowInstance.getNodes && flowInstance.getNodesBounds
          ? flowInstance.getNodesBounds(flowInstance.getNodes() as never[])
          : undefined
      if (bounds && setSafeViewportForBounds(bounds, duration)) {
        return
      }

      Promise.resolve(flowInstance.fitView({ padding: 0.15, duration })).then(
        shiftViewportToSafeArea,
      )
    },
    [flowInstanceRef, setSafeViewportForBounds, shiftViewportToSafeArea],
  )

  const fitBoundsSafely = useCallback(
    (
      bounds: { x: number; y: number; width: number; height: number },
      duration: number,
    ) => {
      const flowInstance = flowInstanceRef.current
      if (!flowInstance) {
        return
      }

      if (setSafeViewportForBounds(bounds, duration)) {
        return
      }

      Promise.resolve(
        flowInstance.fitBounds(bounds, { padding: 0.1, duration }),
      ).then(shiftViewportToSafeArea)
    },
    [flowInstanceRef, setSafeViewportForBounds, shiftViewportToSafeArea],
  )

  return {
    centerNodeInSafeArea,
    fitBoundsSafely,
    fitCanvasViewSafely,
    getSafeCanvasScreenRect,
  }
}
