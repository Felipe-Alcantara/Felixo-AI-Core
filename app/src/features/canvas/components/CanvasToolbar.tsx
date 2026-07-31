// Barra de ações do canvas: criar blocos (com nome opcional), alternar
// seleção/pan e exportar/importar/limpar o canvas. Puramente presentacional —
// as ações chegam por props do CanvasView.
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Group,
  Hand,
  Maximize,
  MessageSquare,
  MousePointer2,
  StickyNote,
  Trash2,
  Upload,
} from 'lucide-react'
import { CanvasToolsMenu, type CanvasTool } from './tools/CanvasToolsMenu'
import { TerminalMenu } from './TerminalMenu'
import { ProjectsMenu, type RunFileOptions } from './ProjectsMenu'
import type { CanvasProject } from '../hooks/useCanvasProjects'

const TOOLBAR_BUTTON_CLASS =
  'flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 shadow-lg ring-1 ring-white/10 hover:bg-zinc-700'

type CanvasToolbarProps = {
  activeTool: CanvasTool | null
  onSelectTool: (tool: CanvasTool) => void
  projects: CanvasProject[]
  onAddTerminal: (options: {
    command?: string
    args?: string[]
    cwd?: string
    label: string
  }) => void
  onAddFolder: () => Promise<string[]>
  /** Spawns a terminal whose process IS the file running (see ProjectsMenu). */
  onRunFile: (options: RunFileOptions) => void
  onAddNote: (name?: string) => void
  onAddFile: (name?: string) => void
  onAddGroup: (name?: string) => void
  canvasMode: 'select' | 'pan'
  onToggleMode: () => void
  onFitView: () => void
  onExport: () => void
  onImportFile: (event: ChangeEvent<HTMLInputElement>) => void
  onClear: () => void
  isBusy: boolean
  isClearing: boolean
  /** Switches to the chat screen. A toolbar button, not a floating overlay —
   * canvas content (terminals) can be panned under any fixed screen corner. */
  onOpenChat: () => void
}

export function CanvasToolbar({
  activeTool,
  onSelectTool,
  projects,
  onAddTerminal,
  onAddFolder,
  onRunFile,
  onAddNote,
  onAddFile,
  onAddGroup,
  canvasMode,
  onToggleMode,
  onFitView,
  onExport,
  onImportFile,
  onClear,
  isBusy,
  isClearing,
  onOpenChat,
}: CanvasToolbarProps) {
  const importInputRef = useRef<HTMLInputElement>(null)
  const [collapsed, setCollapsed] = useState(false)

  if (collapsed) {
    return (
      <div className="absolute left-4 top-4 z-10 flex items-start gap-2">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className={TOOLBAR_BUTTON_CLASS}
          title="Mostrar funções auxiliares"
        >
          <ChevronRight size={16} />
        </button>
        <button
          type="button"
          onClick={onOpenChat}
          className={TOOLBAR_BUTTON_CLASS}
          title="Abrir chat"
        >
          <MessageSquare size={16} />
        </button>
      </div>
    )
  }

  return (
    <div className="absolute left-4 top-4 z-10 flex items-start gap-2">
      <button
        type="button"
        onClick={() => setCollapsed(true)}
        className={TOOLBAR_BUTTON_CLASS}
        title="Esconder funções auxiliares"
      >
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        onClick={onOpenChat}
        className={TOOLBAR_BUTTON_CLASS}
        title="Abrir chat"
      >
        <MessageSquare size={16} />
        Chat
      </button>
      <CanvasToolsMenu activeTool={activeTool} onSelect={onSelectTool} />
      <TerminalMenu
        projects={projects}
        onAdd={onAddTerminal}
        onAddFolder={onAddFolder}
      />
      <ProjectsMenu projects={projects} onAddFolder={onAddFolder} onRunFile={onRunFile} />
      <NamedCreateButton
        icon={<StickyNote size={16} />}
        buttonLabel="Nota"
        placeholder="Nome da nota (opcional)"
        onCreate={onAddNote}
      />
      <NamedCreateButton
        icon={<FileText size={16} />}
        buttonLabel="Arquivo"
        placeholder="Nome do arquivo (opcional)"
        title="Bloco de arquivo .md compartilhado (agentes podem editar)"
        onCreate={onAddFile}
      />
      <NamedCreateButton
        icon={<Group size={16} />}
        buttonLabel="Grupo"
        placeholder="Nome do grupo (opcional)"
        onCreate={onAddGroup}
      />

      <button
        type="button"
        onClick={onToggleMode}
        className={TOOLBAR_BUTTON_CLASS}
        title={
          canvasMode === 'select'
            ? 'Modo seleção — Q para mover a tela'
            : 'Modo mover tela — Q para selecionar'
        }
      >
        {canvasMode === 'select' ? (
          <>
            <MousePointer2 size={16} />
            Selecionar
          </>
        ) : (
          <>
            <Hand size={16} />
            Mover tela
          </>
        )}
      </button>

      <button
        type="button"
        onClick={onFitView}
        className={TOOLBAR_BUTTON_CLASS}
        title="Enquadrar todos os blocos na tela"
      >
        <Maximize size={16} />
        Ver tudo
      </button>

      <button
        type="button"
        onClick={onExport}
        disabled={isBusy}
        className={`${TOOLBAR_BUTTON_CLASS} disabled:opacity-60`}
        title="Exportar canvas para um arquivo portátil"
      >
        <Download size={16} />
        Exportar
      </button>

      <button
        type="button"
        onClick={() => importInputRef.current?.click()}
        disabled={isBusy}
        className={`${TOOLBAR_BUTTON_CLASS} disabled:opacity-60`}
        title="Importar canvas de outro computador"
      >
        <Upload size={16} />
        Importar
      </button>
      <input
        ref={importInputRef}
        type="file"
        accept=".fxcanvas,application/json"
        onChange={onImportFile}
        className="hidden"
      />

      <button
        type="button"
        onClick={onClear}
        disabled={isBusy}
        className="flex items-center gap-2 rounded-lg bg-red-950/80 px-3 py-2 text-sm text-red-100 shadow-lg ring-1 ring-red-500/20 hover:bg-red-900 disabled:cursor-wait disabled:opacity-60"
        title="Excluir todos os blocos, conexões e arquivos .md do canvas"
      >
        <Trash2 size={16} />
        {isClearing ? 'Limpando...' : 'Limpar'}
      </button>
    </div>
  )
}

type NamedCreateButtonProps = {
  icon: ReactNode
  buttonLabel: string
  placeholder: string
  title?: string
  /** Creates the block; `name` is undefined when the field is left empty. */
  onCreate: (name?: string) => void
}

/**
 * A create button that opens a small popover asking for an optional name, so
 * every block can be named at creation (better search, agents know who they
 * are). Enter (or "Criar") creates — with an empty field the default name is
 * used; Escape or clicking outside cancels.
 */
function NamedCreateButton({
  icon,
  buttonLabel,
  placeholder,
  title,
  onCreate,
}: NamedCreateButtonProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const create = () => {
    onCreate(name.trim() || undefined)
    setName('')
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={TOOLBAR_BUTTON_CLASS}
        title={title}
      >
        {icon}
        {buttonLabel}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-56 rounded-lg bg-zinc-800 p-2 shadow-xl ring-1 ring-white/10">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                create()
              } else if (event.key === 'Escape') {
                setOpen(false)
              }
            }}
            placeholder={placeholder}
            className="mb-2 w-full rounded bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-white/10 placeholder:text-zinc-500 focus:ring-sky-500/50"
          />
          <button
            type="button"
            onClick={create}
            className="w-full rounded bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600"
          >
            Criar
          </button>
        </div>
      )}
    </div>
  )
}
