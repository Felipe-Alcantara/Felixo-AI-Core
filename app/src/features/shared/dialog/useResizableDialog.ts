import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  DIALOG_VIEWPORT_MARGIN,
  clampDialogSize,
  clearDialogSize,
  readDialogSize,
  resizeCentered,
  swallowNextClick,
  writeDialogSize,
  type DialogAxes,
  type DialogSize,
} from './dialog-sizing'

export type ResizableDialog<T extends HTMLElement = HTMLElement> = {
  /** Vai na moldura do modal (o elemento que tem a borda arredondada). */
  /** Espalhar na moldura: `<section {...dialog.frameProps}>`. Sem ajuste, só a ref (nenhum estilo inline). */
  frameProps: { ref: (node: T | null) => void; style?: CSSProperties }
  resizing: boolean
  startResize: (event: React.MouseEvent, axes: DialogAxes) => void
  /** Teclado: muda o tamanho em passos, nos eixos pedidos. */
  resizeBy: (delta: { dx: number; dy: number }, axes: DialogAxes) => void
  /** Volta ao tamanho original do modal. */
  reset: () => void
}

const viewport = () => ({ width: window.innerWidth, height: window.innerHeight })

/**
 * Tamanho do modal, ajustável nos dois eixos e lembrado por `dialogId`.
 *
 * Chamar ANTES de qualquer `return null` antecipado do componente. Sem ajuste
 * não há estilo inline nenhum: o modal continua exatamente como era. Depois do
 * primeiro arrasto o tamanho vira fixo, sempre dentro da janela (também quando
 * a janela encolhe). O ponto de partida do arrasto é o tamanho REAL medido no
 * DOM, para o modal não "pular".
 */
export function useResizableDialog<T extends HTMLElement = HTMLElement>(dialogId: string): ResizableDialog<T> {
  const frameNode = useRef<T | null>(null)
  // Ref por função: quem usa o hook só recebe funções e valores, nunca um objeto ref.
  const bindFrame = useCallback((node: T | null) => {
    frameNode.current = node
  }, [])
  const [size, setSize] = useState<DialogSize | null>(() => readDialogSize(window.localStorage, dialogId, viewport()))
  const [resizing, setResizing] = useState(false)
  const sizeRef = useRef(size)
  useEffect(() => {
    sizeRef.current = size
  }, [size])
  const drag = useRef<{ x: number; y: number; start: DialogSize; axes: DialogAxes } | null>(null)

  useEffect(() => {
    function onViewportResize() {
      setSize((current) => (current === null ? null : clampDialogSize(current, viewport())))
    }
    window.addEventListener('resize', onViewportResize)
    return () => window.removeEventListener('resize', onViewportResize)
  }, [])

  useEffect(() => {
    function stopDragging() {
      drag.current = null
      setResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    function onMouseMove(event: MouseEvent) {
      const current = drag.current
      if (!current) return
      setSize(resizeCentered(current.start, { dx: event.clientX - current.x, dy: event.clientY - current.y }, current.axes, viewport()))
    }
    function onMouseUp() {
      if (!drag.current) return
      stopDragging()
      // O clique que sucede o soltar do mouse chegaria ao fundo e fecharia o modal.
      swallowNextClick(window)
      if (sizeRef.current) writeDialogSize(window.localStorage, dialogId, sizeRef.current)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      if (drag.current) stopDragging()
    }
  }, [dialogId])

  const measure = useCallback((): DialogSize => {
    if (sizeRef.current) return sizeRef.current
    const frame = frameNode.current
    return frame ? { width: frame.offsetWidth, height: frame.offsetHeight } : { width: 0, height: 0 }
  }, [])

  const startResize = useCallback((event: React.MouseEvent, axes: DialogAxes) => {
    event.preventDefault()
    event.stopPropagation()
    drag.current = { x: event.clientX, y: event.clientY, start: measure(), axes }
    setResizing(true)
    document.body.style.cursor = axes.horizontal && axes.vertical ? 'nwse-resize' : axes.horizontal ? 'ew-resize' : 'ns-resize'
    document.body.style.userSelect = 'none'
  }, [measure])

  const resizeBy = useCallback(
    (delta: { dx: number; dy: number }, axes: DialogAxes) => {
      const next = resizeCentered(measure(), delta, axes, viewport())
      setSize(next)
      writeDialogSize(window.localStorage, dialogId, next)
    },
    [measure, dialogId],
  )

  const reset = useCallback(() => {
    clearDialogSize(window.localStorage, dialogId)
    setSize(null)
  }, [dialogId])

  const margin = `${2 * DIALOG_VIEWPORT_MARGIN}px`
  const frameStyle: CSSProperties | undefined = size
    ? {
        width: size.width,
        height: size.height,
        maxWidth: `calc(100vw - ${margin})`,
        maxHeight: `calc(100dvh - ${margin})`,
      }
    : undefined

  return { frameProps: { ref: bindFrame, style: frameStyle }, resizing, startResize, resizeBy, reset }
}
