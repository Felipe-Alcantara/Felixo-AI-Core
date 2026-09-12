import { useCallback, useEffect, useRef, useState } from 'react'
import { useCanvasSurfaces } from './canvas-surfaces-context'
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
): ResizablePanelWidth {
  const { occupancy, reportPanelWidth } = useCanvasSurfaces()
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
    reportPanelWidth(width)
    return () => reportPanelWidth(0)
  }, [width, reportPanelWidth])

  // A largura final: o que o provider decidiu depois de conferir a gaveta —
  // nunca o que este hook pediu (`width`, acima) direto.
  const effectiveWidth = occupancy.panel

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

      // Clampada só pelo próprio piso/teto absoluto (`clampPanelWidth`, que
      // não olha a gaveta) — a negociação com a gaveta acontece depois, no
      // provider, a partir do que for reportado.
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
      startWidth.current = effectiveWidth
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [effectiveWidth],
  )

  const reset = useCallback(() => {
    clearPanelWidth(window.localStorage, panelId)
    customized.current = false
    setWidth(getDefaultPanelWidth(window.innerWidth, size))
  }, [panelId, size])

  return { width: effectiveWidth, resizing, startResize, reset }
}
