import { Lock, Maximize, Minus, Plus, Unlock } from 'lucide-react'
import { Panel, useReactFlow } from '@xyflow/react'

type CanvasZoomPillProps = {
  /** Zoom real, já em porcentagem (mesma fonte da topbar e da status bar). */
  zoomPercent: number
  /** Trava/destrava arrastar e conectar — o antigo botão de interatividade. */
  locked: boolean
  onLockedChange: (locked: boolean) => void
}

/**
 * Controle de zoom no formato da prancha da marca: uma pílula horizontal
 * `− 100% +`, ancorada no canto inferior esquerdo, em vez da pilha vertical
 * padrão do React Flow.
 *
 * Enquadrar e travar continuam aqui, do lado direito da pílula: a prancha só
 * desenha o zoom, mas remover as outras duas ações seria perder função para
 * ganhar semelhança — o controle nativo que isto substitui tinha as quatro.
 */
export function CanvasZoomPill({ zoomPercent, locked, onLockedChange }: CanvasZoomPillProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()

  return (
    <Panel position="bottom-left" className="felixo-zoom-pill-panel">
      <div className="felixo-zoom-pill">
        <button
          type="button"
          className="felixo-btn-icon felixo-zoom-pill-button"
          onClick={() => zoomOut({ duration: 180 })}
          title="Reduzir zoom"
          aria-label="Reduzir zoom"
        >
          <Minus size={15} />
        </button>
        <span className="felixo-zoom-pill-value" aria-live="polite">
          {zoomPercent}%
        </span>
        <button
          type="button"
          className="felixo-btn-icon felixo-zoom-pill-button"
          onClick={() => zoomIn({ duration: 180 })}
          title="Aumentar zoom"
          aria-label="Aumentar zoom"
        >
          <Plus size={15} />
        </button>

        <span className="felixo-zoom-pill-divider" aria-hidden />

        <button
          type="button"
          className="felixo-btn-icon felixo-zoom-pill-button"
          onClick={() => fitView({ padding: 0.15, duration: 240 })}
          title="Enquadrar todos os blocos"
          aria-label="Enquadrar todos os blocos"
        >
          <Maximize size={14} />
        </button>
        <button
          type="button"
          className={`felixo-btn-icon felixo-zoom-pill-button ${locked ? 'is-active' : ''}`}
          onClick={() => onLockedChange(!locked)}
          title={locked ? 'Destravar o canvas' : 'Travar o canvas'}
          aria-label={locked ? 'Destravar o canvas' : 'Travar o canvas'}
          aria-pressed={locked}
        >
          {locked ? <Lock size={14} /> : <Unlock size={14} />}
        </button>
      </div>
    </Panel>
  )
}
