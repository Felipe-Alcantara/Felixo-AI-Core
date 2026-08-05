import { useRef, useState } from 'react'
import {
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  FolderGit2,
  GitBranch,
  LayoutList,
  type LucideIcon,
  Notebook,
  Search,
  Settings,
  Sparkles,
  Wrench,
} from 'lucide-react'
import { useDeferredExpansionPanel } from '../../hooks/useDeferredExpansionPanel'
import {
  toolbarFlyoutClass,
  toolbarFlyoutStyle,
  useToolbarFlyoutPosition,
} from '../toolbar-flyout'

// 'terminals' is not here on purpose — the terminals dock is always visible
// (see TerminalsPanel.tsx, rendered directly by CanvasView), not a panel you
// open/close through this menu.
export type CanvasTool =
  | 'search'
  | 'projects'
  | 'notes'
  | 'models'
  | 'prompts'
  | 'skills'
  | 'git'
  | 'settings'

type ToolEntry = { tool: CanvasTool; label: string; icon: LucideIcon }

const TOOLS: ToolEntry[] = [
  { tool: 'search', label: 'Pesquisar', icon: Search },
  { tool: 'projects', label: 'Projetos', icon: FolderGit2 },
  { tool: 'notes', label: 'Notas', icon: Notebook },
  { tool: 'models', label: 'Modelos', icon: LayoutList },
  { tool: 'prompts', label: 'Prompts', icon: Sparkles },
  { tool: 'skills', label: 'Skills', icon: BrainCircuit },
  { tool: 'git', label: 'Git', icon: GitBranch },
  { tool: 'settings', label: 'Configurações', icon: Settings },
]

type CanvasToolsMenuProps = {
  activeTool: CanvasTool | null
  onSelect: (tool: CanvasTool) => void
  onOpenChange?: (open: boolean) => void
}

/**
 * Retractable tools menu in the canvas top-left corner. Collapsed it's a single
 * button; expanded it lists the extra canvas tools brought over from the chat
 * (projects, notes, models, prompts, git).
 */
export function CanvasToolsMenu({ activeTool, onSelect, onOpenChange }: CanvasToolsMenuProps) {
  const [open, setOpen] = useState(false)
  const {
    panelReady: optionsReady,
    preparePanel,
    resetPanel,
    markPanelReady,
  } = useDeferredExpansionPanel(open)
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const flyoutPosition = useToolbarFlyoutPosition({
    open: open && optionsReady,
    toolsMenuOpen: false,
    containerRef,
    panelRef,
    panelWidth: 144,
    placement: 'below',
  })

  const toggleOpen = () => {
    if (open) {
      resetPanel()
      setOpen(false)
      onOpenChange?.(false)
      return
    }

    preparePanel()
    setOpen(true)
    onOpenChange?.(true)
  }

  return (
    <div
      ref={containerRef}
      className={`relative transition-[width] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
        open ? 'w-[18.5rem]' : 'w-36'
      }`}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === 'width' && open) {
          markPanelReady()
        }
      }}
    >
      <button
        type="button"
        onClick={toggleOpen}
        className="felixo-btn flex w-full items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 shadow-lg ring-1 ring-white/10 hover:bg-zinc-700"
        title="Ferramentas"
        aria-expanded={open}
        aria-controls="canvas-tools-options"
      >
        <Wrench size={16} />
        Ferramentas
        {open ? <ChevronUp className="ml-auto" size={14} /> : <ChevronDown className="ml-auto" size={14} />}
      </button>

      {open && optionsReady && (
        <div
          ref={panelRef}
          id="canvas-tools-options"
          style={toolbarFlyoutStyle(flyoutPosition)}
          className={`felixo-anim-sequential-panel ${toolbarFlyoutClass('below')} ${flyoutPosition ? '' : 'invisible'} flex w-36 flex-col overflow-y-auto rounded-lg bg-zinc-800 shadow-xl ring-1 ring-white/10`}
        >
          {TOOLS.map(({ tool, label, icon: Icon }) => (
            <button
              key={tool}
              type="button"
              onClick={() => {
                onSelect(tool)
                resetPanel()
                setOpen(false)
                onOpenChange?.(false)
              }}
              className={`felixo-btn flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-700 ${
                activeTool === tool ? 'bg-zinc-700 text-white' : 'text-zinc-200'
              }`}
            >
              <Icon size={15} className="opacity-70" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
