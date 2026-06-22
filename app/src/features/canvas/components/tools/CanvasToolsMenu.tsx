import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FolderGit2,
  GitBranch,
  LayoutList,
  type LucideIcon,
  Notebook,
  Settings,
  Sparkles,
  Wrench,
} from 'lucide-react'

export type CanvasTool = 'projects' | 'notes' | 'models' | 'prompts' | 'git' | 'settings'

type ToolEntry = { tool: CanvasTool; label: string; icon: LucideIcon }

const TOOLS: ToolEntry[] = [
  { tool: 'projects', label: 'Projetos', icon: FolderGit2 },
  { tool: 'notes', label: 'Notas', icon: Notebook },
  { tool: 'models', label: 'Modelos', icon: LayoutList },
  { tool: 'prompts', label: 'Prompts', icon: Sparkles },
  { tool: 'git', label: 'Git', icon: GitBranch },
  { tool: 'settings', label: 'Configurações', icon: Settings },
]

type CanvasToolsMenuProps = {
  activeTool: CanvasTool | null
  onSelect: (tool: CanvasTool) => void
}

/**
 * Retractable tools menu in the canvas top-left corner. Collapsed it's a single
 * button; expanded it lists the extra canvas tools brought over from the chat
 * (projects, notes, models, prompts, git).
 */
export function CanvasToolsMenu({ activeTool, onSelect }: CanvasToolsMenuProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 shadow-lg ring-1 ring-white/10 hover:bg-zinc-700"
        title="Ferramentas"
      >
        <Wrench size={16} />
        Ferramentas
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>

      {open && (
        <div className="felixo-anim-menu-in flex w-44 flex-col overflow-hidden rounded-lg bg-zinc-800 shadow-xl ring-1 ring-white/10">
          {TOOLS.map(({ tool, label, icon: Icon }) => (
            <button
              key={tool}
              type="button"
              onClick={() => onSelect(tool)}
              className={`flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-700 ${
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
