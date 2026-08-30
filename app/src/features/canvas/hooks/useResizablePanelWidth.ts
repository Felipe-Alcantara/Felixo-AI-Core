import { useCallback, useEffect, useRef, useState } from 'react'
import { useCanvasSurfaces } from './canvas-surfaces-context'
import { panelWidthLimit } from '../services/canvas-surfaces'
import {
  clampPanelWidth,
  clearPanelWidth,
  getDefaultPanelWidth,
  hasPanelWidth,
  readPanelWidth,
  writePanelWidth,
  type PanelSize,
} from '../services/panel-sizing'

/** Abaixo disto o painel não mostra conteúdo útil; é onde o arrasto para. */
const PANEL_MIN_WIDTH = 260

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
  const { occupancy, viewport, reportPanelWidth } = useCanvasSurfaces()
  const [width, setWidth] = useState(() =>
    readPanelWidth(window.localStorage, panelId, window.innerWidth, size),
  )
  const [resizing, setResizing] = useState(false)
  // Sem isto, redimensionar a janela sobrescreveria a largura escolhida.
  const customized = useRef(hasPanelWidth(window.localStorage, panelId))
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  // O teto acompanha a gaveta: abrir ou alargar a gaveta encolhe o painel na
  // hora, em vez de deixar um cobrir o outro.
  const limit = panelWidthLimit(viewport.width, occupancy, PANEL_MIN_WIDTH)
  // Derivado, não guardado: a preferência da pessoa continua intacta em
  // `width`, e o teto só decide o que cabe agora. Guardar o valor já cortado
  // faria a largura escolhida se perder ao fechar a gaveta.
  const effectiveWidth = Math.min(width, limit)

  useEffect(() => {
    reportPanelWidth(effectiveWidth)
    return () => reportPanelWidth(0)
  }, [effectiveWidth, reportPanelWidth])

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
        Math.min(
          limit,
          clampPanelWidth(
            startWidth.current + (event.clientX - startX.current),
            window.innerWidth,
            size,
          ),
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
  }, [limit, panelId, size])

  const startResize = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      dragging.current = true
      setResizing(true)
      startX.current = event.clientX
      startWidth.current = effectiveWidth
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [effectiveWidth],
  )

  const reset = useCallback(() => {
    clearPanelWidth(window.localStorage, panelId)
    customized.current = false
    setWidth(Math.min(limit, getDefaultPanelWidth(window.innerWidth, size)))
  }, [limit, panelId, size])

  return { width: effectiveWidth, resizing, startResize, reset }
}
