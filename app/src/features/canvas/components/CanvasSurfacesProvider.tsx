import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { CanvasSurfacesContext } from '../hooks/canvas-surfaces-context'

/**
 * Mantém quem está ocupando qual pedaço da tela do canvas.
 *
 * As superfícies flutuantes eram dimensionadas isoladamente, cada uma com o
 * viewport inteiro como referência — por isso se cobriam. Aqui elas publicam
 * a largura que estão usando e leem a dos outros, de modo que crescer uma
 * encolhe a outra em vez de passar por cima.
 */
export function CanvasSurfacesProvider({
  toolbarWidth,
  children,
}: {
  /** Coluna da barra de ferramentas, que nunca é coberta. */
  toolbarWidth: number
  children: ReactNode
}) {
  const [panel, setPanel] = useState(0)
  const [drawer, setDrawer] = useState(0)
  const [dockTop, setDockTop] = useState(Number.POSITIVE_INFINITY)
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))

  useEffect(() => {
    function onResize() {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }

    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const reportPanelWidth = useCallback(
    (width: number) => setPanel((current) => (current === width ? current : width)),
    [],
  )
  const reportDrawerWidth = useCallback(
    (width: number) => setDrawer((current) => (current === width ? current : width)),
    [],
  )
  const reportDockTop = useCallback(
    (top: number) => setDockTop((current) => (current === top ? current : top)),
    [],
  )

  const value = useMemo(
    () => ({
      occupancy: { toolbar: toolbarWidth, panel, drawer },
      viewport,
      reportPanelWidth,
      reportDrawerWidth,
      dockTop,
      reportDockTop,
    }),
    [
      dockTop,
      drawer,
      panel,
      reportDockTop,
      reportDrawerWidth,
      reportPanelWidth,
      toolbarWidth,
      viewport,
    ],
  )

  return (
    <CanvasSurfacesContext.Provider value={value}>
      {children}
    </CanvasSurfacesContext.Provider>
  )
}
