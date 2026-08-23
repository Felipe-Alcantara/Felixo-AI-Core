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
  FileText,
  Globe,
  Group,
  Hand,
  LayoutGrid,
  Maximize,
  MessageSquare,
  MousePointer2,
  Search,
  Trash2,
} from 'lucide-react'
import { CanvasToolsMenu, type CanvasTool } from './tools/CanvasToolsMenu'
import { TerminalMenu } from './TerminalMenu'
import { AppVersionBadge, UpdateIndicator } from '../../updates/UpdateNotice'
import { CliSetupIndicator } from '../../setup/CliSetupNotice'
import { useAppVersion } from '../../updates/useAppVersion'
import type { UpdatePresentation } from '../../updates/update-presentation'
import {
  toolbarFlyoutClass,
  toolbarFlyoutStyle,
  useToolbarFlyoutPosition,
} from './toolbar-flyout'
import { deveMostrarRodapeDeStatus } from './toolbar-status'
import { normalizeUrlInput } from '../services/url-utils'
import type { ArrangeMode } from '../services/canvas-matrix-layout'
import type { CanvasProject } from '../hooks/useCanvasProjects'

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
const TOOLBAR_BUTTON_FRAME = 'w-36 rounded-lg shadow-lg ring-1 ring-white/10'

/** A superfície clicável: fundo, cor e o realce que segue o ponteiro. */
const TOOLBAR_BUTTON_SURFACE = 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700'

/** Shape shared by every toolbar button; the press depth comes from the
 *  felixo-btn / felixo-btn-icon each call site adds. */
const TOOLBAR_BUTTON_SHAPE =
  `flex items-center gap-2 px-3 py-2 text-sm ${TOOLBAR_BUTTON_FRAME} ${TOOLBAR_BUTTON_SURFACE}`

const TOOLBAR_BUTTON_CLASS = `felixo-btn ${TOOLBAR_BUTTON_SHAPE}`
const TOOLBAR_ICON_BUTTON_CLASS = `felixo-btn-icon ${TOOLBAR_BUTTON_SHAPE}`

type CanvasToolbarProps = {
  activeTool: CanvasTool | null
  onSelectTool: (tool: CanvasTool) => void
  updatePresentation: UpdatePresentation
  onInstallUpdate: () => void
  /** Verifica atualização agora, oferecido quando a última verificação falhou. */
  onCheckUpdate: () => void
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
  onOrganizeBlocks: (mode: ArrangeMode) => void
  arrangeableCount: number
  onAddFolder: () => Promise<string[]>
  onAddFile: (name?: string) => void
  /** Abre o seletor nativo e cria um bloco apontando para o arquivo escolhido. */
  onOpenFile: () => void
  onAddGroup: (name?: string) => void
  onAddWebpage: (url: string, name?: string) => void
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
  /** Lets the tool panels, rendered as siblings by CanvasView, slide clear of
   *  the button column when the tools menu widens it. */
  onToolsMenuOpenChange?: (open: boolean) => void
}

export function CanvasToolbar({
  activeTool,
  onSelectTool,
  updatePresentation,
  onInstallUpdate,
  onCheckUpdate,
  projects,
  onAddTerminal,
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
  onToolsMenuOpenChange,
}: CanvasToolbarProps) {
  const importInputRef = useRef<HTMLInputElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [isCollapsing, setIsCollapsing] = useState(false)
  const [isExpanding, setIsExpanding] = useState(false)
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false)
  const appVersion = useAppVersion()
  // Mantém o CanvasView em sincronia: os painéis de ferramenta são irmãos da
  // toolbar e se deslocam junto com a largura desta coluna.
  const changeToolsMenuOpen = (open: boolean) => {
    setToolsMenuOpen(open)
    onToolsMenuOpenChange?.(open)
  }
  const collapseToolbar = () => {
    changeToolsMenuOpen(false)
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
      {/* Buscar mora aqui, não dentro de Ferramentas: é a ação mais usada do
          canvas e não faz sentido custar dois cliques. */}
      <button
        type="button"
        onClick={() => onSelectTool('search')}
        className={`${TOOLBAR_BUTTON_CLASS} ${activeTool === 'search' ? '!bg-zinc-700 text-white' : ''}`}
        title="Buscar blocos no canvas"
        aria-expanded={activeTool === 'search'}
      >
        <Search size={16} />
        Buscar
      </button>
      <TerminalMenu
        projects={projects}
        onAdd={onAddTerminal}
        onAddMany={onAddTerminals}
        onAddFolder={onAddFolder}
        toolsMenuOpen={toolsMenuOpen}
      />
      <UrlCreateButton
        icon={<Globe size={16} />}
        buttonLabel="Página Web"
        onCreate={onAddWebpage}
        toolsMenuOpen={toolsMenuOpen}
      />

      {/* Fim do grupo de acesso rápido. Daqui para baixo vem o resto: as
          ferramentas, a criação de blocos e as ações sobre o canvas. */}
      <CanvasToolsMenu
        activeTool={activeTool}
        onSelect={onSelectTool}
        onOpenChange={changeToolsMenuOpen}
        onExport={onExport}
        onImport={() => importInputRef.current?.click()}
        isBusy={isBusy}
      />
      <OrganizeButton
        onOrganize={onOrganizeBlocks}
        arrangeableCount={arrangeableCount}
        toolsMenuOpen={toolsMenuOpen}
      />
      {/* "Projetos" e "Nota" não ficam aqui: os painéis em Ferramentas já fazem
          o ciclo completo de cada um — navegar/rodar e adicionar/remover pasta,
          criar nota e gerenciar as salvas. */}
      <NamedCreateButton
        icon={<FileText size={16} />}
        buttonLabel="Arquivo"
        placeholder="Nome do arquivo (opcional)"
        title="Bloco de arquivo .md compartilhado (agentes podem editar)"
        onCreate={onAddFile}
        secondaryLabel="Abrir arquivo existente…"
        secondaryTitle="Abrir um arquivo de texto do disco num bloco do canvas"
        onSecondary={onOpenFile}
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

      {/* Exportar/Importar vivem em Ferramentas — são manutenção do canvas, não
          ações do dia a dia. O input fica aqui porque é disparado por ref. */}
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

      {/* Rodapé de status: informação, não ação.
          Vive DEPOIS do último botão de propósito. Estes elementos aparecem e
          somem sozinhos (o de atualização reavalia a cada dez minutos), e no
          meio da coluna cada aparição empurrava para baixo todos os botões
          seguintes — um alvo que se move sem ninguém encostar nele. Por último,
          eles crescem e encolhem sem mover nada. */}
      {deveMostrarRodapeDeStatus({
        versao: appVersion,
        atualizacaoVisivel: updatePresentation.showIndicator,
      }) && (
        <div className="mt-1 flex w-36 flex-col items-start gap-1 border-t border-white/5 pt-2">
          <UpdateIndicator
            presentation={updatePresentation}
            onInstall={onInstallUpdate}
            onRetry={onCheckUpdate}
          />
          <CliSetupIndicator />
          <AppVersionBadge version={appVersion} />
        </div>
      )}
    </div>
  )
}


type OrganizeButtonProps = {
  onOrganize: (mode: ArrangeMode) => void
  arrangeableCount: number
  toolsMenuOpen: boolean
}

/**
 * "Organizar", com o modo por repositório atrás de uma setinha.
 *
 * O clique no corpo do botão continua fazendo o de sempre (uma matriz só), para
 * que quem já usava não precise aprender nada. A setinha abre as duas opções —
 * um botão a mais na coluna da barra custaria largura permanente por uma
 * escolha que se faz de vez em quando.
 */
function OrganizeButton({
  onOrganize,
  arrangeableCount,
  toolsMenuOpen,
}: OrganizeButtonProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const flyoutPosition = useToolbarFlyoutPosition({
    open,
    toolsMenuOpen,
    containerRef,
    panelRef,
    panelWidth: 240,
  })
  const disabled = arrangeableCount < 2

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

  const organize = (mode: ArrangeMode) => {
    setOpen(false)
    onOrganize(mode)
  }

  return (
    <div ref={containerRef} className="relative w-36">
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
          type="button"
          onClick={() => organize('single')}
          disabled={disabled}
          className="felixo-btn-flat flex flex-1 items-center gap-2 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 enabled:hover:bg-zinc-700 disabled:cursor-not-allowed"
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
          className="felixo-btn-flat flex items-center border-l border-white/10 bg-zinc-800 px-1.5 text-zinc-300 enabled:hover:bg-zinc-700 disabled:cursor-not-allowed"
          title="Modos de organização"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {open && (
        <div
          ref={panelRef}
          style={toolbarFlyoutStyle(flyoutPosition)}
          className={`felixo-anim-sequential-panel ${toolbarFlyoutClass()} ${flyoutPosition ? '' : 'invisible'} w-60 rounded-lg bg-zinc-800 p-2 shadow-xl ring-1 ring-white/10`}
        >
          <button
            type="button"
            onClick={() => organize('single')}
            className="felixo-btn w-full rounded px-2 py-1.5 text-left text-sm text-zinc-100 hover:bg-zinc-700"
          >
            Matriz única
            <span className="mt-0.5 block text-[11px] text-zinc-400">
              Todos os blocos numa grade só, na ordem do dock.
            </span>
          </button>
          <button
            type="button"
            onClick={() => organize('by-repository')}
            className="felixo-btn mt-1 w-full rounded px-2 py-1.5 text-left text-sm text-zinc-100 hover:bg-zinc-700"
          >
            Uma matriz por repositório
            <span className="mt-0.5 block text-[11px] text-zinc-400">
              Uma faixa por pasta de trabalho; blocos sem pasta ficam por último.
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
  secondaryLabel,
  secondaryTitle,
  onSecondary,
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

          {secondaryLabel && onSecondary && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onSecondary()
              }}
              title={secondaryTitle}
              className="felixo-btn mt-2 w-full rounded border-t border-white/10 px-3 py-1.5 pt-2.5 text-sm text-zinc-300 hover:bg-white/5 hover:text-zinc-100"
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
  /** Creates the block; `name` is undefined when the field is left empty. */
  onCreate: (url: string, name?: string) => void
  /** The tools menu widens the toolbar column; the popover slides over to clear it. */
  toolsMenuOpen: boolean
}

/**
 * Like NamedCreateButton, but for a block that needs a URL rather than just a
 * name — the "Página Web" mini-browser block. The URL is required (blocked
 * client-side via normalizeUrlInput); the name stays optional.
 */
function UrlCreateButton({ icon, buttonLabel, onCreate, toolsMenuOpen }: UrlCreateButtonProps) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
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
    const normalized = normalizeUrlInput(url)
    if (!normalized) return
    onCreate(normalized, name.trim() || undefined)
    setUrl('')
    setName('')
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative w-36">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`${TOOLBAR_BUTTON_CLASS} w-full`}
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
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                create()
              } else if (event.key === 'Escape') {
                setOpen(false)
              }
            }}
            placeholder="URL (ex: google.com)"
            className="mb-1.5 w-full rounded bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-white/10 placeholder:text-zinc-500 focus:ring-sky-500/50"
          />
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                create()
              } else if (event.key === 'Escape') {
                setOpen(false)
              }
            }}
            placeholder="Nome (opcional)"
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
