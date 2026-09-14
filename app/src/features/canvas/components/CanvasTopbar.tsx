import { ChevronDown, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react'
import { FelixoLockup } from '../../shared/brand/FelixoMark'

type CanvasTopbarProps = {
  onOpenSearch: () => void
  /** Rótulo da ferramenta aberta no momento (Projetos, Notas…); `null` sem nenhuma. */
  activeToolLabel?: string | null
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}

/**
 * Chrome persistente do workspace. As ações continuam delegadas ao CanvasView
 * para que busca e enquadramento mantenham exatamente os mesmos fluxos.
 */
export function CanvasTopbar({
  onOpenSearch,
  activeToolLabel = null,
  sidebarCollapsed,
  onToggleSidebar,
}: CanvasTopbarProps) {
  return (
    <header className="felixo-canvas-topbar" aria-label="Barra do workspace" data-felixo-region="topbar">
      <div className="felixo-topbar-ambient" aria-hidden="true">
        <svg viewBox="0 0 1600 96" preserveAspectRatio="none" focusable="false">
          <path d="M80 -22 C310 4 360 82 620 72 S1000 4 1290 36 S1490 92 1680 58" />
          <path d="M360 -24 C540 26 710 34 900 16 S1240 -6 1510 42" />
          <path d="M1130 104 C1260 42 1360 44 1510 10 S1630 -12 1690 -24" />
          <g>
            <circle cx="474" cy="66" r="2.2" />
            <circle cx="1055" cy="18" r="1.8" />
            <circle cx="1394" cy="48" r="2.1" />
            <circle cx="1516" cy="8" r="1.5" />
          </g>
        </svg>
      </div>

      <div className="felixo-topbar-brand">
        <FelixoLockup size={18} />
      </div>
      <span className="felixo-topbar-divider" aria-hidden="true" />

      <button
        type="button"
        className="felixo-topbar-sidebar-toggle felixo-btn-icon"
        onClick={onToggleSidebar}
        title={sidebarCollapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
        aria-label={sidebarCollapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
        aria-pressed={sidebarCollapsed}
      >
        {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
      </button>

      <div className="felixo-topbar-context" aria-label="Contexto atual">
        <span>Canvas</span>
        <ChevronDown size={13} aria-hidden="true" />
        {activeToolLabel && <span className="felixo-topbar-context-tool">{activeToolLabel}</span>}
      </div>

      <button
        type="button"
        className="felixo-command-trigger"
        onClick={onOpenSearch}
        title="Pesquisar no canvas ou executar comando"
      >
        <Search size={16} aria-hidden />
        <span>Pesquisar no canvas ou executar comando…</span>
      </button>

    </header>
  )
}
