import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  BrainCircuit,
  Check,
  Code2,
  Download,
  Gauge,
  Folder,
  FolderCog,
  GitBranch,
  Network,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  StickyNote,
  Trash2,
} from 'lucide-react'
import { CliMark } from '../../shared/brand/CliMark'
import { cliVendor } from '../../shared/brand/cli-vendor'
import { SidebarSection } from '../../shared/components/SidebarSection'
import type { ChatSession, Model, Project } from '../types'
import { SearchPanel } from './SearchPanel'

const MIN_WIDTH = 160
const MAX_WIDTH = 480
const DEFAULT_WIDTH = 244

/**
 * A mesma linha de ação da sidebar do canvas ("Criar"): ícone, rótulo, altura
 * e realce iguais, para as duas telas lerem como um produto só. A classe
 * `felixo-sidebar-action` dá a moldura; o resto é o mesmo Tailwind de lá
 * (inclusive o `!` do hover, explicado em TOOLBAR_BUTTON_SURFACE no CanvasToolbar).
 */
const PRIMARY_ROW =
  'felixo-btn felixo-sidebar-action flex w-full items-center gap-2 rounded-md bg-transparent px-2 py-1.5 text-xs text-zinc-100 hover:bg-(--f-core-structural)!'

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
  onOpenAgentUsage: () => void
  onToggleSidebar: () => void
  onSelectSession: (session: ChatSession) => void
  onToggleProject: (project: Project) => void
  onOpenModelSettingsFor: (modelId: string) => void
  onRemoveModel: (model: Model) => void
}

/**
 * Sidebar do chat, na mesma gramática da sidebar do canvas: cabeçalho de
 * contexto com o recolher, seções em caixa alta com seta à direita, rodapé
 * com a configuração.
 *
 * Só o que se usa a cada mensagem fica aberto: novo chat, busca, projetos e
 * as conversas recentes. Configuração e ferramenta de vez em quando —
 * automações, skills, orquestrador, limites, notas, exportar, code — moram em
 * "Ferramentas", que nasce recolhida; a lista de modelos idem, porque o modelo
 * do turno se escolhe no compositor e a lista aqui é para gerenciar. Antes
 * eram treze itens e cinco modelos com botão de remover, todos expostos de uma
 * vez, e a sidebar competia com a conversa em vez de servi-la.
 */
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
  onOpenAgentUsage,
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

  const tools: { label: string; icon: ReactNode; onClick: () => void }[] = [
    { label: 'Automações', icon: <Sparkles size={14} aria-hidden="true" />, onClick: onOpenAutomations },
    { label: 'Skills', icon: <BrainCircuit size={14} aria-hidden="true" />, onClick: onOpenSkills },
    { label: 'Orquestrador', icon: <Network size={14} aria-hidden="true" />, onClick: onOpenOrchestratorSettings },
    { label: 'Limites e uso', icon: <Gauge size={14} aria-hidden="true" />, onClick: onOpenAgentUsage },
    { label: 'Notas', icon: <StickyNote size={14} aria-hidden="true" />, onClick: onOpenNotes },
    { label: 'Exportar', icon: <Download size={14} aria-hidden="true" />, onClick: onOpenExport },
    { label: 'Code', icon: <Code2 size={14} aria-hidden="true" />, onClick: onOpenCode },
  ]

  const activeProjects = projects.filter((project) => activeProjectIds.has(project.id))
  const visibleProjects = isProjectsExpanded ? projects : activeProjects
  const subtitle =
    sessions.length === 0
      ? 'Nenhuma conversa ainda'
      : `${sessions.length} ${sessions.length === 1 ? 'conversa' : 'conversas'}`

  return (
    <aside
      style={isOpen ? { width } : undefined}
      className={[
        'felixo-chat-sidebar relative flex shrink-0 flex-col overflow-hidden border-r border-white/8 bg-(--color-sidebar) text-zinc-300',
        dragging ? '' : 'transition-[width] duration-300 ease-in-out',
        'max-[920px]:hidden',
        isOpen ? '' : 'w-0 border-r-0',
      ].join(' ')}
    >
      <header className="felixo-sidebar-header">
        <div>
          <strong>Chat</strong>
          <span>{subtitle}</span>
        </div>
        <button
          type="button"
          className="felixo-btn-icon felixo-sidebar-collapse-button"
          onClick={onToggleSidebar}
          title="Recolher sidebar"
          aria-label="Recolher sidebar"
        >
          <PanelLeftClose size={16} />
        </button>
      </header>

      <div className="felixo-sidebar-scroll">
        <SidebarSection title="Conversa">
          <button type="button" onClick={onNewIdea} className={PRIMARY_ROW}>
            <Plus size={15} aria-hidden="true" />
            Novo chat
          </button>
          <button type="button" onClick={() => setIsSearchOpen(true)} className={PRIMARY_ROW}>
            <Search size={15} aria-hidden="true" />
            Pesquisar
          </button>
        </SidebarSection>

        <SidebarSection
          title="Projetos"
          count={activeProjects.length || undefined}
          action={
            <button
              type="button"
              title="Gerenciar projetos"
              aria-label="Gerenciar projetos"
              onClick={onOpenProjects}
              className="felixo-btn-icon felixo-sidebar-section-action"
            >
              <FolderCog size={13} aria-hidden="true" />
            </button>
          }
        >
          {visibleProjects.length === 0 ? (
            // Sem projeto cadastrado, o único próximo passo é cadastrar; com
            // projetos e nenhum ativo, é escolher. O placeholder já é o botão.
            <button
              type="button"
              onClick={projects.length === 0 ? onOpenProjects : () => setIsProjectsExpanded(true)}
              className="felixo-btn felixo-sidebar-tool-action felixo-sidebar-tool-quiet"
            >
              <Folder size={13} aria-hidden="true" />
              {projects.length === 0 ? 'Adicionar projeto…' : 'Escolher projetos…'}
            </button>
          ) : (
            visibleProjects.map((project) => {
              const active = activeProjectIds.has(project.id)
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onToggleProject(project)}
                  title={active ? `${project.path} — no contexto` : project.path}
                  aria-pressed={active}
                  className={`felixo-btn felixo-sidebar-tool-action felixo-sidebar-project ${active ? 'is-on' : ''}`}
                >
                  <GitBranch size={14} aria-hidden="true" />
                  <span className="truncate">{project.name}</span>
                  {active && <Check size={12} className="felixo-sidebar-project-check" aria-hidden="true" />}
                </button>
              )
            })
          )}
          {projects.length > activeProjects.length && visibleProjects.length > 0 && (
            <button
              type="button"
              onClick={() => setIsProjectsExpanded((value) => !value)}
              className="felixo-btn felixo-sidebar-tool-action felixo-sidebar-tool-quiet"
            >
              {isProjectsExpanded
                ? 'Mostrar só os ativos'
                : `Mais ${projects.length - activeProjects.length}…`}
            </button>
          )}
        </SidebarSection>

        {sessions.length > 0 && (
          <SidebarSection
            title="Recentes"
            action={
              sessions.length > 5 ? (
                <button
                  type="button"
                  title="Ver todas as conversas"
                  aria-label="Ver todas as conversas"
                  onClick={() => setIsSearchOpen(true)}
                  className="felixo-btn-icon felixo-sidebar-section-action"
                >
                  <Search size={13} aria-hidden="true" />
                </button>
              ) : undefined
            }
          >
            {sessions.slice(0, 5).map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelectSession(session)}
                title={session.title}
                className="felixo-btn felixo-sidebar-session"
              >
                <span className="felixo-sidebar-session-title">{session.title}</span>
                <span className="felixo-sidebar-session-time">
                  {formatSessionDate(session.updatedAt)}
                </span>
              </button>
            ))}
          </SidebarSection>
        )}

        <SidebarSection
          title="Ferramentas"
          defaultOpen={false}
          storageKey="felixo.chat.sidebar.tools-open"
        >
          {tools.map((tool) => (
            <button
              key={tool.label}
              type="button"
              onClick={tool.onClick}
              className="felixo-btn felixo-sidebar-tool-action"
            >
              {tool.icon}
              {tool.label}
            </button>
          ))}
        </SidebarSection>

        <SidebarSection
          title="Modelos"
          count={models.length}
          defaultOpen={false}
          storageKey="felixo.chat.sidebar.models-open"
          action={
            <button
              type="button"
              title="Configurar modelos"
              aria-label="Configurar modelos"
              onClick={onOpenModelSettings}
              className="felixo-btn-icon felixo-sidebar-section-action"
            >
              <SlidersHorizontal size={13} aria-hidden="true" />
            </button>
          }
        >
          {models.map((model) => (
            <div key={model.id} className="felixo-sidebar-model group">
              <button
                type="button"
                onClick={() => onOpenModelSettingsFor(model.id)}
                title={`${model.name} — ${model.source}`}
                className="felixo-btn felixo-sidebar-model-main"
              >
                <CliMark cliType={model.cliType} size={15} />
                <span className="felixo-sidebar-model-text">
                  <span className="felixo-sidebar-model-name">{model.name}</span>
                  {cliVendor(model.cliType) && (
                    <span className="felixo-sidebar-model-vendor">{cliVendor(model.cliType)}</span>
                  )}
                </span>
                <span className="felixo-status-dot" aria-hidden />
              </button>
              <button
                type="button"
                title={`Remover ${model.name}`}
                onClick={() => onRemoveModel(model)}
                className="felixo-btn-icon felixo-sidebar-model-remove"
              >
                <Trash2 size={12} aria-hidden="true" />
                <span className="sr-only">Remover {model.name}</span>
              </button>
            </div>
          ))}
        </SidebarSection>
      </div>

      <footer className="felixo-sidebar-footer">
        <button
          type="button"
          onClick={onOpenFelixoSettings}
          className="felixo-btn felixo-sidebar-tool-action"
        >
          <Settings size={14} aria-hidden="true" />
          Configurações
        </button>
      </footer>

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
