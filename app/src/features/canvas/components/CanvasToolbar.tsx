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
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Group,
  Hand,
  LayoutGrid,
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
import { NotificationsMenu } from './NotificationsMenu'
import {
  toolbarFlyoutClass,
  toolbarFlyoutStyle,
  useToolbarFlyoutPosition,
} from './toolbar-flyout'
import type { CanvasProject } from '../hooks/useCanvasProjects'

/** Shape shared by every toolbar button; the press depth comes from the
 *  felixo-btn / felixo-btn-icon each call site adds. */
const TOOLBAR_BUTTON_SHAPE =
  'flex w-36 items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 shadow-lg ring-1 ring-white/10 hover:bg-zinc-700'

const TOOLBAR_BUTTON_CLASS = `felixo-btn ${TOOLBAR_BUTTON_SHAPE}`
const TOOLBAR_ICON_BUTTON_CLASS = `felixo-btn-icon ${TOOLBAR_BUTTON_SHAPE}`

type CanvasToolbarProps = {
  activeTool: CanvasTool | null
  onSelectTool: (tool: CanvasTool) => void
  projects: CanvasProject[]
  onAddTerminal: (options: {
    command?: string
    args?: string[]
    cwd?: string
    label: string
    planningFile?: string
  }) => void
  /** Starts several terminal configs at once — a whole agent setup in one click. */
  onAddTerminals: (
    optionsList: { command?: string; args?: string[]; cwd?: string; label: string; planningFile?: string }[],
  ) => void
  onOrganizeAgents: () => void
  agentCount: number
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
  notificationsOpen: boolean
  onToggleNotifications: () => void
  notificationCount: number
  notificationPanel?: (ready: boolean, toolsMenuOpen: boolean) => ReactNode
}

export function CanvasToolbar({
  activeTool,
  onSelectTool,
  projects,
  onAddTerminal,
  onAddTerminals,
  onOrganizeAgents,
  agentCount,
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
  notificationsOpen,
  onToggleNotifications,
  notificationCount,
  notificationPanel,
}: CanvasToolbarProps) {
  const importInputRef = useRef<HTMLInputElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [isCollapsing, setIsCollapsing] = useState(false)
  const [isExpanding, setIsExpanding] = useState(false)
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false)
  const collapseToolbar = () => {
    setToolsMenuOpen(false)
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setCollapsed(true)
      return
    }
    setIsCollapsing(true)
  }

  const expandToolbar = () => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setCollapsed(false)
      return
    }
    setIsExpanding(true)
    setCollapsed(false)
  }

  if (collapsed) {
    return (
      <div className="absolute left-4 top-4 z-10 flex items-start gap-2">
        <button
          type="button"
          onClick={expandToolbar}
          className="felixo-btn-icon flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800 text-zinc-100 shadow-lg ring-1 ring-white/10 hover:bg-zinc-700"
          title="Mostrar funções auxiliares"
          aria-label="Expandir funções auxiliares"
          aria-expanded={false}
        >
          <ChevronDown size={16} />
        </button>
        <NotificationsMenu
          open={notificationsOpen}
          notificationCount={notificationCount}
          onToggle={onToggleNotifications}
        >
          {(ready) => notificationPanel?.(ready, toolsMenuOpen)}
        </NotificationsMenu>
      </div>
    )
  }

  return (
    <div
      className={`${isCollapsing ? 'felixo-toolbar-collapsing' : isExpanding ? 'felixo-toolbar-expanding' : ''} absolute left-4 top-4 z-10 flex flex-col items-start gap-2`}
      onAnimationEnd={(event) => {
        if (
          isCollapsing &&
          event.target === event.currentTarget &&
          event.animationName === 'felixo-toolbar-collapse-root'
        ) {
          setCollapsed(true)
          setIsCollapsing(false)
        }
        if (
          isExpanding &&
          event.target === event.currentTarget &&
          event.animationName === 'felixo-toolbar-expand-root'
        ) {
          setIsExpanding(false)
        }
      }}
    >
      <button
        type="button"
        onClick={collapseToolbar}
        disabled={isCollapsing}
        className={TOOLBAR_ICON_BUTTON_CLASS}
        title="Esconder funções auxiliares"
        aria-label="Recolher funções auxiliares"
        aria-expanded={true}
      >
        <ChevronUp size={16} />
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
      <CanvasToolsMenu
        activeTool={activeTool}
        onSelect={onSelectTool}
        onOpenChange={setToolsMenuOpen}
      />
      <NotificationsMenu
        open={notificationsOpen}
        notificationCount={notificationCount}
        onToggle={onToggleNotifications}
      >
        {(ready) => notificationPanel?.(ready, toolsMenuOpen)}
      </NotificationsMenu>
      <TerminalMenu
        projects={projects}
        onAdd={onAddTerminal}
        onAddMany={onAddTerminals}
        onAddFolder={onAddFolder}
        toolsMenuOpen={toolsMenuOpen}
      />
      <button
        type="button"
        onClick={onOrganizeAgents}
        disabled={agentCount < 2}
        className={`${TOOLBAR_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-60`}
        title={
          agentCount < 2
            ? 'Adicione pelo menos dois agentes para organizá-los'
            : `Organizar ${agentCount} agentes em uma matriz`
        }
      >
        <LayoutGrid size={16} />
        Organizar
      </button>
      <ProjectsMenu
        projects={projects}
        onAddFolder={onAddFolder}
        onRunFile={onRunFile}
        toolsMenuOpen={toolsMenuOpen}
      />
      <NamedCreateButton
        icon={<StickyNote size={16} />}
        buttonLabel="Nota"
        placeholder="Nome da nota (opcional)"
        onCreate={onAddNote}
        toolsMenuOpen={toolsMenuOpen}
      />
      <NamedCreateButton
        icon={<FileText size={16} />}
        buttonLabel="Arquivo"
        placeholder="Nome do arquivo (opcional)"
        title="Bloco de arquivo .md compartilhado (agentes podem editar)"
        onCreate={onAddFile}
        toolsMenuOpen={toolsMenuOpen}
      />
      <NamedCreateButton
        icon={<Group size={16} />}
        buttonLabel="Grupo"
        placeholder="Nome do grupo (opcional)"
        onCreate={onAddGroup}
        toolsMenuOpen={toolsMenuOpen}
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
        className="felixo-btn flex w-36 items-center gap-2 rounded-lg bg-red-950/80 px-3 py-2 text-sm text-red-100 shadow-lg ring-1 ring-red-500/20 hover:bg-red-900 disabled:cursor-wait disabled:opacity-60"
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
  /** The tools menu widens the toolbar column; the popover slides over to clear it. */
  toolsMenuOpen: boolean
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
  toolsMenuOpen,
}: NamedCreateButtonProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const flyoutPosition = useToolbarFlyoutPosition({
    open,
    toolsMenuOpen,
    containerRef,
    panelRef,
    panelWidth: 224,
  })

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
    <div ref={containerRef} className="relative w-36">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`${TOOLBAR_BUTTON_CLASS} w-full`}
        title={title}
      >
        {icon}
        {buttonLabel}
      </button>

      {open && (
        <div
          ref={panelRef}
          style={toolbarFlyoutStyle(flyoutPosition)}
          className={`felixo-anim-sequential-panel ${toolbarFlyoutClass()} ${flyoutPosition ? '' : 'invisible'} w-56 rounded-lg bg-zinc-800 p-2 shadow-xl ring-1 ring-white/10`}
        >
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
            className="felixo-btn w-full rounded bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600"
          >
            Criar
          </button>
        </div>
      )}
    </div>
  )
}
