import { useCallback, useEffect, useRef, useState } from 'react'
import {
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_WIDTH,
  sidebarWidthLimit,
} from '../services/canvas-surfaces'

const STORAGE_KEY = 'felixo:canvas:sidebar-width'

export type ResizableSidebarWidth = {
  /** Largura da sidebar expandida, já dentro da faixa permitida nesta tela. */
  width: number
  minWidth: number
  maxWidth: number
  resizing: boolean
  /** Começa o arrasto na borda direita da sidebar. */
  startResize: (event: React.MouseEvent) => void
  resizeBy: (delta: number) => void
  /** Volta à largura padrão e esquece a escolha. */
  reset: () => void
}

function clamp(width: number, viewportWidth: number): number {
  return Math.min(sidebarWidthLimit(viewportWidth), Math.max(SIDEBAR_MIN_WIDTH, width))
}

function readStoredWidth(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const value = raw === null ? Number.NaN : Number(raw)
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

function writeStoredWidth(width: number | null): void {
  try {
    if (width === null) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, String(Math.round(width)))
  } catch {
    // Sem armazenamento a largura só vale nesta sessão.
  }
}

/**
 * Largura da sidebar de navegação: arrastável pela borda direita e lembrada.
 *
 * Mora fora do `CanvasSurfacesProvider` de propósito — é este hook que
 * alimenta o `toolbarWidth` do provider, então não pode depender dele. O
 * valor devolvido já está preso à faixa da tela atual: se a janela encolher
 * a ponto de uma largura lembrada não caber mais, ela é trazida de volta,
 * sem apagar a preferência.
 */
export function useResizableSidebarWidth(): ResizableSidebarWidth {
  const [width, setWidth] = useState(() =>
    clamp(readStoredWidth() ?? SIDEBAR_WIDTH, window.innerWidth),
  )
  const [maxWidth, setMaxWidth] = useState(() => sidebarWidthLimit(window.innerWidth))
  const [resizing, setResizing] = useState(false)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)
  const latestClientX = useRef<number | null>(null)
  const frame = useRef<number | null>(null)

  useEffect(() => {
    function onViewportResize() {
      setMaxWidth(sidebarWidthLimit(window.innerWidth))
      setWidth((current) => clamp(current, window.innerWidth))
    }

    window.addEventListener('resize', onViewportResize)
    return () => window.removeEventListener('resize', onViewportResize)
  }, [])

  useEffect(() => {
    const cancelFrame = () => {
      if (frame.current === null) return
      window.cancelAnimationFrame(frame.current)
      frame.current = null
    }

    const flush = () => {
      frame.current = null
      if (!dragging.current || latestClientX.current === null) return
      setWidth(clamp(startWidth.current + (latestClientX.current - startX.current), window.innerWidth))
    }

    function onMouseMove(event: MouseEvent) {
      if (!dragging.current) return
      latestClientX.current = event.clientX
      if (frame.current === null) frame.current = window.requestAnimationFrame(flush)
    }

    function onMouseUp() {
      if (!dragging.current) return
      cancelFrame()
      flush()
      dragging.current = false
      latestClientX.current = null
      setResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setWidth((current) => {
        writeStoredWidth(current)
        return current
      })
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      cancelFrame()
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
  }, [])

  const startResize = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      dragging.current = true
      setResizing(true)
      startX.current = event.clientX
      startWidth.current = width
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [width],
  )

  const resizeBy = useCallback((delta: number) => {
    setWidth((current) => {
      const next = clamp(current + delta, window.innerWidth)
      writeStoredWidth(next)
      return next
    })
  }, [])

  const reset = useCallback(() => {
    writeStoredWidth(null)
    setWidth(clamp(SIDEBAR_WIDTH, window.innerWidth))
  }, [])

  return { width, minWidth: SIDEBAR_MIN_WIDTH, maxWidth, resizing, startResize, resizeBy, reset }
}
