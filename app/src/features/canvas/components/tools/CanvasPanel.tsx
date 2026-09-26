import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useExitAnimation } from '../../hooks/useExitAnimation'
import { useResizablePanelHeight } from '../../hooks/useResizablePanelHeight'
import { useResizablePanelWidth } from '../../hooks/useResizablePanelWidth'
import { PANEL_EXIT_MS } from '../../services/animation-timing'
import { getPanelMaxHeight, type PanelSize } from '../../services/panel-sizing'
import { useCanvasSurfaces } from '../../hooks/canvas-surfaces-context'
import {
  COLLAPSED_SURFACE_WIDTH,
  MIN_CANVAS_STRIP,
  PANEL_MIN_WIDTH,
} from '../../services/canvas-surfaces'

type CanvasPanelProps = {
  title: string
  icon?: ReactNode
  onClose: () => void
  children: ReactNode
  /** Id fixo do elemento raiz, para quem precisa apontar pra ele de fora
   *  (ex.: `canvas-smoke.cjs` verificando onde o foco aterrissa ao abrir). */
  id?: string
  /**
   * Identidade do painel para lembrar a largura arrastada. Sem isto todos os
   * painéis dividiriam a mesma memória e ajustar um mudaria os outros.
   */
  panelId: string
  /** Porte do painel; a largura real sai dele e do tamanho da tela. */
  size?: PanelSize
  /** Superfície ampla para ferramentas que trabalham como uma página, como a tabela do Notion. */
  variant?: 'panel' | 'workspace'
  /**
   * Não é mais lido aqui: o painel se posiciona pela largura viva da sidebar
   * que o `CanvasSurfacesProvider` publica (`occupancy.toolbar`), que já
   * cobre recolhida, expandida e arrastada. Mantido na assinatura porque a
   * cadeia de painéis de ferramenta (`CanvasToolPanels.tsx` e os ~13 painéis
   * individuais) ainda repassa o valor.
   */
  toolsMenuOpen?: boolean
}

/**
 * A consistent floating panel for canvas tools (projects, notes, models…).
 * Sits over the canvas without dimming it, so the board stays visible.
 * Slides in on mount and plays a brief exit animation before unmounting.
 *
 * Opens beside the integrated navigation and stops before the elements
 * inspector. The canvas remains visible around a tool instead of becoming a
 * temporary modal surface.
 *
 * A largura acompanha a tela e pode ser ajustada arrastando a borda direita —
 * antes era um valor fixo em rem por painel, o que num notebook de 1366px
 * cobria metade do canvas. A altura também deixa de ser `80vh` fixo e passa a
 * reservar topo e rodapé, para o painel não encostar nos dois extremos.
 */
export function CanvasPanel({
  title,
  icon,
  onClose,
  children,
  panelId,
  id,
  size = 'sm',
  variant = 'panel',
}: CanvasPanelProps) {
  const { closing, close } = useExitAnimation(PANEL_EXIT_MS, onClose)
  const [collapsed, setCollapsed] = useState(false)
  const { width, minWidth, maxWidth, resizing, startResize, resizeBy, reset } =
    useResizablePanelWidth(panelId, size, collapsed)
  const { occupancy, reportPanelWidth, viewport } = useCanvasSurfaces()
  const panelRef = useRef<HTMLDivElement>(null)
  const heightResize = useResizablePanelHeight(panelId, panelRef)
  const headingId = useId()
  const contentId = useId()
  const isWorkspace = variant === 'workspace'
  // Topo e rodapé já reservados por `getPanelMaxHeight` (ver panel-sizing.ts):
  // o painel nunca precisou de um segundo teto vindo do inspector — ele fica
  // à direita, não embaixo, então não disputa altura com o painel esquerdo.
  const maxHeight = useViewportPanelHeight()
  const workspaceWidth = Math.max(
    PANEL_MIN_WIDTH,
    viewport.width -
      occupancy.toolbar -
      occupancy.inspector -
      WORKSPACE_SIDE_GAP * 2 -
      MIN_CANVAS_STRIP,
  )

  useEffect(() => {
    if (!isWorkspace) return undefined
    reportPanelWidth(collapsed ? COLLAPSED_SURFACE_WIDTH : workspaceWidth)
    return () => reportPanelWidth(0)
  }, [collapsed, isWorkspace, reportPanelWidth, workspaceWidth])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const active = document.activeElement
    if (!(active instanceof HTMLElement) || !panel.contains(active)) panel.focus()
  }, [])

  const onHeightResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Home') {
      event.preventDefault()
      heightResize.reset()
      return
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const direction = event.key === 'ArrowDown' ? 1 : -1
    heightResize.resizeBy(direction * (event.shiftKey ? 80 : 24))
  }

  const onResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Home') {
      event.preventDefault()
      reset()
      return
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const direction = event.key === 'ArrowRight' ? 1 : -1
    resizeBy(direction * (event.shiftKey ? 80 : 24))
  }

  return (
    <div
      ref={panelRef}
      id={id}
      role="region"
      aria-labelledby={headingId}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault()
          event.stopPropagation()
          close()
        }
      }}
      style={{
        left: `calc(1rem + ${occupancy.toolbar}px)`,
        width: collapsed
          ? COLLAPSED_SURFACE_WIDTH
          : isWorkspace
            ? Math.min(width, workspaceWidth)
            : width,
        right:
          isWorkspace && !collapsed
            ? `${occupancy.inspector + WORKSPACE_SIDE_GAP}px`
            : undefined,
        maxWidth: isWorkspace
          ? undefined
          : `${Math.max(PANEL_MIN_WIDTH, viewport.width - occupancy.toolbar - occupancy.inspector - WORKSPACE_SIDE_GAP * 2)}px`,
        maxHeight,
        // Workspace é página: ocupa a altura toda, e com ela definida os
        // filhos conseguem `height: 100%` e rolar cada coluna por dentro.
        // Só com max-height a altura fica "auto" e a rolagem interna nunca
        // acontece — a tela inteira do painel rola, com cabeçalho e tudo.
        //
        // Painel comum: altura do conteúdo até o teto — ou a que a pessoa
        // escolheu arrastando a borda de baixo. Recolhido, volta ao automático.
        height: isWorkspace ? maxHeight : collapsed ? undefined : (heightResize.height ?? undefined),
      }}
      data-felixo-canvas-panel={panelId}
      className={`absolute z-20 flex max-w-[calc(100vw-2rem)] flex-col overflow-hidden border border-white/10 bg-zinc-900 shadow-2xl focus-within:z-30 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-sky-400 ${
        isWorkspace ? 'top-4 rounded-xl' : 'top-16 rounded-lg'
      } ${
        resizing
          ? ''
          : 'transition-[left] duration-180 ease-[cubic-bezier(0.16,1,0.3,1)]'
      } ${closing ? 'felixo-anim-panel-out' : 'felixo-anim-panel-in'}`}
    >
      <div className={`flex items-center justify-between border-b border-white/10 ${collapsed ? 'flex-col gap-2 px-1 py-2' : isWorkspace ? 'px-4 py-3' : 'px-3 py-2'}`}>
        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          className="felixo-btn-icon shrink-0 rounded-sm p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-sky-400!"
          aria-label={collapsed ? `Expandir painel ${title}` : `Recolher painel ${title}`}
          aria-expanded={!collapsed}
          aria-controls={contentId}
          title={collapsed ? 'Expandir painel' : 'Recolher painel'}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
        <h2
          id={headingId}
          className="flex min-w-0 items-center gap-2 text-sm font-medium text-zinc-100"
          aria-label={title}
          title={title}
        >
          {icon ?? (collapsed && title.slice(0, 1))}
          {!collapsed && title}
        </h2>
        <button
          type="button"
          onClick={close}
          className="felixo-btn-icon rounded-sm p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          aria-label={`Fechar painel ${title}`}
        >
          <X size={15} />
        </button>
      </div>
      <div
        id={contentId}
        hidden={collapsed}
        className={`min-h-0 flex-1 overflow-auto overscroll-contain ${isWorkspace ? 'p-4' : 'p-3'}`}
      >
        {children}
      </div>

      {/* Borda de arrasto. O duplo clique devolve a largura sugerida para a
          tela atual, que é a saída de quem arrastou longe demais. */}
      {!isWorkspace && !collapsed && (
        <div
          onMouseDown={startResize}
          onDoubleClick={reset}
          onKeyDown={onResizeKeyDown}
          role="separator"
          aria-label={`Redimensionar painel ${title}`}
          aria-orientation="vertical"
          aria-valuenow={width}
          aria-valuemin={minWidth}
          aria-valuemax={maxWidth}
          aria-description="Use as setas para ajustar e Home para restaurar o tamanho padrão."
          tabIndex={0}
          title="Arraste para redimensionar; dois cliques para o tamanho padrão"
          className={`felixo-resize-handle ${resizing ? 'is-resizing' : ''}`}
        />
      )}

      {/* Borda de baixo: altura. Setas ajustam, Home devolve a altura do
          conteúdo. O limite é o mesmo teto que o painel já respeitava. */}
      {!isWorkspace && !collapsed && (
        <div
          onMouseDown={heightResize.startResize}
          onDoubleClick={heightResize.reset}
          onKeyDown={onHeightResizeKeyDown}
          role="separator"
          aria-label={`Redimensionar altura do painel ${title}`}
          aria-orientation="horizontal"
          aria-valuenow={heightResize.height ?? undefined}
          aria-valuemin={heightResize.minHeight}
          aria-valuemax={heightResize.maxHeight}
          aria-description="Use as setas para cima e para baixo para ajustar e Home para voltar à altura do conteúdo."
          tabIndex={0}
          title="Arraste para ajustar a altura; dois cliques para a altura do conteúdo"
          data-felixo-panel-height-handle={panelId}
          className={`felixo-resize-handle felixo-resize-handle--horizontal ${heightResize.resizing ? 'is-resizing' : ''}`}
        />
      )}
    </div>
  )
}

const WORKSPACE_SIDE_GAP = 16

/** Acompanha a altura da janela para o painel nunca passar do rodapé. */
function useViewportPanelHeight(): number {
  const [maxHeight, setMaxHeight] = useState(() =>
    getPanelMaxHeight(window.innerHeight),
  )

  useEffect(() => {
    function onResize() {
      setMaxHeight(getPanelMaxHeight(window.innerHeight))
    }

    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return maxHeight
}
