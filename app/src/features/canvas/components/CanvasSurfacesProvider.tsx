import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CanvasSurfacesContext } from '../hooks/canvas-surfaces-context'
import {
  DRAWER_MIN_WIDTH,
  PANEL_MIN_WIDTH,
  dockReservedBottom,
  freeCanvasArea,
  miniMapSize,
  splitHorizontalSpace,
} from '../services/canvas-surfaces'
import { detectLiveLayoutClamp } from '../services/layout-invariants'

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
  // O QUE painel e gaveta QUEREM — sem corte nenhum. A largura final de
  // cada um (`occupancy.panel`/`occupancy.drawer`, abaixo) é calculada
  // NUMA PASSADA SÓ a partir destes dois números, nunca um lendo o valor
  // já cortado do outro — é essa referência circular que causava o painel
  // e a gaveta entrarem em looping se espremendo mutuamente (bug real,
  // reportado e reproduzido em 12/09/2026; ver `splitHorizontalSpace`).
  const [desiredPanel, setDesiredPanel] = useState(0)
  const [desiredDrawer, setDesiredDrawer] = useState(0)
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
    (width: number) => setDesiredPanel((current) => (current === width ? current : width)),
    [],
  )
  const reportDrawerWidth = useCallback(
    (width: number) => setDesiredDrawer((current) => (current === width ? current : width)),
    [],
  )
  const reportDockTop = useCallback(
    (top: number) => setDockTop((current) => (current === top ? current : top)),
    [],
  )

  const { panel, drawer } = useMemo(
    () =>
      splitHorizontalSpace(
        viewport.width,
        toolbarWidth,
        desiredPanel,
        PANEL_MIN_WIDTH,
        desiredDrawer,
        DRAWER_MIN_WIDTH,
      ),
    [desiredDrawer, desiredPanel, toolbarWidth, viewport.width],
  )

  // Diagnóstico do clamp: só a transição pra um estado clampado vira log —
  // nunca a cada render (o comentário na task de origem foi explícito sobre
  // isso). `lastLoggedRule` guarda a regra do último clamp já registrado;
  // sair do clamp zera, então reentrar mais tarde na MESMA regra loga de
  // novo (é uma ocorrência nova, não a mesma).
  const lastLoggedRuleRef = useRef<string | null>(null)

  useEffect(() => {
    const occupancy = { toolbar: toolbarWidth, panel, drawer }
    const clamp = detectLiveLayoutClamp({ viewport, occupancy, dockTop })

    if (!clamp) {
      lastLoggedRuleRef.current = null
      return
    }

    if (lastLoggedRuleRef.current === clamp.rule) {
      return
    }

    lastLoggedRuleRef.current = clamp.rule
    void window.felixo?.qaLogger
      ?.log({
        level: 'warn',
        scope: 'canvas:layout-clamp',
        message: clamp.detail,
        details: { rule: clamp.rule, viewport, occupancy, dockTop },
      })
      .catch(() => {
        // Falha ao gravar o log não pode derrubar o layout em si — na pior
        // das hipóteses, esta ocorrência específica fica sem registro.
      })
  }, [dockTop, drawer, panel, toolbarWidth, viewport])

  const value = useMemo(() => {
    const occupancy = { toolbar: toolbarWidth, panel, drawer }
    // Distância do topo do dock até o fim do viewport: a mesma medida que
    // `dockReservedBottom` usa pra não deixar um node novo nascer atrás do
    // dock, aqui vira a altura que outras superfícies (notificações) também
    // precisam reservar — uma leitura só de `dockTop`, não uma segunda
    // medição via ResizeObserver como existia antes.
    const dockHeight = dockReservedBottom(viewport.height, dockTop)

    return {
      occupancy,
      viewport,
      reportPanelWidth,
      reportDrawerWidth,
      dockTop,
      reportDockTop,
      dockHeight,
      minimap: miniMapSize(freeCanvasArea(viewport, occupancy).width),
    }
  }, [
    dockTop,
    drawer,
    panel,
    reportDockTop,
    reportDrawerWidth,
    reportPanelWidth,
    toolbarWidth,
    viewport,
  ])

  return (
    <CanvasSurfacesContext.Provider value={value}>
      {children}
    </CanvasSurfacesContext.Provider>
  )
}
