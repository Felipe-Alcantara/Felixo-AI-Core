// Barra de ações do canvas: criar blocos (com nome opcional), alternar
// seleção/pan e exportar/importar/limpar o canvas. Puramente presentacional —
// as ações chegam por props do CanvasView.
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react'
import {
  Bell,
  ChevronDown,
  FileText,
  FolderOpen,
  Globe,
  Group,
  Hand,
  LayoutGrid,
  Maximize,
  MessageSquare,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Trash2,
} from 'lucide-react'
import { CanvasToolsMenu, type CanvasTool } from './tools/CanvasToolsMenu'
import { FelixoLockup } from '../../shared/brand/FelixoMark'
import { SidebarSection } from '../../shared/components/SidebarSection'
import { TerminalMenu } from './TerminalMenu'
import { AppVersionBadge, CheckUpdateButton, UpdateIndicator } from '../../updates/UpdateNotice'
import { CliSetupIndicator } from '../../setup/CliSetupNotice'
import { useAppVersion } from '../../updates/useAppVersion'
import type { UpdatePresentation } from '../../updates/update-presentation'
import { deveMostrarRodapeDeStatus } from './toolbar-status'
import { normalizeUrlInput } from '../services/url-utils'
import { useWebviewProfiles } from '../hooks/useWebviewProfiles'
import { FelixoSelect } from '../../shared/components/FelixoSelect'
import type { ArrangeMode } from '../services/canvas-matrix-layout'
import type { CanvasProject } from '../hooks/useCanvasProjects'
import type { NewTerminalOptions } from '../services/new-terminal-options'

/**
 * A moldura de um controle da barra: largura, canto, sombra e aro — o que
 * desenha a pílula, sem nada do que acontece dentro dela.
 *
 * Existe separada porque o controle dividido ("Organizar") é uma moldura com
 * dois botões dentro: ele precisa do contorno, mas não do fundo, do padding nem
 * do hover, que ali pertencem a cada metade. Aplicar a forma inteira e desfazer
 * o excedente depois não funciona — `p-0` não cancela `px-3 py-2`, porque o
 * Tailwind emite as utilidades de eixo depois da genérica, e o resultado era um
 * botão 16px mais alto que os vizinhos, com o rótulo 12px mais para dentro.
 */
const TOOLBAR_BUTTON_FRAME = 'w-full rounded-md'

/** A superfície clicável: fundo, cor e o realce que segue o ponteiro. */
const TOOLBAR_BUTTON_SURFACE = 'bg-transparent text-zinc-100 hover:bg-[var(--f-core-structural)]'

/** Shape shared by every toolbar button; the press depth comes from the
 *  felixo-btn / felixo-btn-icon each call site adds. */
const TOOLBAR_BUTTON_SHAPE =
  `felixo-sidebar-action flex w-full items-center gap-2 px-2 py-1.5 text-xs ${TOOLBAR_BUTTON_FRAME} ${TOOLBAR_BUTTON_SURFACE}`

const TOOLBAR_BUTTON_CLASS = `felixo-btn ${TOOLBAR_BUTTON_SHAPE}`

type CanvasToolbarProps = {
  activeTool: CanvasTool | null
  onSelectTool: (tool: CanvasTool) => void
  /** Agentes aguardando ação + atualização pendente, se houver — mostrado no
   *  sino do rail lateral. */
  notificationCount: number
  updatePresentation: UpdatePresentation
  onInstallUpdate: () => void
  /** Verifica atualização agora, oferecido quando a última verificação falhou. */
  onCheckUpdate: () => void
  projects: CanvasProject[]
  onAddTerminal: (options: NewTerminalOptions) => void
  /** Opens the existing agent configuration surface from the canvas empty state. */
  agentMenuRequest?: number
  /** Starts several terminal configs at once — a whole agent setup in one click. */
  onAddTerminals: (optionsList: NewTerminalOptions[]) => void
  onOrganizeBlocks: (mode: ArrangeMode) => void
  arrangeableCount: number
  onAddFolder: () => Promise<string[]>
  onAddFile: (name?: string) => void
  /** Abre o seletor nativo e cria um bloco apontando para o arquivo escolhido. */
  onOpenFile: () => void
  onAddGroup: (name?: string) => void
  onAddWebpage: (url: string, name?: string, profileId?: string) => void
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
  /**
   * Estado controlado: o CanvasView é quem decide se a sidebar está recolhida,
   * porque outras superfícies (painéis de ferramenta, provider de superfícies,
   * cálculo do node novo) precisam do mesmo valor pra saber quanto espaço a
   * coluna ocupa agora — uma sidebar com estado só seu deixava essas contas
   * sempre um passo atrás do que estava na tela de verdade.
   */
  sidebarCollapsed: boolean
  onSidebarCollapsedChange: (collapsed: boolean) => void
}

export function CanvasToolbar({
  activeTool,
  onSelectTool,
  notificationCount,
  updatePresentation,
  onInstallUpdate,
  onCheckUpdate,
  projects,
  onAddTerminal,
  agentMenuRequest = 0,
  onAddTerminals,
  onOrganizeBlocks,
  arrangeableCount,
  onAddFolder,
  onAddFile,
  onOpenFile,
  onAddGroup,
  onAddWebpage,
  canvasMode,
  onToggleMode,
  onFitView,
  onExport,
  onImportFile,
  onClear,
  isBusy,
  isClearing,
  onOpenChat,
  sidebarCollapsed,
  onSidebarCollapsedChange,
}: CanvasToolbarProps) {
  const importInputRef = useRef<HTMLInputElement>(null)
  const appVersion = useAppVersion()

  const toggleSidebar = () => onSidebarCollapsedChange(!sidebarCollapsed)

  return (
    <aside
      className={`felixo-workbench-sidebar ${sidebarCollapsed ? 'is-collapsed' : ''}`}
      aria-label="Navegação do canvas"
      data-felixo-region="sidebar"
    >
      <nav className="felixo-activity-rail" aria-label="Ações principais">
        {/* O icone da secao abre e fecha a propria coluna, como a barra de
            atividades de um editor: clicar de novo recolhe. O enquadramento
            continua no botao "Enquadrar", em ORGANIZAR. */}
        <ActivityRailButton
          label={sidebarCollapsed ? 'Abrir menu do canvas' : 'Fechar menu do canvas'}
          active={!sidebarCollapsed}
          expanded={!sidebarCollapsed}
          onClick={toggleSidebar}
        >
          <LayoutGrid size={18} />
        </ActivityRailButton>
        <ActivityRailButton label="Chat" onClick={onOpenChat}>
          <MessageSquare size={18} />
        </ActivityRailButton>
        <ActivityRailButton
          label="Buscar"
          onClick={() => onSelectTool('search')}
          dataCanvasToolTrigger="search"
        >
          <Search size={18} />
        </ActivityRailButton>
        <ActivityRailButton label="Projetos" onClick={() => onSelectTool('projects')}>
          <FolderOpen size={18} />
        </ActivityRailButton>
        <ActivityRailButton
          label={notificationCount > 0 ? `Notificações (${notificationCount})` : 'Notificações'}
          active={activeTool === 'notifications'}
          onClick={() => onSelectTool('notifications')}
          highlight={notificationCount > 0}
          notificationsTrigger
        >
          <Bell size={18} />
          {notificationCount > 0 && (
            <span
              className="felixo-notifications-badge pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-error)] px-1 text-[9px] font-bold text-[var(--f-core-black-deep)] ring-2 ring-[var(--f-core-black-deep)]"
              aria-hidden
            >
              {notificationCount}
            </span>
          )}
        </ActivityRailButton>
        <div className="mt-auto">
          <ActivityRailButton label="Configurações" onClick={() => onSelectTool('settings')}>
            <Settings size={18} />
          </ActivityRailButton>
          <ActivityRailButton
            label={sidebarCollapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
            onClick={toggleSidebar}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </ActivityRailButton>
        </div>
      </nav>

      <div
        className="felixo-sidebar-content"
        aria-hidden={sidebarCollapsed}
        inert={sidebarCollapsed}
      >
        {/* A marca abre a coluna, como na prancha: o produto se apresenta aqui,
            e a barra superior fica só com contexto e ações do canvas. */}
        <div className="felixo-sidebar-brand">
          <FelixoLockup size={18} />
          <button
            type="button"
            className="felixo-btn-icon felixo-sidebar-collapse-button"
            onClick={toggleSidebar}
            title="Recolher sidebar"
            aria-label="Recolher sidebar"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>
        <header className="felixo-sidebar-header">
          <div>
            <strong>Canvas</strong>
            <span>Meu canvas</span>
          </div>
        </header>

        <div className="felixo-sidebar-scroll">
          <SidebarSection title="Criar">
            <TerminalMenu
              projects={projects}
              openRequest={agentMenuRequest}
              onAdd={onAddTerminal}
              onAddMany={onAddTerminals}
              onAddFolder={onAddFolder}
            />
            <NamedCreateButton
              icon={<FileText size={16} />}
              buttonLabel="Novo bloco"
              placeholder="Nome do arquivo (opcional)"
              title="Bloco de arquivo .md compartilhado (agentes podem editar)"
              onCreate={onAddFile}
              secondaryLabel="Abrir arquivo existente…"
              secondaryTitle="Abrir um arquivo de texto do disco num bloco do canvas"
              onSecondary={onOpenFile}
            />
            <NamedCreateButton
              icon={<Group size={16} />}
              buttonLabel="Grupo"
              placeholder="Nome do grupo (opcional)"
              onCreate={onAddGroup}
            />
            <UrlCreateButton
              icon={<Globe size={16} />}
              buttonLabel="Página Web"
              onCreate={onAddWebpage}
            />
          </SidebarSection>

          <SidebarSection title="Organizar">
            <OrganizeButton
              onOrganize={onOrganizeBlocks}
              arrangeableCount={arrangeableCount}
            />
            <div className="felixo-sidebar-button-grid">
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
                {canvasMode === 'select' ? <MousePointer2 size={15} /> : <Hand size={15} />}
                {canvasMode === 'select' ? 'Selecionar' : 'Mover'}
              </button>
              <button type="button" onClick={onFitView} className={TOOLBAR_BUTTON_CLASS}>
                <Maximize size={15} />
                Enquadrar
              </button>
            </div>
          </SidebarSection>

          <SidebarSection title="Ferramentas" defaultOpen={false}>
            <CanvasToolsMenu
              activeTool={activeTool}
              onSelect={onSelectTool}
              onExport={onExport}
              onImport={() => importInputRef.current?.click()}
              isBusy={isBusy}
            />
          </SidebarSection>

          <input
            ref={importInputRef}
            type="file"
            accept=".fxcanvas,application/json"
            onChange={onImportFile}
            className="hidden"
          />
        </div>

        <footer className="felixo-sidebar-footer">
          <div className="felixo-sidebar-footer-row">
            <AppVersionBadge version={appVersion} />
            <button
              type="button"
              onClick={onClear}
              disabled={isBusy}
              className="felixo-btn felixo-sidebar-danger"
              title="Excluir todos os blocos, conexões e arquivos .md do canvas"
            >
              <Trash2 size={13} />
              {isClearing ? 'Limpando…' : 'Limpar'}
            </button>
          </div>
          {deveMostrarRodapeDeStatus({
            versao: appVersion,
            atualizacaoVisivel: updatePresentation.showIndicator,
          }) && (
            <div className="felixo-sidebar-update-status">
              <UpdateIndicator
                presentation={updatePresentation}
                onInstall={onInstallUpdate}
                onRetry={onCheckUpdate}
              />
              <CheckUpdateButton presentation={updatePresentation} onCheck={onCheckUpdate} />
              <CliSetupIndicator />
            </div>
          )}
        </footer>
      </div>
    </aside>
  )
}

function ActivityRailButton({
  label,
  active = false,
  expanded,
  onClick,
  dataCanvasToolTrigger,
  children,
  highlight = false,
  notificationsTrigger = false,
}: {
  label: string
  active?: boolean
  /**
   * Só para os botões que abrem e fecham algo. Sem isto o leitor de tela
   * anuncia um botão comum e a pessoa não sabe que ele alterna — nem em que
   * estado está. Fica opcional porque os outros botões do rail navegam, não
   * alternam, e um `aria-expanded` neles seria mentira.
  */
  expanded?: boolean
  onClick: () => void
  dataCanvasToolTrigger?: string
  children: ReactNode
  /** Pendência importante aguardando: acende um contorno pulsante em volta
   *  do botão, além do badge numérico — reservado para coisas que realmente
   *  precisam de atenção (agente parado, atualização pronta), não qualquer
   *  novidade. Respeita Modo Performance e "reduzir movimento" (ver index.css). */
  highlight?: boolean
  /** Marca este botão como o gatilho do sino de notificações, para o painel
   *  devolver o foco a ele ao fechar (ver `canvas-smoke.cjs`). */
  notificationsTrigger?: boolean
}) {
  return (
    <button
      type="button"
      className={`felixo-btn-icon felixo-activity-rail-button relative ${active ? 'is-active' : ''} ${
        highlight ? 'felixo-activity-rail-button-highlight' : ''
      }`}
      onClick={onClick}
      title={label}
      aria-label={label}
      {...(dataCanvasToolTrigger
        ? { 'data-canvas-tool-trigger': dataCanvasToolTrigger }
        : {})}
      {...(notificationsTrigger ? { 'data-notifications-trigger': true } : {})}
      {...(expanded === undefined ? {} : { 'aria-expanded': expanded })}
    >
      {children}
    </button>
  )
}


type OrganizeButtonProps = {
  onOrganize: (mode: ArrangeMode) => void
  arrangeableCount: number
}

/**
 * "Organizar", com os modos por repositório atrás de uma setinha.
 *
 * O clique no corpo do botão continua fazendo o de sempre (uma matriz só), para
 * que quem já usava não precise aprender nada. A setinha abre as três opções —
 * um botão a mais na coluna da barra custaria largura permanente por uma
 * escolha que se faz de vez em quando.
 */
function OrganizeButton({
  onOrganize,
  arrangeableCount,
}: OrganizeButtonProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const disabled = arrangeableCount < 2

  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus()
    const closeAndReturn = () => {
      setOpen(false)
      window.requestAnimationFrame(() => toggleRef.current?.focus())
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        !event.target ||
        !containerRef.current?.contains(event.target as Node)
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      closeAndReturn()
    }
    const onOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) closeAndReturn()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onOutsideClick)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onOutsideClick)
    }
  }, [open])

  const organize = (mode: ArrangeMode) => {
    setOpen(false)
    onOrganize(mode)
    window.requestAnimationFrame(() => toggleRef.current?.focus())
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {/*
        Moldura só: o fundo e o realce moram nas metades, senão passar o ponteiro
        sobre uma delas acende o controle inteiro — inclusive a borda entre as
        duas, que não faz nada. O `felixo-btn` fica aqui, não nas metades, para o
        pressionar afundar a peça toda; nelas, cada metade encolhia sozinha e
        abria fresta no meio da pílula. `overflow-hidden` recorta as metades no
        canto da moldura, dispensando arredondamento em cada uma.
      */}
      <div
        className={`${TOOLBAR_BUTTON_FRAME} flex w-full overflow-hidden ${
          disabled ? 'opacity-60' : 'felixo-btn'
        }`}
      >
        <button
          ref={toggleRef}
          type="button"
          onClick={() => organize('single')}
          disabled={disabled}
          className="felixo-btn-flat flex flex-1 items-center gap-2 bg-[var(--f-core-structural)] px-3 py-2 text-sm text-[var(--f-core-white-soft)] enabled:hover:bg-[#303030] disabled:cursor-not-allowed"
          title={
            disabled
              ? 'Adicione pelo menos dois blocos para organizá-los'
              : `Organizar ${arrangeableCount} blocos em uma matriz, na ordem do dock, mantendo os conectados lado a lado`
          }
        >
          <LayoutGrid size={16} />
          Organizar
        </button>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          disabled={disabled}
          aria-label="Modos de organização"
          aria-expanded={open}
          aria-controls="canvas-organize-modes"
          className="felixo-btn-flat flex items-center border-l border-white/10 bg-[var(--f-core-structural)] px-1.5 text-[var(--f-core-secondary)] enabled:hover:bg-[#303030] disabled:cursor-not-allowed"
          title="Modos de organização"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {open && (
        <div
          ref={panelRef}
          id="canvas-organize-modes"
          role="group"
          aria-label="Modos de organização do canvas"
          className="felixo-anim-sequential-panel felixo-sidebar-inline-panel mt-2 max-h-[calc(100vh-2rem)] w-full overflow-y-auto overscroll-contain rounded-lg bg-zinc-800 p-2 shadow-xl ring-1 ring-white/10"
        >
          <button
            type="button"
            onClick={() => organize('single')}
            className="felixo-btn w-full rounded px-2 py-1.5 text-left text-sm text-[var(--f-core-white-soft)] hover:bg-white/[0.06]"
          >
            Matriz única
            <span className="mt-0.5 block text-[11px] text-zinc-400">
              Todos os blocos numa grade só, na ordem do dock.
            </span>
          </button>
          <button
            type="button"
            onClick={() => organize('by-repository')}
            className="felixo-btn mt-1 w-full rounded px-2 py-1.5 text-left text-sm text-[var(--f-core-white-soft)] hover:bg-white/[0.06]"
          >
            Uma matriz por repositório
            <span className="mt-0.5 block text-[11px] text-zinc-400">
              Uma faixa por pasta de trabalho; blocos sem pasta ficam por último.
            </span>
          </button>
          <button
            type="button"
            onClick={() => organize('by-repository-row')}
            className="felixo-btn mt-1 w-full rounded px-2 py-1.5 text-left text-sm text-[var(--f-core-white-soft)] hover:bg-white/[0.06]"
          >
            Uma linha por pasta
            <span className="mt-0.5 block text-[11px] text-zinc-400">
              Uma linha lado a lado por pasta de trabalho; blocos sem pasta ficam por último.
            </span>
          </button>
        </div>
      )}
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
  /**
   * Ação alternativa oferecida no mesmo popover — para "Arquivo", abrir um
   * arquivo que já existe. Fica junto de "Criar" porque as duas respondem à
   * mesma intenção ("quero um bloco de arquivo") e separá-las em dois botões
   * da barra faria a coluna crescer por uma diferença que só importa depois.
   */
  secondaryLabel?: string
  secondaryTitle?: string
  onSecondary?: () => void
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
  secondaryLabel,
  secondaryTitle,
  onSecondary,
}: NamedCreateButtonProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const popoverId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        !event.target ||
        !containerRef.current?.contains(event.target as Node)
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      window.requestAnimationFrame(() => triggerRef.current?.focus())
    }
    const onOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
        window.requestAnimationFrame(() => triggerRef.current?.focus())
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onOutsideClick)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onOutsideClick)
    }
  }, [open])

  const create = () => {
    onCreate(name.trim() || undefined)
    setName('')
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`${TOOLBAR_BUTTON_CLASS} w-full`}
        title={title}
        aria-expanded={open}
        aria-controls={popoverId}
      >
        {icon}
        {buttonLabel}
        <ChevronDown
          size={14}
          className={`ml-auto transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          id={popoverId}
          role="group"
          aria-label={`Criar bloco ${buttonLabel}`}
          className="felixo-anim-sequential-panel felixo-sidebar-inline-panel mt-2 max-h-[calc(100vh-2rem)] w-full overflow-y-auto overscroll-contain rounded-lg bg-zinc-800 p-2 shadow-xl ring-1 ring-white/10"
        >
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                create()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                setOpen(false)
                window.requestAnimationFrame(() => triggerRef.current?.focus())
              }
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            className="mb-2 felixo-field w-full px-2 py-1.5 text-sm outline-none"
          />
          <button
            type="button"
            onClick={create}
            className="felixo-btn felixo-primary-action w-full px-3 py-1.5 text-sm"
          >
            Criar
          </button>

          {secondaryLabel && onSecondary && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onSecondary()
                window.requestAnimationFrame(() => triggerRef.current?.focus())
              }}
              title={secondaryTitle}
              className="felixo-btn mt-2 w-full rounded border-t border-white/10 px-3 py-1.5 pt-2.5 text-sm text-[var(--f-core-secondary)] hover:bg-white/[0.06] hover:text-[var(--f-core-white)]"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

type UrlCreateButtonProps = {
  icon: ReactNode
  buttonLabel: string
  /**
   * Creates the block; `name` is undefined when the field is left empty and
   * `profileId` when the Padrão profile is chosen.
   */
  onCreate: (url: string, name?: string, profileId?: string) => void
}

/**
 * Like NamedCreateButton, but for a block that needs a URL rather than just a
 * name — the "Página Web" mini-browser block. The URL is required (blocked
 * client-side via normalizeUrlInput); the name stays optional.
 */
function UrlCreateButton({ icon, buttonLabel, onCreate }: UrlCreateButtonProps) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [urlError, setUrlError] = useState<string | undefined>()
  // Perfil do navegador interno do bloco novo ('' = Padrão).
  const [profileId, setProfileId] = useState('')
  const { profiles } = useWebviewProfiles()
  const popoverId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        !event.target ||
        !containerRef.current?.contains(event.target as Node)
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      window.requestAnimationFrame(() => triggerRef.current?.focus())
    }
    const onOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
        window.requestAnimationFrame(() => triggerRef.current?.focus())
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onOutsideClick)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onOutsideClick)
    }
  }, [open])

  const create = () => {
    const normalized = normalizeUrlInput(url)
    if (!normalized) {
      setUrlError('Informe um endereço de site válido.')
      window.requestAnimationFrame(() => urlInputRef.current?.focus())
      return
    }
    onCreate(normalized, name.trim() || undefined, profileId || undefined)
    setUrl('')
    setName('')
    setUrlError(undefined)
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`${TOOLBAR_BUTTON_CLASS} w-full`}
        aria-expanded={open}
        aria-controls={popoverId}
      >
        {icon}
        {buttonLabel}
        <ChevronDown
          size={14}
          className={`ml-auto transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          id={popoverId}
          role="group"
          aria-label={`Criar bloco ${buttonLabel}`}
          className="felixo-anim-sequential-panel felixo-sidebar-inline-panel mt-2 max-h-[calc(100vh-2rem)] w-full overflow-y-auto overscroll-contain rounded-lg bg-zinc-800 p-2 shadow-xl ring-1 ring-white/10"
        >
          <input
            ref={urlInputRef}
            autoFocus
            value={url}
            onChange={(event) => {
              setUrl(event.target.value)
              setUrlError(undefined)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                create()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                setOpen(false)
                window.requestAnimationFrame(() => triggerRef.current?.focus())
              }
            }}
            placeholder="URL (ex: google.com)"
            aria-label="Endereço do site"
            aria-invalid={urlError ? true : undefined}
            aria-describedby={urlError ? `${popoverId}-error` : undefined}
            className="mb-1.5 felixo-field w-full px-2 py-1.5 text-sm outline-none"
          />
          {urlError && (
            <p id={`${popoverId}-error`} role="alert" className="mb-2 text-xs text-red-300">
              {urlError}
            </p>
          )}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                create()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                setOpen(false)
                window.requestAnimationFrame(() => triggerRef.current?.focus())
              }
            }}
            placeholder="Nome (opcional)"
            aria-label="Nome do bloco (opcional)"
            className="mb-2 felixo-field w-full px-2 py-1.5 text-sm outline-none"
          />
          {profiles.length > 0 && (
            <div className="mb-2">
              <FelixoSelect
                value={profileId}
                onChange={setProfileId}
                options={[
                  { value: '', label: 'Perfil: Padrão' },
                  ...profiles.map((profile) => ({ value: profile.id, label: `Perfil: ${profile.name}` })),
                ]}
                menuLabel="Perfil do navegador"
                aria-label="Perfil do navegador"
              />
            </div>
          )}
          <button
            type="button"
            onClick={create}
            className="felixo-btn felixo-primary-action w-full px-3 py-1.5 text-sm"
          >
            Criar
          </button>
        </div>
      )}
    </div>
  )
}
