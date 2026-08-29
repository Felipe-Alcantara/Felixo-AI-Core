import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clampPanelWidth,
  clearPanelWidth,
  getDefaultPanelWidth,
  hasPanelWidth,
  readPanelWidth,
  writePanelWidth,
  type PanelSize,
} from '../services/panel-sizing'

type ResizablePanelWidth = {
  width: number
  resizing: boolean
  /** Começa o arrasto na borda direita do painel. */
  startResize: (event: React.MouseEvent) => void
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
 */
export function useResizablePanelWidth(
  panelId: string,
  size: PanelSize,
): ResizablePanelWidth {
  const [width, setWidth] = useState(() =>
    readPanelWidth(window.localStorage, panelId, window.innerWidth, size),
  )
  const [resizing, setResizing] = useState(false)
  // Sem isto, redimensionar a janela sobrescreveria a largura escolhida.
  const customized = useRef(hasPanelWidth(window.localStorage, panelId))
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

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
    function onMouseMove(event: MouseEvent) {
      if (!dragging.current) {
        return
      }

      setWidth(
        clampPanelWidth(
          startWidth.current + (event.clientX - startX.current),
          window.innerWidth,
          size,
        ),
      )
    }

    function onMouseUp() {
      if (!dragging.current) {
        return
      }

      dragging.current = false
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
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [panelId, size])

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

  const reset = useCallback(() => {
    clearPanelWidth(window.localStorage, panelId)
    customized.current = false
    setWidth(getDefaultPanelWidth(window.innerWidth, size))
  }, [panelId, size])

  return { width, resizing, startResize, reset }
}
