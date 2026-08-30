import { useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useExitAnimation } from '../../hooks/useExitAnimation'
import { useResizablePanelWidth } from '../../hooks/useResizablePanelWidth'
import { PANEL_EXIT_MS } from '../../services/animation-timing'
import { getPanelMaxHeight, type PanelSize } from '../../services/panel-sizing'
import { useCanvasSurfaces } from '../../hooks/canvas-surfaces-context'
import { toolbarColumnOffset } from '../toolbar-flyout'

type CanvasPanelProps = {
  title: string
  icon?: ReactNode
  onClose: () => void
  children: ReactNode
  /**
   * Identidade do painel para lembrar a largura arrastada. Sem isto todos os
   * painéis dividiriam a mesma memória e ajustar um mudaria os outros.
   */
  panelId: string
  /** Porte do painel; a largura real sai dele e do tamanho da tela. */
  size?: PanelSize
  /** Widens the toolbar column, so the panel slides further right to clear it. */
  toolsMenuOpen?: boolean
}

/**
 * A consistent floating panel for canvas tools (projects, notes, models…).
 * Sits over the canvas without dimming it, so the board stays visible.
 * Slides in on mount and plays a brief exit animation before unmounting.
 *
 * Opens beside the toolbar rather than on top of it: the panel and the toolbar
 * are absolute siblings sharing an origin, so it offsets right by the button
 * column's width and tracks the tools menu widening with the same transition
 * the toolbar flyouts use.
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
  size = 'sm',
  toolsMenuOpen = false,
}: CanvasPanelProps) {
  const { closing, close } = useExitAnimation(PANEL_EXIT_MS, onClose)
  const { width, resizing, startResize, reset } = useResizablePanelWidth(panelId, size)
  const { dockTop } = useCanvasSurfaces()
  const viewportHeight = useViewportPanelHeight()
  // A altura para onde o dock "Elementos" começa: antes o painel passava por
  // baixo dele e as duas superfícies disputavam os mesmos pixels.
  const maxHeight = Math.max(
    240,
    Math.min(viewportHeight, dockTop - PANEL_TOP - DOCK_GAP),
  )

  return (
    <div
      style={{
        left: `calc(1rem + ${toolbarColumnOffset(toolsMenuOpen)}px)`,
        width,
        maxHeight,
      }}
      className={`absolute top-16 z-20 flex max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-white/10 bg-zinc-900 shadow-2xl ${
        resizing
          ? ''
          : 'transition-[left] duration-[620ms] ease-[cubic-bezier(0.16,1,0.3,1)]'
      } ${closing ? 'felixo-anim-panel-out' : 'felixo-anim-panel-in'}`}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="flex items-center gap-2 text-sm font-medium text-zinc-100">
          {icon}
          {title}
        </span>
        <button
          type="button"
          onClick={close}
          className="felixo-btn-icon rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          aria-label="Fechar"
        >
          <X size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>

      {/* Borda de arrasto. O duplo clique devolve a largura sugerida para a
          tela atual, que é a saída de quem arrastou longe demais. */}
      <div
        onMouseDown={startResize}
        onDoubleClick={reset}
        title="Arraste para redimensionar; dois cliques para o tamanho padrão"
        className={`absolute right-0 top-0 h-full w-1.5 cursor-col-resize ${
          resizing ? 'bg-white/20' : 'hover:bg-white/10'
        }`}
      />
    </div>
  )
}

/** Deslocamento do topo (`top-16`) e folga até o dock, em pixels. */
const PANEL_TOP = 64
const DOCK_GAP = 12

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
