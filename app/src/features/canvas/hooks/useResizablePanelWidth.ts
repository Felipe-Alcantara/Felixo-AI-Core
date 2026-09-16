import { useCallback, useEffect, useRef, useState } from 'react'
import { useCanvasSurfaces } from './canvas-surfaces-context'
import {
  COLLAPSED_SURFACE_WIDTH,
  PANEL_MIN_WIDTH,
  panelWidthLimit,
} from '../services/canvas-surfaces'
import {
  clampPanelWidth,
  clearPanelWidth,
  getDefaultPanelWidth,
  hasPanelWidth,
  readPanelWidth,
  writePanelWidth,
  type PanelSize,
} from '../services/panel-sizing'

const PANEL_MIN = PANEL_MIN_WIDTH

type ResizablePanelWidth = {
  width: number
  minWidth: number
  maxWidth: number
  resizing: boolean
  /** Começa o arrasto na borda direita do painel. */
  startResize: (event: React.MouseEvent) => void
  resizeBy: (delta: number) => void
  /** Volta à largura sugerida para a tela atual. */
  reset: () => void
}

/**
 * Largura do painel: sugerida pela tela, ajustável no arrasto e lembrada.
 *
 * Enquanto a pessoa não arrastar, a largura acompanha o viewport — abrir o app
 * num monitor grande e depois no notebook não deixa o painel desproporcional.
 * Depois do primeiro arrasto vale a escolha dela, só trazida para dentro da
 * faixa quando a tela não comporta mais aquele tamanho.
 *
 * Este hook só PEDE a largura (`reportPanelWidth`, sem corte nenhum) e lê de
 * volta o que `CanvasSurfacesProvider` decidiu depois de conferir a gaveta
 * também (`occupancy.panel`) — nunca calcula o próprio teto sozinho. Fazer
 * isso aqui (lendo a largura já relatada da gaveta pra montar um teto local)
 * era a causa de um bug real: painel e gaveta entravam num looping de se
 * espremer mutuamente sem nunca convergir, porque cada um calculava o teto a
 * partir do valor JÁ CORTADO do outro. Ver `splitHorizontalSpace` em
 * `canvas-surfaces.ts`.
 */
export function useResizablePanelWidth(
  panelId: string,
  size: PanelSize,
  collapsed = false,
): ResizablePanelWidth {
  const { occupancy, reportPanelWidth, viewport } = useCanvasSurfaces()
  const [width, setWidth] = useState(() =>
    readPanelWidth(window.localStorage, panelId, window.innerWidth, size),
  )
  const [resizing, setResizing] = useState(false)
  // Sem isto, redimensionar a janela sobrescreveria a largura escolhida.
  const customized = useRef(hasPanelWidth(window.localStorage, panelId))
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)
  const latestClientX = useRef<number | null>(null)
  const resizeFrame = useRef<number | null>(null)

  const limit = panelWidthLimit(viewport.width, occupancy, PANEL_MIN)

  useEffect(() => {
    reportPanelWidth(collapsed ? COLLAPSED_SURFACE_WIDTH : width)
    return () => reportPanelWidth(0)
  }, [collapsed, reportPanelWidth, width])

  // A largura final: o que o provider decidiu depois de conferir a gaveta —
  // nunca o que este hook pediu (`width`, acima) direto.
  const effectiveWidth = collapsed ? COLLAPSED_SURFACE_WIDTH : occupancy.panel

  useEffect(() => {
    function onViewportResize() {
      setWidth((current) =>
        customized.current
          ? clampPanelWidth(current, window.innerWidth, size)
          : getDefaultPanelWidth(window.innerWidth, size),
      )
    }

    window.addEventListener('resize', onViewportResize)
    return () => window.removeEventListener('resize', onViewportResize)
  }, [size])

  useEffect(() => {
    const cancelResizeFrame = () => {
      if (resizeFrame.current === null) {
        return
      }
      if (typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(resizeFrame.current)
      } else {
        window.clearTimeout(resizeFrame.current)
      }
      resizeFrame.current = null
    }

    const applyResize = (clientX: number) => {
      setWidth(
        Math.min(
          limit,
          clampPanelWidth(
            startWidth.current + (clientX - startX.current),
            window.innerWidth,
            size,
          ),
        ),
      )
    }

    const flushResize = () => {
      resizeFrame.current = null
      if (!dragging.current || latestClientX.current === null) {
        return
      }
      applyResize(latestClientX.current)
    }

    const scheduleResize = () => {
      if (resizeFrame.current !== null) {
        return
      }
      if (typeof window.requestAnimationFrame === 'function') {
        resizeFrame.current = window.requestAnimationFrame(flushResize)
      } else {
        resizeFrame.current = window.setTimeout(flushResize, 0)
      }
    }

    function onMouseMove(event: MouseEvent) {
      if (!dragging.current) {
        return
      }
      latestClientX.current = event.clientX
      scheduleResize()
    }

    function onMouseUp() {
      if (!dragging.current) {
        return
      }

      cancelResizeFrame()
      flushResize()
      dragging.current = false
      latestClientX.current = null
      setResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      customized.current = true
      setWidth((current) => {
        writePanelWidth(window.localStorage, panelId, current)
        return current
      })
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      cancelResizeFrame()
      latestClientX.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      if (dragging.current) {
        dragging.current = false
        setResizing(false)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [limit, panelId, size])

  const startResize = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      dragging.current = true
      setResizing(true)
      startX.current = event.clientX
      startWidth.current = Math.min(width, limit)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [limit, width],
  )

  const resizeBy = useCallback(
    (delta: number) => {
      if (collapsed) return
      const next = Math.min(
        limit,
        clampPanelWidth(width + delta, window.innerWidth, size),
      )
      customized.current = true
      setWidth(next)
      writePanelWidth(window.localStorage, panelId, next)
    },
    [collapsed, limit, panelId, size, width],
  )

  const reset = useCallback(() => {
    clearPanelWidth(window.localStorage, panelId)
    customized.current = false
    setWidth(getDefaultPanelWidth(window.innerWidth, size))
  }, [panelId, size])

  return {
    width: effectiveWidth,
    minWidth: Math.min(PANEL_MIN, limit),
    maxWidth: limit,
    resizing,
    startResize,
    resizeBy,
    reset,
  }
}
