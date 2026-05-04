import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bot,
  BrainCircuit,
  ChevronDown,
  Code2,
  Download,
  Folder,
  GitBranch,
  MessageSquare,
  Network,
  PanelLeft,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  StickyNote,
  Trash2,
  User,
} from 'lucide-react'
import type { ChatSession, Model, Project } from '../types'
import { SearchPanel } from './SearchPanel'

const MIN_WIDTH = 160
const MAX_WIDTH = 480
const DEFAULT_WIDTH = 244

function formatSessionDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

type AppSidebarProps = {
  models: Model[]
  sessions: ChatSession[]
  projects: Project[]
  activeProjectIds: Set<string>
  isOpen: boolean
  onNewIdea: () => void
  onOpenModelSettings: () => void
  onOpenProjects: () => void
  onOpenAutomations: () => void
  onOpenSkills: () => void
  onOpenCode: () => void
  onOpenExport: () => void
  onOpenFelixoSettings: () => void
  onOpenNotes: () => void
  onOpenOrchestratorSettings: () => void
  onToggleSidebar: () => void
  onSelectSession: (session: ChatSession) => void
  onToggleProject: (project: Project) => void
  onOpenModelSettingsFor: (modelId: string) => void
  onRemoveModel: (model: Model) => void
}

export function AppSidebar({
  models,
  sessions,
  projects,
  activeProjectIds,
  isOpen,
  onNewIdea,
  onOpenModelSettings,
  onOpenProjects,
  onOpenAutomations,
  onOpenSkills,
  onOpenCode,
  onOpenExport,
  onOpenFelixoSettings,
  onOpenNotes,
  onOpenOrchestratorSettings,
  onToggleSidebar,
  onSelectSession,
  onToggleProject,
  onOpenModelSettingsFor,
  onRemoveModel,
}: AppSidebarProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [dragging, setDragging] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isProjectsExpanded, setIsProjectsExpanded] = useState(false)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return
    const delta = e.clientX - startX.current
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta))
    setWidth(next)
  }, [])

  const onMouseUp = useCallback(() => {
    isDragging.current = false
    setDragging(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  useEffect(() => {
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  function handleDragStart(e: React.MouseEvent) {
    isDragging.current = true
    setDragging(true)
    startX.current = e.clientX
    startWidth.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  function handleNavClick(label: string) {
    if (label === 'Novo chat') onNewIdea()
    else if (label === 'Pesquisar') setIsSearchOpen(true)
    else if (label === 'Projetos') setIsProjectsExpanded((v) => !v)
    else if (label === 'Automações') onOpenAutomations()
    else if (label === 'Skills') onOpenSkills()
    else if (label === 'Orquestrador') onOpenOrchestratorSettings()
    else if (label === 'Notas') onOpenNotes()
    else if (label === 'Exportar') onOpenExport()
  }

  return (
    <aside
      style={isOpen ? { width } : undefined}
      className={[
        'relative flex shrink-0 flex-col border-r border-white/[0.08] bg-[var(--color-sidebar)] text-zinc-300 overflow-hidden',
        dragging ? '' : 'transition-[width] duration-300 ease-in-out',
        'max-[920px]:hidden',
        isOpen ? '' : 'w-0 border-r-0',
      ].join(' ')}
    >
      <div className="flex h-12 items-center justify-end px-4">
        <div className="flex items-center gap-2 text-zinc-500">
          <button
            type="button"
            title="Recolher sidebar"
            onClick={onToggleSidebar}
            className="rounded p-0.5 transition hover:text-zinc-300"
          >
            <PanelLeft size={13} />
          </button>
          <button
            type="button"
            title="Pesquisar"
            onClick={() => setIsSearchOpen(true)}
            className="rounded p-0.5 transition hover:text-zinc-300"
          >
            <Search size={13} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        <nav className="space-y-0.5 px-4 pt-2 text-[13px] max-xl:px-3">
          <button
            type="button"
            onClick={() => handleNavClick('Novo chat')}
            className="flex h-7 w-full items-center gap-2 rounded-lg px-1.5 text-left text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
          >
            <Plus size={14} aria-hidden="true" />
            Novo chat
          </button>

          <button
            type="button"
            onClick={() => handleNavClick('Pesquisar')}
            className="flex h-7 w-full items-center gap-2 rounded-lg px-1.5 text-left text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
          >
            <Search size={14} aria-hidden="true" />
            Pesquisar
          </button>

          <div>
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setIsProjectsExpanded((v) => !v)}
                className="flex h-7 flex-1 items-center gap-2 rounded-lg px-1.5 text-left text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
              >
                <Folder size={14} aria-hidden="true" />
                Projetos
                <ChevronDown
                  size={11}
                  className={[
                    'ml-auto text-zinc-600 transition-transform duration-200',
                    isProjectsExpanded ? 'rotate-180' : '',
                  ].join(' ')}
                />
              </button>
              <button
                type="button"
                title="Gerenciar projetos"
                onClick={onOpenProjects}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-white/[0.06] hover:text-zinc-300"
              >
                <Plus size={12} aria-hidden="true" />
              </button>
            </div>

            {!isProjectsExpanded && activeProjectIds.size > 0 && (
              <div className="ml-3 mt-0.5 space-y-0.5 border-l border-white/[0.06] pl-3">
                {projects.filter((p) => activeProjectIds.has(p.id)).map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => onToggleProject(project)}
                    title={project.path}
                    className="flex h-6 w-full items-center gap-1.5 rounded-md bg-amber-500/15 px-1.5 text-left text-[11px] text-amber-300"
                  >
                    <GitBranch size={11} className="shrink-0" aria-hidden="true" />
                    <span className="truncate">{project.name}</span>
                  </button>
                ))}
              </div>
            )}

            {isProjectsExpanded && (
              <div className="ml-3 mt-0.5 space-y-0.5 border-l border-white/[0.06] pl-3">
                {projects.length === 0 ? (
                  <span className="block px-1.5 py-1 text-[11px] text-zinc-600">
                    Nenhum projeto selecionado
                  </span>
                ) : (
                  projects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => onToggleProject(project)}
                      title={project.path}
                      className={[
                        'flex h-6 w-full items-center gap-1.5 rounded-md px-1.5 text-left text-[11px] transition',
                        activeProjectIds.has(project.id)
                          ? 'bg-amber-500/15 text-amber-300'
                          : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300',
                      ].join(' ')}
                    >
                      <GitBranch size={11} className="shrink-0" aria-hidden="true" />
                      <span className="truncate">{project.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleNavClick('Automações')}
            className="flex h-7 w-full items-center gap-2 rounded-lg px-1.5 text-left text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
          >
            <Sparkles size={14} aria-hidden="true" />
            Automações
          </button>

          <button
            type="button"
            onClick={() => handleNavClick('Skills')}
            className="flex h-7 w-full items-center gap-2 rounded-lg px-1.5 text-left text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
          >
            <BrainCircuit size={14} aria-hidden="true" />
            Skills
          </button>

          <button
            type="button"
            onClick={() => handleNavClick('Orquestrador')}
            className="flex h-7 w-full items-center gap-2 rounded-lg px-1.5 text-left text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
          >
            <Network size={14} aria-hidden="true" />
            Orquestrador
          </button>

          <button
            type="button"
            onClick={() => handleNavClick('Notas')}
            className="flex h-7 w-full items-center gap-2 rounded-lg px-1.5 text-left text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
          >
            <StickyNote size={14} aria-hidden="true" />
            Notas
          </button>

          <button
            type="button"
            onClick={() => handleNavClick('Exportar')}
            className="flex h-7 w-full items-center gap-2 rounded-lg px-1.5 text-left text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
          >
            <Download size={14} aria-hidden="true" />
            Exportar
          </button>
        </nav>

        <div className="mt-5 px-4 max-xl:px-3">
          <div className="mb-2 flex items-center justify-between text-[11px] text-zinc-500">
            <span>Chats recentes</span>
            {sessions.length > 5 && (
              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                className="rounded px-1.5 py-0.5 transition hover:bg-white/[0.06] hover:text-zinc-300"
              >
                Ver todos
              </button>
            )}
          </div>
          <div className="space-y-1">
            {sessions.length === 0 ? (
              <div className="px-1.5 py-1 text-[11px] text-zinc-600">
                Nenhum histórico ainda
              </div>
            ) : (
              sessions.slice(0, 5).map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => onSelectSession(session)}
                  title={session.title}
                  className="flex min-h-8 w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-100"
                >
                  <MessageSquare
                    size={13}
                    aria-hidden="true"
                    className="mt-0.5 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block truncate">{session.title}</span>
                    <span className="block truncate text-[10px] text-zinc-600">
                      {formatSessionDate(session.updatedAt)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="mt-5 px-4 max-xl:px-3">
          <div className="mb-2 flex items-center justify-between text-[11px] text-zinc-500">
            <span>Modelos</span>
            <button
              type="button"
              title="Configurar modelos"
              onClick={onOpenModelSettings}
              className="flex h-6 w-6 items-center justify-center rounded-full transition hover:bg-white/[0.06] hover:text-zinc-200"
            >
              <SlidersHorizontal size={12} aria-hidden="true" />
              <span className="sr-only">Configurar modelos</span>
            </button>
          </div>
          <div className="space-y-1">
            {models.map((model) => (
              <div
                key={model.id}
                className="group flex min-h-8 w-full items-center gap-1 rounded-lg text-[12px] text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-100"
              >
                <button
                  type="button"
                  onClick={() => onOpenModelSettingsFor(model.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                >
                  <Bot size={13} aria-hidden="true" className="shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate">{model.name}</span>
                    <span className="block truncate text-[10px] text-zinc-500">
                      {model.source}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  title={`Remover ${model.name}`}
                  onClick={() => onRemoveModel(model)}
                  className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-600 opacity-0 transition hover:bg-theme-error/10 hover:text-theme-error group-hover:opacity-100 focus:opacity-100"
                >
                  <Trash2 size={12} aria-hidden="true" />
                  <span className="sr-only">Remover {model.name}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-auto border-t border-white/[0.08] px-4 py-3 max-xl:px-3">
        <button
          type="button"
          onClick={onOpenCode}
          className="mb-1 flex h-8 w-full items-center gap-2 rounded-lg px-1.5 text-left text-[12px] text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
        >
          <Code2 size={13} aria-hidden="true" />
          Code
        </button>
        <button
          type="button"
          onClick={onOpenFelixoSettings}
          className="flex h-8 w-full items-center justify-between rounded-lg px-1.5 text-left text-[12px] text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
        >
          <span className="flex items-center gap-2">
            <User size={13} aria-hidden="true" />
            Felixo
          </span>
          <Settings size={13} aria-hidden="true" />
        </button>
      </div>

      <SearchPanel
        sessions={sessions}
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectSession={onSelectSession}
      />

      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-white/10 active:bg-white/20"
      />
    </aside>
  )
}
