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
  /** Superfície ampla para ferramentas que trabalham como uma página, como a tabela do Notion. */
  variant?: 'panel' | 'workspace'
  /**
   * Recolhida, a sidebar libera espaço à esquerda — o painel desliza pra
   * mais perto da borda pra ocupá-lo, em vez de deixar um vão parado onde a
   * navegação estava. Nome mantido por compatibilidade com o resto da
   * cadeia de painéis de ferramenta (`CanvasToolPanels.tsx` e os ~13
   * painéis individuais), que só repassam o valor sem interpretá-lo.
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
  size = 'sm',
  variant = 'panel',
  toolsMenuOpen = false,
}: CanvasPanelProps) {
  const { closing, close } = useExitAnimation(PANEL_EXIT_MS, onClose)
  const { width, resizing, startResize, reset } = useResizablePanelWidth(panelId, size)
  const { occupancy, reportPanelWidth, viewport } = useCanvasSurfaces()
  const isWorkspace = variant === 'workspace'
  // Topo e rodapé já reservados por `getPanelMaxHeight` (ver panel-sizing.ts):
  // o painel nunca precisou de um segundo teto vindo do inspector — ele fica
  // à direita, não embaixo, então não disputa altura com o painel esquerdo.
  const maxHeight = useViewportPanelHeight()

  useEffect(() => {
    if (!isWorkspace) return undefined
    const workspaceWidth = Math.max(
      0,
      viewport.width - toolbarColumnOffset(toolsMenuOpen) - occupancy.inspector - WORKSPACE_SIDE_GAP * 2,
    )
    reportPanelWidth(workspaceWidth)
    return () => reportPanelWidth(0)
  }, [isWorkspace, occupancy.inspector, reportPanelWidth, toolsMenuOpen, viewport.width])

  return (
    <div
      style={{
        left: `calc(1rem + ${toolbarColumnOffset(toolsMenuOpen)}px)`,
        width: isWorkspace ? undefined : width,
        right: isWorkspace ? `${occupancy.inspector + WORKSPACE_SIDE_GAP}px` : undefined,
        maxWidth: isWorkspace
          ? undefined
          : `${Math.max(260, viewport.width - toolbarColumnOffset(toolsMenuOpen) - occupancy.inspector - WORKSPACE_SIDE_GAP * 2)}px`,
        maxHeight,
        // Workspace é página: ocupa a altura toda, e com ela definida os
        // filhos conseguem `height: 100%` e rolar cada coluna por dentro.
        // Só com max-height a altura fica "auto" e a rolagem interna nunca
        // acontece — a tela inteira do painel rola, com cabeçalho e tudo.
        height: isWorkspace ? maxHeight : undefined,
      }}
      data-felixo-canvas-panel={panelId}
      className={`absolute z-20 flex max-w-[calc(100vw-2rem)] flex-col overflow-hidden border border-white/10 bg-zinc-900 shadow-2xl ${
        isWorkspace ? 'top-4 rounded-xl' : 'top-16 rounded-lg'
      } ${
        resizing
          ? ''
          : 'transition-[left] duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)]'
      } ${closing ? 'felixo-anim-panel-out' : 'felixo-anim-panel-in'}`}
    >
      <div className={`flex items-center justify-between border-b border-white/10 ${isWorkspace ? 'px-4 py-3' : 'px-3 py-2'}`}>
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
      <div className={`min-h-0 flex-1 overflow-auto ${isWorkspace ? 'p-4' : 'p-3'}`}>{children}</div>

      {/* Borda de arrasto. O duplo clique devolve a largura sugerida para a
          tela atual, que é a saída de quem arrastou longe demais. */}
      {!isWorkspace && (
        <div
          onMouseDown={startResize}
          onDoubleClick={reset}
          title="Arraste para redimensionar; dois cliques para o tamanho padrão"
          className={`absolute right-0 top-0 h-full w-1.5 cursor-col-resize ${
            resizing ? 'bg-white/20' : 'hover:bg-white/10'
          }`}
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
