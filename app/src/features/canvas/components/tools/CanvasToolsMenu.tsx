import {
  BrainCircuit,
  Download,
  FolderGit2,
  Gauge,
  Network,
  GitBranch,
  LayoutList,
  ListTodo,
  type LucideIcon,
  Notebook,
  RefreshCw,
  Sparkles,
  Terminal,
  Upload,
} from 'lucide-react'
import { preloadCanvasTool } from '../canvas-tool-preloaders'

// 'terminals' is not here on purpose — the terminals dock is always visible
// (see TerminalsPanel.tsx, rendered directly by CanvasView), not a panel you
// open/close through this menu.
//
// 'search' is not here either: Buscar sits at the top of the toolbar, where the
// most-used action of the canvas shouldn't cost two clicks.
export type CanvasTool =
  | 'search'
  | 'projects'
  | 'notes'
  | 'models'
  | 'prompts'
  | 'skills'
  | 'git'
  | 'fetchAll'
  | 'notionTasks'
  | 'agentUsage'
  | 'orchestrator'
  | 'qaLogger'
  | 'settings'

type ToolEntry = { tool: CanvasTool; label: string; icon: LucideIcon }

const TOOL_GROUPS: Array<{ label: string; tools: ToolEntry[] }> = [
  {
    label: 'Workspace',
    tools: [
      { tool: 'projects', label: 'Projetos', icon: FolderGit2 },
      { tool: 'notes', label: 'Notas', icon: Notebook },
      { tool: 'models', label: 'Modelos', icon: LayoutList },
      { tool: 'prompts', label: 'Prompts', icon: Sparkles },
      { tool: 'skills', label: 'Skills', icon: BrainCircuit },
      { tool: 'git', label: 'Git', icon: GitBranch },
    ],
  },
  {
    label: 'Operação',
    tools: [
      { tool: 'fetchAll', label: 'Fetch All', icon: RefreshCw },
      { tool: 'notionTasks', label: 'Tarefas Notion', icon: ListTodo },
      { tool: 'agentUsage', label: 'Limites e uso', icon: Gauge },
      { tool: 'orchestrator', label: 'Orquestrador', icon: Network },
      { tool: 'qaLogger', label: 'QA Logger', icon: Terminal },
    ],
  },
]

type CanvasToolsMenuProps = {
  activeTool: CanvasTool | null
  onSelect: (tool: CanvasTool) => void
  /** Saves the whole canvas to a portable file. */
  onExport: () => void
  /** Opens the file picker that restores a canvas export. */
  onImport: () => void
  /** Export/import touch the whole canvas, so they wait on any pending work. */
  isBusy?: boolean
}

/**
 * Contextual tool list rendered inside the collapsible sidebar section. The
 * section owns expansion; this component only groups and dispatches actions.
 */
export function CanvasToolsMenu({
  activeTool,
  onSelect,
  onExport,
  onImport,
  isBusy,
}: CanvasToolsMenuProps) {
  return (
    <div id="canvas-tools-options" className="felixo-sidebar-tool-list">
      {TOOL_GROUPS.map((group) => (
        <div key={group.label} className="felixo-sidebar-tool-group">
          <span className="felixo-sidebar-tool-group-label">{group.label}</span>
          {group.tools.map(({ tool, label, icon: Icon }) => (
            <button
              key={tool}
              type="button"
              onPointerEnter={() => preloadCanvasTool(tool)}
              onFocus={() => preloadCanvasTool(tool)}
              onClick={() => onSelect(tool)}
              className={`felixo-btn felixo-sidebar-tool-action ${activeTool === tool ? 'is-active' : ''}`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      ))}

      <div className="felixo-sidebar-tool-group">
        <span className="felixo-sidebar-tool-group-label">Transferência</span>
        {[
          { label: 'Exportar canvas', icon: Download, run: onExport },
          { label: 'Importar canvas', icon: Upload, run: onImport },
        ].map(({ label, icon: Icon, run }) => (
          <button
            key={label}
            type="button"
            disabled={isBusy}
            onClick={run}
            className="felixo-btn felixo-sidebar-tool-action disabled:opacity-50"
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
