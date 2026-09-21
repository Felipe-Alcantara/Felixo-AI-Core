import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import {
  PANEL_MIN_HEIGHT,
  clampPanelHeight,
  clearPanelHeight,
  getPanelMaxHeight,
  readPanelHeight,
  writePanelHeight,
} from '../services/panel-sizing'

type ResizablePanelHeight = {
  /** Altura escolhida; `null` = a pessoa nunca ajustou (o painel segue a altura do conteúdo). */
  height: number | null
  minHeight: number
  maxHeight: number
  resizing: boolean
  /** Começa o arrasto na borda inferior do painel. */
  startResize: (event: React.MouseEvent) => void
  resizeBy: (delta: number) => void
  /** Volta à altura do conteúdo. */
  reset: () => void
}

/**
 * Altura do painel, ajustável na vertical e lembrada por painel.
 *
 * Diferente da largura (`useResizablePanelWidth`), este hook NÃO fala com o
 * coordenador de superfícies: o painel ancora no topo e só concorre com as
 * outras superfícies pela largura. A altura tem o mesmo teto que o painel já
 * respeitava (`getPanelMaxHeight`), então esticar na vertical não cria uma
 * posição que ele não pudesse ocupar — e por isso não há como reabrir o loop
 * de painel × gaveta de 12/09 (ver `splitHorizontalSpace`).
 *
 * Sem ajuste, a altura continua sendo a do conteúdo (`null`); só depois do
 * primeiro arrasto ela vira um valor fixo. O ponto de partida do arrasto é a
 * altura REAL medida no DOM, para o painel não "pular" ao começar.
 */
export function useResizablePanelHeight(
  panelId: string,
  panelRef: RefObject<HTMLElement | null>,
): ResizablePanelHeight {
  const [height, setHeight] = useState<number | null>(() =>
    readPanelHeight(window.localStorage, panelId, window.innerHeight),
  )
  const [resizing, setResizing] = useState(false)
  const [maxHeight, setMaxHeight] = useState(() => getPanelMaxHeight(window.innerHeight))
  const dragging = useRef(false)
  const startY = useRef(0)
  const startHeight = useRef(0)
  const latestClientY = useRef<number | null>(null)
  const frame = useRef<number | null>(null)

  // A janela mudou de tamanho: a altura escolhida volta para dentro da faixa.
  useEffect(() => {
    function onViewportResize() {
      setMaxHeight(getPanelMaxHeight(window.innerHeight))
      setHeight((current) => (current === null ? null : clampPanelHeight(current, window.innerHeight)))
    }
    window.addEventListener('resize', onViewportResize)
    return () => window.removeEventListener('resize', onViewportResize)
  }, [])

  useEffect(() => {
    const cancelFrame = () => {
      if (frame.current === null) return
      if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame.current)
      else window.clearTimeout(frame.current)
      frame.current = null
    }

    const apply = () => {
      frame.current = null
      if (!dragging.current || latestClientY.current === null) return
      setHeight(clampPanelHeight(startHeight.current + (latestClientY.current - startY.current), window.innerHeight))
    }

    function onMouseMove(event: MouseEvent) {
      if (!dragging.current) return
      latestClientY.current = event.clientY
      if (frame.current !== null) return
      frame.current =
        typeof window.requestAnimationFrame === 'function'
          ? window.requestAnimationFrame(apply)
          : window.setTimeout(apply, 0)
    }

    function onMouseUp() {
      if (!dragging.current) return
      cancelFrame()
      apply()
      dragging.current = false
      latestClientY.current = null
      setResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setHeight((current) => {
        if (current !== null) writePanelHeight(window.localStorage, panelId, current)
        return current
      })
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      cancelFrame()
      latestClientY.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      if (dragging.current) {
        dragging.current = false
        setResizing(false)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [panelId])

  const measure = useCallback(
    () => height ?? Math.round(panelRef.current?.getBoundingClientRect().height ?? PANEL_MIN_HEIGHT),
    [height, panelRef],
  )

  const startResize = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      dragging.current = true
      setResizing(true)
      startY.current = event.clientY
      startHeight.current = measure()
      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [measure],
  )

  const resizeBy = useCallback(
    (delta: number) => {
      const next = clampPanelHeight(measure() + delta, window.innerHeight)
      setHeight(next)
      writePanelHeight(window.localStorage, panelId, next)
    },
    [measure, panelId],
  )

  const reset = useCallback(() => {
    clearPanelHeight(window.localStorage, panelId)
    setHeight(null)
  }, [panelId])

  return {
    height,
    minHeight: Math.min(PANEL_MIN_HEIGHT, maxHeight),
    maxHeight,
    resizing,
    startResize,
    resizeBy,
    reset,
  }
}
