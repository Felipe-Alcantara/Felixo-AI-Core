import { lazy, Suspense, useCallback, useEffect, useEffectEvent, useId, useRef, useState, type ReactNode } from 'react'
import {
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  Columns2,
  AppWindow,
  CornerDownLeft,
  Fullscreen,
  PictureInPicture2,
  SquarePlus,
  Eye,
  Grid2x2,
  History,
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
  RotateCcw,
  Rows2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import {
  useSessionSnapshot,
  useTerminalSessions,
} from '../terminal/terminal-session-context'
import { CopyButton } from './TerminalCopyButton'
import { TerminalReadingPanel } from './TerminalReadingPanel'
import { ptySessionIdForNode } from '../terminal/pty-session-id'
import { TerminalScrollRail } from './TerminalScrollRail'
import { useClaudeScrollRail } from '../hooks/useClaudeScrollRail'
import { claudeScrollRailPlacement } from '../terminal/terminal-claude-scroll'
import type { ReadingProfile } from '../terminal/reading/reading-profiles'
import { resolveOpenEditorFile } from './terminal-open-file'
import { useExitAnimation } from '../hooks/useExitAnimation'
import { DRAWER_EXIT_MS } from '../services/animation-timing'
import type { AgentSessionReference } from '../services/agent-session'
import {
  TERMINAL_RESUME_PENDING_LABEL,
  terminalResumeActionRelaunches,
  visibleTerminalResumeBanner,
  type TerminalResumeActionId,
  type TerminalResumeBanner,
} from '../services/terminal-resume-banner'
import { terminalScrollbackNotice } from '../terminal/terminal-scrollback'
import { ResumeSessionPicker } from './ResumeSessionPicker'
import type { ListedAgentSession } from '../services/agent-session-list'
import { useCanvasSurfaces } from '../hooks/canvas-surfaces-context'
import { DRAWER_MIN_WIDTH } from '../services/canvas-surfaces'
import { attachTerminalFitLifecycle } from './terminal-fit-lifecycle'
import { detachTerminal, type DetachedTerminal, type DetachMode } from './terminal-detach'
import { concluirReabertura, reaberturaPendente } from './detached-windows-memory'
import { reportActionFailure } from '../services/canvas-persistence-status'
import { drawerPaneShortcut, type DrawerLayoutChoice } from './terminal-drawer-panes'
import {
  clampMosaicRatio,
  layoutMosaic,
  MOSAIC_MIN_PANE,
  mosaicPaneIds,
  neighborMosaicPane,
  presetMosaic,
  setMosaicRatio,
  type MosaicDivider,
  type MosaicNode,
  type MosaicRect,
} from './terminal-mosaic'
import {
  clampDrawerWidth,
  COLLAPSED_WIDTH,
  getDefaultDrawerWidth,
  getDrawerMaxWidth,
  readCollapsedPreference,
  readPinnedPreference,
  readWidthPreference,
  shouldCloseOnOutsideClick,
  writeCollapsedPreference,
  writePinnedPreference,
  writeWidthPreference,
} from './terminal-drawer-pin'

/** O que cada painel da gaveta precisa saber sobre o seu agente. */
export type TerminalDrawerPane = {
  sessionId: string
  title: string
  /**
   * Launch options to relaunch with when the session has exited (see restart
   * button). With `onRestart` the canvas decides the relaunch and these only
   * feed the rendered-file preview (command/args/cwd).
   */
  restartOptions?: {
    command?: string
    args?: string[]
    cwd?: string
    initialText?: string
    /** O `initialText` é uma passagem: um relançamento automático não o reenvia. */
    initialTextIsHandoff?: boolean
    sourceLabel?: string
    /** Conta cujo ambiente deve continuar valendo quando o drawer reiniciar. */
    accountId?: string
    /** Provedor da conta; acompanha o restart até a validação do PTY. */
    providerId?: string
    /** Modo da conta do bloco; o restart nunca leva ticket da cadeia. */
    accountMode?: 'pinned' | 'chain'
    agentSession?: AgentSessionReference
    resumeAgentSession?: boolean
    /** Render-time total used only when this drawer creates a fresh xterm. */
    terminalCount?: number
    /** Render-time Modo Performance flag used only when this drawer creates a fresh xterm. */
    performanceMode?: boolean
  }
  /**
   * Reinicia pelo plano de retomada do canvas — o mesmo caminho do Reiniciar
   * do cartão. Sem ele, a gaveta relança com `restartOptions`.
   */
  onRestart?: () => void
  /**
   * Faixa da retomada pendente do bloco, espelho da do cartão: quem abre a
   * gaveta de um bloco segurado vê o alvo, o motivo e as saídas aqui também.
   */
  resumeBanner?: TerminalResumeBanner | null
  /** Botão da faixa: o canvas grava a escolha e (re)sobe o bloco. */
  onResumeAction?: (action: TerminalResumeActionId) => void
  /** A pessoa escolheu uma conversa da lista da faixa: o canvas a associa e relança. */
  onChooseResumeSession?: (session: ListedAgentSession) => void
  /**
   * Abre a escolha do agente que vai assumir o trabalho, levando o histórico
   * completo da sessão. Sempre disponível: passar responsabilidade é uma
   * decisão do usuário, não a consequência de um estado detectado.
   */
  onPassResponsibility?: (transcript: string, screenOnly: boolean) => void
  /**
   * Cria (ou reaproveita) o bloco "arquivo" apontando para o caminho dado, já
   * em modo visualização — o mesmo bloco que o painel Projetos cria ao abrir
   * um arquivo existente. Terminal continua sendo pty puro; quem renderiza
   * markdown/código/imagem é sempre o bloco arquivo.
   */
  onOpenFilePreview?: (filePath: string, fileName: string) => void
  /**
   * A aba Leitura está ligada neste bloco. A escolha fica no bloco
   * (persistida); o padrão é o Terminal. Sem `onReadingModeChange`, a gaveta
   * não mostra as abas.
   */
  readingMode?: boolean
  onReadingModeChange?: (on: boolean) => void
  /** Como ler a tela deste bloco: o perfil da CLI que roda nele. */
  readingProfile?: ReadingProfile
}

type TerminalDrawerProps = {
  /** De 1 a 8 agentes vivos; um só é a gaveta de sempre. */
  panes: TerminalDrawerPane[]
  /** O mosaico: a árvore de divisões cujas folhas são os `panes`. Sem ela, os painéis ficam em colunas. */
  tree?: MosaicNode
  /** O painel que recebe o teclado e o destino de Prompts, Skills e ditado. */
  focusedId: string
  layout: DrawerLayoutChoice
  /** Arrastar (ou ajustar pelo teclado) a divisória `path` do mosaico. */
  onResizeSplit?: (path: string, ratio: number) => void
  /** Agentes do canvas que ainda não estão na gaveta: o "+" de cada painel os oferece. */
  addablePanes?: { id: string; title: string }[]
  /** Põe o agente `id` no mosaico, dividindo o painel `beside`. `area` é o tamanho real da gaveta. */
  onAddPane?: (id: string, beside: string, area: MosaicRect) => void
  /** O painel em foco ocupa a gaveta inteira; os outros seguem vivos, só não desenham. */
  zoomed: boolean
  onFocusPane: (sessionId: string) => void
  /** Fecha só o painel: o PTY do agente segue e o cartão continua com a prévia. */
  onClosePane: (sessionId: string) => void
  onLayoutChange: (layout: DrawerLayoutChoice, area?: MosaicRect) => void
  onToggleZoom: () => void
  /**
   * Muda a cada pedido de abrir um terminal, inclusive o que já está aberto.
   * O clique que pede a abertura costuma ser também um mousedown fora da
   * gaveta, que já começou a fechá-la: o pedido cancela esse fechamento.
   */
  openRequest?: number
  onClose: () => void
  /** Avisa que a gaveta começou a fechar por um clique fora dela (não fixada). */
  onOutsideClickClose?: () => void
}

const MIN_WIDTH = DRAWER_MIN_WIDTH

/** O mosaico é calculado num quadrado de 100 000 unidades e desenhado em porcentagem. */
const MOSAIC_SIZE = 100_000
const MOSAIC_UNIT: MosaicRect = { x: 0, y: 0, width: MOSAIC_SIZE, height: MOSAIC_SIZE }
const pct = (value: number) => `${(value / MOSAIC_SIZE) * 100}%`
const sameMembers = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id))

/**
 * Menu do "+" do painel: os agentes do canvas que ainda não estão na gaveta. O
 * escolhido divide o painel de onde o menu saiu. Setas andam, Esc e clique fora fecham.
 */
function AddBesideMenu({
  items,
  onPick,
  onClose,
}: {
  items: { id: string; title: string }[]
  onPick: (id: string) => void
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const sorted = [...items].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('[data-felixo-add-beside-option]')?.focus()
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current && !menuRef.current.parentElement?.contains(target)) onClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [onClose])

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Agentes para abrir ao lado"
      data-felixo-add-beside-menu
      className="absolute right-0 top-full z-40 mt-1 max-h-72 w-64 overflow-auto rounded-md border border-white/10 bg-(--f-core-structural) py-1 text-sm shadow-lg"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onClose()
          return
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        const options = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[data-felixo-add-beside-option]') ?? [])]
        const index = options.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'ArrowDown' ? index + 1 : index - 1
        options[(next + options.length) % options.length]?.focus()
      }}
    >
      {sorted.length === 0 ? (
        <p className="px-3 py-2 text-xs text-zinc-500">
          Todos os agentes do canvas já estão aqui. Crie outro pelo botão Agente.
        </p>
      ) : (
        sorted.map((item) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            data-felixo-add-beside-option
            onClick={() => onPick(item.id)}
            className="block w-full truncate px-3 py-1.5 text-left text-zinc-200 hover:bg-white/10 focus:bg-white/10 focus:outline-none"
            title={`Abrir ${item.title} ao lado deste painel`}
          >
            {item.title}
          </button>
        ))
      )}
    </div>
  )
}

/** Passo do teclado na divisória: 5% da área (Shift: 15%). */
const DIVIDER_STEP = 0.05
const DIVIDER_STEP_LARGE = 0.15

/**
 * A faixa entre dois painéis do mosaico. Arrastar mostra o novo tamanho na hora
 * (rascunho local, sem gravar no canvas a cada pixel) e grava ao soltar; setas
 * ajustam 5% (Shift: 15%), Home e dois cliques dividem ao meio. O piso de cada
 * lado (`MOSAIC_MIN_PANE`) vale em todos os caminhos.
 */
function MosaicDividerHandle({
  divider,
  label,
  bodyRef,
  onDraft,
  onCommit,
}: {
  divider: MosaicDivider
  label: string
  bodyRef: React.RefObject<HTMLDivElement | null>
  onDraft: (ratio: number) => void
  onCommit: (ratio: number) => void
}) {
  const row = divider.direction === 'row'
  const draggingRef = useRef(false)
  const lastRatioRef = useRef(divider.ratio)
  const [dragging, setDragging] = useState(false)

  // A área que esta divisão reparte, em pixels de tela (o mosaico está em porcentagem).
  const pixelArea = (): MosaicRect | null => {
    const box = bodyRef.current?.getBoundingClientRect()
    if (!box || box.width === 0 || box.height === 0) return null
    const k = (value: number) => value / MOSAIC_SIZE
    return {
      x: box.left + k(divider.area.x) * box.width,
      y: box.top + k(divider.area.y) * box.height,
      width: k(divider.area.width) * box.width,
      height: k(divider.area.height) * box.height,
    }
  }
  const clamp = (ratio: number) => {
    const area = pixelArea()
    return area ? clampMosaicRatio({ direction: divider.direction, area }, ratio, 0) : Math.min(0.9, Math.max(0.1, ratio))
  }
  const ratioAt = (event: React.PointerEvent) => {
    const area = pixelArea()
    if (!area) return divider.ratio
    const raw = row ? (event.clientX - area.x) / area.width : (event.clientY - area.y) / area.height
    return clamp(raw)
  }
  const stopDragging = () => {
    draggingRef.current = false
    setDragging(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={row ? 'vertical' : 'horizontal'}
      aria-valuemin={10}
      aria-valuemax={90}
      aria-valuenow={Math.round(divider.ratio * 100)}
      aria-description={
        row
          ? 'Setas para esquerda e direita redimensionam (Shift: passo maior); Home divide ao meio.'
          : 'Setas para cima e para baixo redimensionam (Shift: passo maior); Home divide ao meio.'
      }
      title="Arraste para redimensionar; dois cliques dividem ao meio"
      data-felixo-mosaic-divider={divider.path || 'raiz'}
      className={`felixo-mosaic-divider ${row ? 'is-row' : 'is-column'} ${dragging ? 'is-dragging' : ''}`}
      style={
        row
          ? { left: pct(divider.rect.x), top: pct(divider.rect.y), height: pct(divider.rect.height) }
          : { top: pct(divider.rect.y), left: pct(divider.rect.x), width: pct(divider.rect.width) }
      }
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        try {
          // Sem captura (ponteiro que o navegador já soltou), o arrasto segue pelos eventos da própria faixa.
          event.currentTarget.setPointerCapture?.(event.pointerId)
        } catch {
          /* segue sem captura */
        }
        draggingRef.current = true
        lastRatioRef.current = divider.ratio
        setDragging(true)
        document.body.style.cursor = row ? 'col-resize' : 'row-resize'
        document.body.style.userSelect = 'none'
      }}
      onPointerMove={(event) => {
        if (!draggingRef.current) return
        lastRatioRef.current = ratioAt(event)
        onDraft(lastRatioRef.current)
      }}
      onPointerUp={() => {
        if (!draggingRef.current) return
        stopDragging()
        onCommit(lastRatioRef.current)
      }}
      onPointerCancel={() => {
        if (!draggingRef.current) return
        stopDragging()
        onCommit(lastRatioRef.current)
      }}
      onDoubleClick={() => onCommit(clamp(0.5))}
      onKeyDown={(event) => {
        const step = event.shiftKey ? DIVIDER_STEP_LARGE : DIVIDER_STEP
        const less = row ? 'ArrowLeft' : 'ArrowUp'
        const more = row ? 'ArrowRight' : 'ArrowDown'
        let next: number | null = null
        if (event.key === less) next = divider.ratio - step
        else if (event.key === more) next = divider.ratio + step
        else if (event.key === 'Home') next = 0.5
        if (next === null) return
        event.preventDefault()
        event.stopPropagation()
        onCommit(clamp(next))
      }}
    />
  )
}

/**
 * Right-side drawer that hosts the live, interactive terminals. Each pane
 * attaches its session's already-running xterm element (the PTY never
 * stopped), so expanding just reveals ongoing work.
 */
// Sob demanda: o painel traz o próprio xterm, que fica fora do carregamento inicial.
const TerminalArchivePanel = lazy(() =>
  import('./TerminalArchivePanel').then((module) => ({ default: module.TerminalArchivePanel })),
)

const LAYOUT_BUTTONS: { choice: DrawerLayoutChoice; label: string; icon: ReactNode }[] = [
  { choice: 'colunas', label: 'Painéis em colunas', icon: <Columns2 size={16} /> },
  { choice: 'linhas', label: 'Painéis em linhas', icon: <Rows2 size={16} /> },
  { choice: 'grade', label: 'Painéis em grade 2×2', icon: <Grid2x2 size={16} /> },
]

export function TerminalDrawer({
  panes,
  tree,
  focusedId,
  layout,
  zoomed,
  onFocusPane,
  onClosePane,
  onLayoutChange,
  onToggleZoom,
  onResizeSplit,
  addablePanes = [],
  onAddPane,
  openRequest = 0,
  onClose,
  onOutsideClickClose,
}: TerminalDrawerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const collapsedTriggerRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const focusedPane = panes.find((pane) => pane.sessionId === focusedId) ?? panes[0]
  const solo = panes.length === 1
  const [width, setWidth] = useState(() => {
    const maxWidth = getDrawerMaxWidth(window.innerWidth)
    return readWidthPreference(
      localStorage,
      getDefaultDrawerWidth(window.innerWidth, MIN_WIDTH),
      Math.min(MIN_WIDTH, maxWidth),
      maxWidth,
    )
  })
  const draggingRef = useRef(false)
  const latestResizeClientXRef = useRef<number | null>(null)
  const resizeFrameRef = useRef<number | null>(null)
  const [resizing, setResizing] = useState(false)
  const { closing, close, cancelClose } = useExitAnimation(DRAWER_EXIT_MS, onClose)
  useEffect(() => {
    cancelClose()
  }, [openRequest, cancelClose])
  const [pinned, setPinned] = useState(() => readPinnedPreference(localStorage))
  // Collapsed keeps the session running and the terminal mounted — the drawer
  // just shrinks to a rail, so reopening is instant and nothing is lost.
  const [collapsed, setCollapsed] = useState(() => readCollapsedPreference(localStorage))
  const { occupancy, reportDrawerWidth, viewport } = useCanvasSurfaces()
  const [maximized, setMaximized] = useState(false)
  // Tela cheia: o mosaico cobre a janela inteira do app (Esc volta). Os agentes não mudam.
  const [fullscreen, setFullscreen] = useState(false)

  const togglePinned = useCallback(() => {
    setPinned((prev) => {
      const next = !prev
      writePinnedPreference(localStorage, next)
      return next
    })
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      writeCollapsedPreference(localStorage, next)
      return next
    })
    setMaximized(false)
  }, [])

  const toggleMaximized = useCallback(() => {
    setMaximized((prev) => !prev)
    setCollapsed(false)
    writeCollapsedPreference(localStorage, false)
  }, [])

  // O que a gaveta QUER — inclusive recolhida (44px, uma escolha explícita,
  // não uma superfície espremida) e maximizada. `CanvasSurfacesProvider`
  // decide a largura final junto com o painel da esquerda numa passada só
  // (`splitHorizontalSpace`); ler de volta o valor já decidido em vez de
  // recalcular o próprio teto aqui é o que evita o looping de espremer
  // mutuamente (bug real, reproduzido em 12/09/2026).
  const desiredWidth = collapsed
    ? COLLAPSED_WIDTH
    : maximized
      ? Math.max(COLLAPSED_WIDTH, window.innerWidth - 120)
      : width

  useEffect(() => {
    reportDrawerWidth(desiredWidth)
    return () => reportDrawerWidth(0)
  }, [desiredWidth, reportDrawerWidth])

  // A largura final: o que o provider decidiu depois de conferir o painel
  // da esquerda — nunca `desiredWidth` direto.
  const effectiveWidth = occupancy.drawer

  // Click outside the drawer closes it, unless pinned. Com vários agentes
  // vivos a gaveta não fecha no clique fora: eles são um arranjo montado de
  // propósito, e o clique no canvas costuma ser para escolher o próximo.
  const keepOpenOnOutsideClick = pinned || !solo
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (shouldCloseOnOutsideClick(keepOpenOnOutsideClick, containerRef.current, event.target as Node)) {
        onOutsideClickClose?.()
        close()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [keepOpenOnOutsideClick, close, onOutsideClickClose])

  useEffect(() => {
    const active = document.activeElement
    if (
      collapsed &&
      active instanceof HTMLElement &&
      active.closest('[data-felixo-terminal-mount]') &&
      containerRef.current?.contains(active)
    ) {
      collapsedTriggerRef.current?.focus()
    }
  }, [collapsed])

  const onMouseDown = useCallback(() => {
    draggingRef.current = true
    setResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const cancelResizeFrame = () => {
      if (resizeFrameRef.current === null) {
        return
      }
      if (typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(resizeFrameRef.current)
      } else {
        window.clearTimeout(resizeFrameRef.current)
      }
      resizeFrameRef.current = null
    }

    const applyResize = (clientX: number) => {
      const next = window.innerWidth - clientX
      // O provider negocia painel e gaveta numa passada só; aqui aplicamos
      // apenas o piso/teto absoluto da própria gaveta para manter o arrasto
      // responsivo e deixar a largura efetiva para o contexto compartilhado.
      setWidth(clampDrawerWidth(next, window.innerWidth, MIN_WIDTH))
    }

    const flushResize = () => {
      resizeFrameRef.current = null
      if (!draggingRef.current || latestResizeClientXRef.current === null) {
        return
      }
      applyResize(latestResizeClientXRef.current)
    }

    const scheduleResize = () => {
      if (resizeFrameRef.current !== null) {
        return
      }
      if (typeof window.requestAnimationFrame === 'function') {
        resizeFrameRef.current = window.requestAnimationFrame(flushResize)
      } else {
        resizeFrameRef.current = window.setTimeout(flushResize, 0)
      }
    }

    const onMouseMove = (event: MouseEvent) => {
      if (!draggingRef.current) {
        return
      }
      latestResizeClientXRef.current = event.clientX
      scheduleResize()
    }
    const onMouseUp = () => {
      if (draggingRef.current) {
        cancelResizeFrame()
        flushResize()
        // Persist on release only: writing on every mousemove would hit
        // localStorage once per frame.
        setWidth((current) => {
          writeWidthPreference(localStorage, current)
          return current
        })
      }
      draggingRef.current = false
      latestResizeClientXRef.current = null
      setResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      cancelResizeFrame()
      latestResizeClientXRef.current = null
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      if (draggingRef.current) {
        draggingRef.current = false
        setResizing(false)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [])

  const updateDrawerWidth = useCallback((requestedWidth: number) => {
    const maxWidth = getDrawerMaxWidth(window.innerWidth)
    const next = clampDrawerWidth(requestedWidth, window.innerWidth, MIN_WIDTH)
    setWidth(Math.min(maxWidth, next))
    writeWidthPreference(localStorage, Math.min(maxWidth, next))
  }, [])

  const resetDrawerWidth = useCallback(() => {
    updateDrawerWidth(getDefaultDrawerWidth(window.innerWidth, MIN_WIDTH))
  }, [updateDrawerWidth])

  const onResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Home') {
      event.preventDefault()
      resetDrawerWidth()
      return
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const direction = event.key === 'ArrowLeft' ? 1 : -1
    updateDrawerWidth(effectiveWidth + direction * (event.shiftKey ? 80 : 24))
  }

  // O mosaico é desenhado em porcentagem da área: a mesma árvore serve para
  // qualquer largura de gaveta, sem medir nada antes do primeiro quadro.
  const bodyRef = useRef<HTMLDivElement>(null)
  const [draftSplit, setDraftSplit] = useState<{ path: string; ratio: number } | null>(null)
  const ids = panes.map((pane) => pane.sessionId)
  const baseTree = tree && sameMembers(mosaicPaneIds(tree), ids) ? tree : presetMosaic(ids, 'colunas')!
  const shownTree = draftSplit ? setMosaicRatio(baseTree, draftSplit.path, draftSplit.ratio) : baseTree
  // Estreita demais para o arranjo (algum painel abaixo do piso de largura): empilha,
  // como a gaveta sempre fez. A árvore guardada não muda; maximizar a devolve.
  const narrowest = Math.min(...layoutMosaic(shownTree, MOSAIC_UNIT, 0).panes.map((rect) => rect.width))
  const mosaicWidth = fullscreen ? window.innerWidth : effectiveWidth
  const stacked = !solo && !zoomed && (narrowest / MOSAIC_SIZE) * mosaicWidth < MOSAIC_MIN_PANE.width
  const displayTree: MosaicNode =
    zoomed && !solo
      ? { kind: 'pane', id: focusedPane.sessionId }
      : stacked
        ? presetMosaic(ids, 'linhas')!
        : shownTree
  const mosaic = layoutMosaic(displayTree, MOSAIC_UNIT, 0)
  const showDividers = !solo && !zoomed && !stacked && !collapsed
  const visiblePanes = zoomed && !solo ? panes.filter((pane) => pane.sessionId === focusedPane.sessionId) : panes
  const titleOf = (id: string) => panes.find((pane) => pane.sessionId === id)?.title ?? 'agente'
  // O tamanho real da gaveta (o lado mais comprido decide se o agente novo entra ao lado ou embaixo).
  const realArea = (): MosaicRect => ({
    x: 0,
    y: 0,
    width: bodyRef.current?.clientWidth || effectiveWidth,
    height: bodyRef.current?.clientHeight || window.innerHeight,
  })

  const onShortcut = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (solo || collapsed) return
    const shortcut = drawerPaneShortcut(event)
    if (!shortcut) return
    event.preventDefault()
    // Antes do xterm: ele trataria Alt+Shift+seta como entrada da CLI.
    event.stopPropagation()
    if (shortcut.type === 'zoom') {
      onToggleZoom()
      return
    }
    // O vizinho sai da geometria do mosaico, como o focus left/right/up/down do i3.
    const navTree = stacked ? displayTree : baseTree
    onFocusPane(neighborMosaicPane(navTree, MOSAIC_UNIT, focusedPane.sessionId, shortcut.direction))
  }

  // Controles da gaveta em si. Com um painel só, moram no cabeçalho dele (a
  // gaveta de sempre); com vários, numa barra própria acima dos painéis.
  const collapseButton = (
    <button
      ref={collapsedTriggerRef}
      type="button"
      onClick={toggleCollapsed}
      aria-label={collapsed ? 'Expandir terminal' : 'Recolher terminal'}
      aria-expanded={!collapsed}
      aria-controls="canvas-terminal-output"
      title={collapsed ? 'Expandir terminal' : 'Recolher terminal'}
      className="felixo-btn-icon shrink-0 rounded-sm p-1 text-zinc-400 transition-transform duration-150 hover:bg-white/10 hover:text-zinc-100"
    >
      {collapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
    </button>
  )
  const maximizeButton = collapsed ? null : (
    <button
      type="button"
      onClick={toggleMaximized}
      className="felixo-btn-icon rounded-sm p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
      aria-label={maximized ? 'Restaurar largura' : 'Maximizar terminal'}
      aria-pressed={maximized}
      title={maximized ? 'Restaurar largura' : 'Maximizar terminal'}
    >
      {maximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
    </button>
  )
  const fullscreenButton = collapsed ? null : (
    <button
      type="button"
      onClick={() => setFullscreen((current) => !current)}
      className={`felixo-btn-icon rounded-sm p-1 hover:bg-white/10 hover:text-zinc-100 ${
        fullscreen ? 'bg-white/10 text-zinc-100' : 'text-zinc-400'
      }`}
      aria-label={fullscreen ? 'Sair da tela cheia' : 'Terminais em tela cheia'}
      aria-pressed={fullscreen}
      title={
        fullscreen
          ? 'Sair da tela cheia (Esc)'
          : 'Tela cheia: os terminais ocupam a janela inteira, em mosaico (Esc volta)'
      }
    >
      <Fullscreen size={16} />
    </button>
  )
  const pinButton = collapsed ? null : (
    <button
      type="button"
      onClick={togglePinned}
      className={`felixo-btn-icon rounded-sm p-1 hover:bg-white/10 ${
        pinned ? 'text-(--f-core-white-soft) hover:text-(--f-core-white-soft)' : 'text-zinc-400 hover:text-zinc-100'
      }`}
      aria-label={pinned ? 'Desafixar terminal' : 'Fixar terminal'}
      title={pinned ? 'Desafixar (fecha ao clicar fora)' : 'Fixar (mantém aberto ao clicar fora)'}
    >
      {pinned ? <Pin size={16} /> : <PinOff size={16} />}
    </button>
  )
  const closeButton = (
    <button
      type="button"
      onClick={close}
      className="felixo-btn-icon rounded-sm p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
      aria-label="Fechar terminal"
      title={solo ? 'Fechar terminal' : 'Fechar a gaveta (os agentes seguem rodando)'}
    >
      <X size={16} />
    </button>
  )

  return (
    <div
      ref={containerRef}
      role="region"
      aria-labelledby={titleId}
      data-canvas-terminal-drawer
      data-felixo-terminal-drawer-collapsed={collapsed ? 'true' : 'false'}
      data-felixo-terminal-drawer-maximized={maximized ? 'true' : 'false'}
      data-felixo-drawer-panes={panes.length}
      onKeyDownCapture={onShortcut}
      onKeyDown={(event) => {
        if (
          event.key === 'Escape' &&
          !(event.target as HTMLElement).closest?.('[data-felixo-terminal-mount]')
        ) {
          event.preventDefault()
          // Em tela cheia, o Esc só volta ao tamanho de antes; fechar é o segundo Esc.
          if (fullscreen) setFullscreen(false)
          else close()
        }
      }}
      className={`felixo-terminal-drawer relative z-20 flex h-full flex-col border-l border-white/10 bg-(--f-core-black-surface) focus-within:z-30 ${
        closing ? 'felixo-anim-drawer-out' : 'felixo-anim-drawer-in'
      } ${fullscreen ? 'felixo-terminal-drawer--fullscreen' : ''}`}
      style={{
        // `effectiveWidth` já vem limitado pelo que o painel da esquerda
        // ocupa; usar a largura crua aqui era o que deixava a gaveta passar
        // por cima dele mesmo depois de o limite ter sido calculado. Em tela
        // cheia quem manda é o CSS (fixa, cobrindo a janela).
        width: fullscreen
          ? undefined
          : viewport.width <= 980
            ? `min(${effectiveWidth}px, calc(100vw - var(--felixo-sidebar-width)))`
            : `${effectiveWidth}px`,
        // Animate the collapse/maximize toggles, but never the resize drag —
        // the edge must track the pointer 1:1.
        transition: resizing ? undefined : 'width 180ms cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      {/* Borda de arrasto. O duplo clique devolve a largura com que a gaveta
          abre — o mesmo que Home, agora também ao alcance do mouse. */}
      {!collapsed && !maximized && !fullscreen && (
        <div
          onMouseDown={onMouseDown}
          onDoubleClick={resetDrawerWidth}
          onKeyDown={onResizeKeyDown}
          role="separator"
          aria-label={`Redimensionar terminal ${focusedPane.title}`}
          aria-orientation="vertical"
          aria-valuenow={effectiveWidth}
          aria-valuemin={Math.min(MIN_WIDTH, getDrawerMaxWidth(window.innerWidth))}
          aria-valuemax={getDrawerMaxWidth(window.innerWidth)}
          aria-description="Seta para esquerda amplia, seta para direita reduz e Home restaura o tamanho padrão."
          tabIndex={0}
          title="Arraste para redimensionar; dois cliques para a largura padrão"
          data-felixo-terminal-drawer-resize-handle
          className={`felixo-resize-handle felixo-resize-handle--left ${resizing ? 'is-resizing' : ''}`}
        />
      )}
      {!solo && (
        <div
          data-felixo-drawer-toolbar
          className={`felixo-terminal-drawer-header flex items-center border-b border-white/10 py-2 text-sm text-zinc-200 ${
            collapsed ? 'flex-col gap-2 px-1' : 'gap-2 px-3'
          }`}
        >
          {collapseButton}
          {collapsed ? (
            <h2
              id={titleId}
              className="min-h-0 flex-1 select-none truncate text-xs text-zinc-500"
              style={{ writingMode: 'vertical-rl' }}
              title={focusedPane.title}
            >
              {panes.length} agentes · {focusedPane.title}
            </h2>
          ) : (
            <>
              <h2 id={titleId} className="mr-auto ml-2 truncate font-medium">
                {panes.length} agentes
              </h2>
              {stacked && (
                <span
                  className="text-[11px] text-zinc-500"
                  title={`A largura da gaveta não comporta o mosaico (mínimo de ${MOSAIC_MIN_PANE.width} px por painel). Maximize a gaveta.`}
                >
                  empilhados: maximize para lado a lado
                </span>
              )}
              <div className="flex items-center gap-1" role="group" aria-label="Divisão dos painéis">
                {LAYOUT_BUTTONS.map((item) => (
                  <button
                    key={item.choice}
                    type="button"
                    onClick={() => onLayoutChange(item.choice, realArea())}
                    aria-label={item.label}
                    aria-pressed={layout === item.choice}
                    title={item.label}
                    data-felixo-drawer-layout={item.choice}
                    className={`felixo-btn-icon rounded-sm p-1 hover:bg-white/10 hover:text-zinc-100 ${
                      layout === item.choice ? 'bg-white/10 text-zinc-100' : 'text-zinc-400'
                    }`}
                  >
                    {item.icon}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className={`flex items-center gap-2 ${collapsed ? 'flex-col' : ''}`}>
            {maximizeButton}
            {fullscreenButton}
            {pinButton}
            {closeButton}
          </div>
        </div>
      )}
      {/* Os xterms ficam montados mesmo recolhida (o PTY e o scrollback têm de
          sobreviver); só a caixa some. Com zoom, só o painel em foco desenha:
          os outros desmontam a tela, mas o agente segue vivo. Cada painel é um
          retângulo do mosaico, em porcentagem: juntos cobrem a área inteira. */}
      <div
        ref={bodyRef}
        data-felixo-mosaic
        className={`relative min-h-0 flex-1 ${collapsed && !solo ? 'invisible w-0' : ''}`}
      >
        {visiblePanes.map((pane) => {
          const rect = mosaic.panes.find((item) => item.id === pane.sessionId)
          if (!rect) return null
          return (
            <div
              key={pane.sessionId}
              data-felixo-mosaic-pane={pane.sessionId}
              className={`absolute flex ${rect.x > 0 ? 'border-l border-white/10' : ''} ${rect.y > 0 ? 'border-t border-white/10' : ''}`}
              style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.width), height: pct(rect.height) }}
            >
              <TerminalPane
                pane={pane}
                solo={solo}
                focused={pane.sessionId === focusedPane.sessionId}
                collapsed={collapsed}
                effectiveWidth={effectiveWidth}
                zoomed={zoomed}
                soloHeading={{
                  id: titleId,
                  leading: collapseButton,
                  maximize: (
                    <>
                      {maximizeButton}
                      {fullscreenButton}
                    </>
                  ),
                  pin: pinButton,
                  close: closeButton,
                }}
                onFocus={() => onFocusPane(pane.sessionId)}
                onClosePane={() => onClosePane(pane.sessionId)}
                onToggleZoom={onToggleZoom}
                addablePanes={onAddPane ? addablePanes : undefined}
                onAddBeside={onAddPane ? (id) => onAddPane(id, pane.sessionId, realArea()) : undefined}
              />
            </div>
          )
        })}
        {showDividers &&
          mosaic.dividers.map((divider) => (
            <MosaicDividerHandle
              key={divider.path || 'raiz'}
              divider={divider}
              label={`Redimensionar entre ${titleOf(divider.before)} e ${titleOf(divider.after)}`}
              bodyRef={bodyRef}
              onDraft={(ratio) => setDraftSplit({ path: divider.path, ratio })}
              onCommit={(ratio) => {
                setDraftSplit(null)
                onResizeSplit?.(divider.path, ratio)
              }}
            />
          ))}
      </div>
    </div>
  )
}

type TerminalPaneProps = {
  pane: TerminalDrawerPane
  solo: boolean
  focused: boolean
  collapsed: boolean
  effectiveWidth: number
  zoomed: boolean
  /** Os controles da gaveta, que o único painel leva no próprio cabeçalho. */
  soloHeading: {
    id: string
    leading: ReactNode
    maximize: ReactNode
    pin: ReactNode
    close: ReactNode
  }
  onFocus: () => void
  onClosePane: () => void
  onToggleZoom: () => void
  /** Agentes do canvas fora da gaveta. Sem `onAddBeside`, o "+" não aparece. */
  addablePanes?: { id: string; title: string }[]
  /** Põe o agente escolhido no mosaico, dividindo este painel (como o split do i3). */
  onAddBeside?: (id: string) => void
}

/**
 * Um agente vivo na gaveta: cabeçalho, faixas de aviso, abas Terminal/Leitura e
 * o xterm. Cada painel tem o próprio encaixe de tamanho (um ResizeObserver por
 * contêiner), então dois painéis não brigam pelo `fit()`.
 */
function TerminalPane({
  pane,
  solo,
  focused,
  collapsed,
  effectiveWidth,
  zoomed,
  soloHeading,
  onFocus,
  onClosePane,
  onToggleZoom,
  addablePanes,
  onAddBeside,
}: TerminalPaneProps) {
  const {
    sessionId,
    title,
    restartOptions,
    onRestart,
    resumeBanner: pendingResumeBanner = null,
    onResumeAction,
    onChooseResumeSession,
    onPassResponsibility,
    onOpenFilePreview,
    readingMode = false,
    onReadingModeChange,
    readingProfile,
  } = pane
  const store = useTerminalSessions()
  const snapshot = useSessionSnapshot(sessionId)
  const scrollbackNotice = terminalScrollbackNotice(snapshot?.scrollback)
  const scrollRail = useClaudeScrollRail(sessionId, snapshot?.generation, snapshot?.activity)
  const isLive = snapshot?.activity !== 'exited' && snapshot?.activity !== 'error'
  // Sem snapshot não há processo: nada a confirmar antes de (re)subir.
  const hasLiveProcess = snapshot !== undefined && isLive
  const resumeBannerRef = useRef<HTMLDivElement>(null)
  // Geração do processo em que a pessoa pediu Reiniciar com a retomada
  // pendente: a faixa guardada aparece para ESTE processo (como no cartão).
  const [resumeRevealedGeneration, setResumeRevealedGeneration] = useState<number | null>(null)
  const [resumePickerOpen, setResumePickerOpen] = useState(false)
  // Mesma faixa do cartão, com as mesmas ações ("Dispensar aviso" na falha
  // com o agente de pé).
  const resumeBanner = visibleTerminalResumeBanner({
    banner: pendingResumeBanner,
    hasProcess: snapshot !== undefined,
    processLive: isLive,
    revealed: snapshot !== undefined && resumeRevealedGeneration === (snapshot.generation ?? 0),
  })
  const awaitingResumeChoice = resumeBanner !== null && snapshot === undefined
  const confirmRestartOfLiveProcess = () =>
    !hasLiveProcess ||
    window.confirm('O processo deste terminal ainda está rodando. Reiniciar mesmo assim?')
  const restart = () => {
    if (pendingResumeBanner) {
      // Retomada pendente: nada sobe sem a escolha, e o processo atual não é
      // derrubado. A faixa aparece e recebe o foco, como no cartão.
      if (snapshot) setResumeRevealedGeneration(snapshot.generation ?? 0)
      requestAnimationFrame(() => resumeBannerRef.current?.querySelector('button')?.focus())
      return
    }
    if (!confirmRestartOfLiveProcess()) return
    if (onRestart) {
      onRestart()
      return
    }
    store.restart(sessionId, restartOptions ?? {})
  }
  const runResumeAction = (action: TerminalResumeActionId) => {
    if (action === 'choose') {
      setResumePickerOpen(true)
      return
    }
    // Com processo de pé, a escolha reinicia o terminal: mesma confirmação.
    // Dispensar o aviso não reinicia nada, então não pergunta.
    if (terminalResumeActionRelaunches(action) && !confirmRestartOfLiveProcess()) return
    onResumeAction?.(action)
  }
  const mountRef = useRef<HTMLDivElement>(null)
  const detachedRef = useRef<DetachedTerminal | null>(null)
  const [detachedTerminal, setDetachedTerminal] = useState<DetachedTerminal | null>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const paneRef = useRef<HTMLDivElement>(null)
  const ownTitleId = useId()
  const titleId = solo ? soloHeading.id : ownTitleId
  const terminalTabId = useId()
  const readingTabId = useId()
  const readingPanelId = useId()
  const ownMountId = useId()
  // Só o painel em foco leva o id estável (os testes e o `aria-controls` da
  // gaveta apontam para "o terminal"); ids repetidos seriam inválidos.
  const mountId = focused ? 'canvas-terminal-output' : ownMountId
  const readingPanelRef = useRef<HTMLDivElement | null>(null)
  const hasReading = Boolean(onReadingModeChange && readingProfile)
  const readingActive = hasReading && readingMode
  // Aberto para ESTE bloco: trocar de terminal na gaveta fecha sem efeito extra.
  const [archiveFor, setArchiveFor] = useState<string | null>(null)
  const archiveOpen = archiveFor === sessionId
  const scrollRailPlacement = claudeScrollRailPlacement({ visible: scrollRail.visible, readingActive })
  const [handoffError, setHandoffError] = useState<string | undefined>()
  const [previewError, setPreviewError] = useState<string | undefined>()
  const focusTerminalOnExpandRef = useRef(true)

  // Lê o histórico e entrega a escolha do agente para quem sabe criar nós no
  // canvas. O único motivo para o botão falhar aqui é não haver histórico —
  // uma sessão que acabou de subir e ainda não escreveu nada.
  const startResponsibilityHandoff = useCallback(() => {
    if (!onPassResponsibility) {
      return
    }

    const { text: transcript, screenOnly } = store.getTranscript(sessionId)
    if (!transcript.trim()) {
      setHandoffError('Este terminal ainda não tem histórico para transferir.')
      return
    }

    setHandoffError(undefined)
    onPassResponsibility(transcript, screenOnly === true)
  }, [onPassResponsibility, sessionId, store])

  // Abre o arquivo que está sendo editado aqui como um bloco "arquivo" (que
  // já sabe renderizar markdown, código e imagem), sem pedir o caminho de
  // novo. A opção de lançamento do bloco responde quando foi o app que abriu
  // o editor; o histórico do shell cobre quem digitou `nano` à mão.
  const openRenderedPreview = useCallback(() => {
    if (!onOpenFilePreview) return

    const found = resolveOpenEditorFile({
      command: restartOptions?.command,
      args: restartOptions?.args,
      cwd: restartOptions?.cwd,
      shellHistory: store.getShellHistory(sessionId).text,
    })
    if (!found) {
      setPreviewError('Não achei nenhum arquivo aberto com nano/vim neste terminal.')
      return
    }

    setPreviewError(undefined)
    onOpenFilePreview(found.path, found.name)
  }, [
    onOpenFilePreview,
    restartOptions?.args,
    restartOptions?.command,
    restartOptions?.cwd,
    sessionId,
    store,
  ])

  // Attach the live terminal element into the pane. Focus is handled below
  // only while the drawer is expanded, so a collapsed rail never leaves focus
  // inside an invisible xterm.
  //
  // `restart()` swaps in a brand-new xterm.Terminal under the same sessionId,
  // so `snapshot.generation` is in the deps too — without it this effect
  // wouldn't re-run after a restart, and the drawer would keep showing the
  // disposed terminal's (now-empty) container until it was closed and
  // reopened.
  useEffect(() => {
    const container = mountRef.current
    // Destacado: o xterm mora na janela própria; este encaixe só volta quando ele retorna.
    if (!container || detachedTerminal) {
      return
    }

    return attachTerminalFitLifecycle(container, store, sessionId)
  }, [store, sessionId, snapshot?.generation, detachedTerminal])

  // Reiniciar troca o xterm sob o mesmo id: a janela própria o recebe de novo.
  useEffect(() => {
    detachedTerminal?.rebind()
  }, [detachedTerminal, snapshot?.generation])

  // O painel saiu (agente fechado, gaveta recolhida): a janela dele não fica órfã.
  useEffect(() => () => detachedRef.current?.discard(), [])

  const openInWindow = (modo: DetachMode) => {
    const handle = detachTerminal({
      sessionId,
      title,
      modo,
      store,
      getHome: () => mountRef.current,
      onClosed: () => {
        detachedRef.current = null
        setDetachedTerminal(null)
      },
    })
    if (!handle) {
      reportActionFailure(
        'terminal-window',
        modo === 'pip' ? 'Não foi possível abrir o picture-in-picture.' : 'Não foi possível abrir a janela do terminal.',
      )
      return
    }
    detachedRef.current = handle
    setDetachedTerminal(handle)
  }
  const bringBackFromWindow = () => {
    detachedRef.current?.bringBack()
    detachedRef.current = null
    setDetachedTerminal(null)
  }

  // Reabre a janela que este terminal tinha na execução anterior, quando ele já
  // existe (um agente esperando a escolha de retomada ainda não tem xterm). O
  // adiamento deixa o StrictMode montar e desmontar sem abrir uma janela que o
  // descarte fecharia.
  const reabrirLembrada = useEffectEvent(() => {
    const modo = reaberturaPendente(sessionId)
    if (!modo || detachedRef.current) return
    concluirReabertura(sessionId)
    openInWindow(modo)
  })
  const temTerminal = Boolean(snapshot)
  useEffect(() => {
    if (!temTerminal) return
    const timer = window.setTimeout(() => reabrirLembrada(), 0)
    return () => window.clearTimeout(timer)
  }, [sessionId, temTerminal])

  // Keep the terminal fitted as the drawer width changes. Expanding also
  // returns focus to the terminal so the user can type right away — or to the
  // Leitura, when it is the tab showing (the terminal is inert behind it).
  // Só o painel em foco puxa o foco: os outros só refazem o encaixe.
  useEffect(() => {
    if (collapsed) {
      focusTerminalOnExpandRef.current = true
      return
    }
    store.fit(sessionId)
    if (!focused) return
    const activeElement = document.activeElement
    if (
      focusTerminalOnExpandRef.current ||
      !paneRef.current?.contains(activeElement) ||
      mountRef.current?.contains(activeElement)
    ) {
      if (readingActive) readingPanelRef.current?.focus()
      else store.focus(sessionId)
      focusTerminalOnExpandRef.current = false
    }
  }, [store, sessionId, effectiveWidth, collapsed, readingActive, focused])

  // Trocar de aba leva o foco junto: no Terminal, para digitar; na Leitura,
  // para rolar com o teclado.
  const selectReadingTab = useCallback(
    (on: boolean) => {
      onReadingModeChange?.(on)
      requestAnimationFrame(() => {
        if (on) readingPanelRef.current?.focus()
        else store.focus(sessionId)
      })
    },
    [onReadingModeChange, sessionId, store],
  )

  return (
    <div
      ref={paneRef}
      role={solo ? undefined : 'group'}
      aria-label={solo ? undefined : `Agente ${title}`}
      data-felixo-terminal-pane={sessionId}
      data-felixo-pane-focused={focused ? 'true' : 'false'}
      // Clicar ou tabular para dentro do painel o põe em foco.
      onMouseDownCapture={solo ? undefined : onFocus}
      onFocusCapture={solo ? undefined : onFocus}
      className={`flex min-h-0 min-w-0 flex-1 flex-col ${!solo && focused ? 'ring-1 ring-inset ring-(--f-core-active)' : ''}`}
    >
      <div
        className={`felixo-terminal-drawer-header flex items-center border-b border-white/10 py-2 text-sm text-zinc-200 ${
          solo && collapsed ? 'flex-col gap-2 px-1' : 'felixo-terminal-pane-header justify-between px-3'
        }`}
      >
        {solo && soloHeading.leading}
        {solo && collapsed ? (
          // Vertical title strip, so the rail still says which agent it is.
          <h2
            id={titleId}
            className="felixo-anim-sequential-panel min-h-0 flex-1 select-none truncate text-xs text-zinc-500"
            style={{ writingMode: 'vertical-rl' }}
            title={title}
          >
            {title}
          </h2>
        ) : (
          <h2
            id={titleId}
            className={`felixo-anim-sequential-panel mr-auto truncate font-medium ${solo ? 'ml-2' : ''}`}
            title={title}
          >
            {title}
          </h2>
        )}
        <div className={`flex items-center gap-2 ${solo && collapsed ? 'flex-col' : ''}`}>
          {!collapsed && (
            <span className="felixo-pane-status text-xs text-zinc-500" aria-live="polite">
              {awaitingResumeChoice
                ? TERMINAL_RESUME_PENDING_LABEL
                : snapshot?.activity === 'working'
                  ? 'trabalhando'
                  : snapshot?.activity === 'idle'
                    ? 'aguardando'
                    : snapshot?.activity === 'exited'
                      ? 'encerrado'
                      : ''}
            </span>
          )}
          {!collapsed && solo && (
            <span
              className="felixo-pane-links-hint hidden text-[11px] text-zinc-600 sm:inline"
              title="Ctrl+clique (Windows/Linux), Cmd+clique (macOS) ou clique direito sobre um link: escolher entre navegador, Página Web ou copiar"
            >
              links: Ctrl/Cmd+clique
            </span>
          )}
          {collapsed && (
            // The rail keeps a status dot so a collapsed agent still shows life.
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                snapshot?.activity === 'working'
                  ? 'bg-(--f-core-active)'
                  : snapshot?.activity === 'idle'
                    ? 'bg-(--f-core-active)'
                    : snapshot?.activity === 'exited'
                      ? 'bg-zinc-600'
                      : 'bg-(--color-warning)'
              }`}
              title={snapshot?.activity ?? ''}
            />
          )}
          {/* Janela própria e picture-in-picture. Cabem porque, com o cabeçalho
              estreito, a dica de links some e o status vira só para leitor de
              tela (`felixo-terminal-pane-header` no index.css). */}
          {!collapsed && onAddBeside && (
            <div className="felixo-pane-optional relative">
              <button
                ref={addButtonRef}
                type="button"
                onClick={() => setAddMenuOpen((open) => !open)}
                className={`felixo-btn-icon rounded-sm p-1 hover:bg-white/10 hover:text-zinc-100 ${
                  addMenuOpen ? 'bg-white/10 text-zinc-100' : 'text-zinc-400'
                }`}
                aria-label="Abrir outro agente ao lado deste"
                aria-haspopup="menu"
                aria-expanded={addMenuOpen}
                title="Dividir este painel: abrir outro agente ao lado (mosaico)"
              >
                <SquarePlus size={16} />
              </button>
              {addMenuOpen && (
                <AddBesideMenu
                  items={addablePanes ?? []}
                  onPick={(id) => {
                    setAddMenuOpen(false)
                    onAddBeside(id)
                  }}
                  onClose={() => {
                    setAddMenuOpen(false)
                    addButtonRef.current?.focus()
                  }}
                />
              )}
            </div>
          )}
          {!collapsed && !detachedTerminal && (
            <>
              <button
                type="button"
                onClick={() => openInWindow('janela')}
                className="felixo-pane-optional felixo-btn-icon rounded-sm p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                aria-label="Abrir o terminal em outra janela"
                title="Abrir em outra janela: o agente continua rodando, sem reiniciar"
              >
                <AppWindow size={16} />
              </button>
              <button
                type="button"
                onClick={() => openInWindow('pip')}
                className="felixo-pane-optional felixo-btn-icon rounded-sm p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                aria-label="Abrir o terminal em picture-in-picture"
                title="Picture-in-picture: o terminal flutua sempre no topo, mesmo com o app na bandeja"
              >
                <PictureInPicture2 size={16} />
              </button>
            </>
          )}
          {!collapsed && detachedTerminal && (
            <button
              type="button"
              onClick={bringBackFromWindow}
              className="felixo-btn-icon rounded-sm bg-white/10 p-1 text-zinc-100 hover:bg-white/15"
              aria-label="Trazer o terminal de volta"
              title="Trazer o terminal de volta para este painel"
            >
              <CornerDownLeft size={16} />
            </button>
          )}
          {!collapsed && <CopyButton onCopy={() => store.copy(sessionId)} />}
          {solo && soloHeading.maximize}
          {!collapsed && (
            <button
              type="button"
              onClick={() => setArchiveFor(archiveOpen ? null : sessionId)}
              className={`felixo-btn-icon rounded-sm p-1 hover:bg-white/10 hover:text-zinc-100 ${
                archiveOpen ? 'bg-white/10 text-zinc-100' : 'text-zinc-400'
              }`}
              aria-label="Histórico arquivado"
              aria-pressed={archiveOpen}
              title="Histórico arquivado: a saída inteira deste terminal, guardada em disco por 14 dias"
            >
              <History size={16} />
            </button>
          )}
          {!collapsed && (
            <button
              type="button"
              onClick={restart}
              className="felixo-btn-icon rounded-sm p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
              aria-label="Reiniciar terminal"
              title="Reiniciar terminal"
            >
              <RotateCcw size={16} />
            </button>
          )}
          {/* O terminal em si é só um pty de texto — quem renderiza markdown,
              código e imagem é o bloco "arquivo". Este botão detecta o
              arquivo aberto com nano/vim e abre esse bloco ao lado. */}
          {!collapsed && onOpenFilePreview && (
            <button
              type="button"
              onClick={openRenderedPreview}
              className="felixo-btn-icon rounded-sm p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
              aria-label="Ver arquivo em modo renderizado"
              title="Ver o arquivo aberto (nano/vim) em modo renderizado, igual ao site"
            >
              <Eye size={16} />
            </button>
          )}
          {/* Item fixo da topbar. A versão anterior só aparecia quando uma
              heurística achava que o agente tinha batido no limite de uso, e
              como a atividade da sessão oscila a cada redesenho da CLI, o botão
              piscava — aparecia e sumia debaixo do cursor. */}
          {!collapsed && onPassResponsibility && (
            <button
              type="button"
              onClick={startResponsibilityHandoff}
              data-canvas-handoff-trigger
              className="felixo-btn-icon rounded-sm p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
              aria-label="Passar responsabilidade para outro agente"
              title="Passar responsabilidade para outro agente"
            >
              <ArrowRightLeft size={16} />
            </button>
          )}
          {solo && soloHeading.pin}
          {!solo && (
            <>
              <button
                type="button"
                onClick={onToggleZoom}
                className={`felixo-btn-icon rounded-sm p-1 hover:bg-white/10 hover:text-zinc-100 ${
                  zoomed ? 'bg-white/10 text-zinc-100' : 'text-zinc-400'
                }`}
                aria-label={zoomed ? 'Voltar do zoom do painel' : 'Zoom do painel'}
                aria-pressed={zoomed}
                title={
                  zoomed
                    ? 'Voltar ao arranjo (Alt+Shift+Z)'
                    : 'Este painel ocupa a gaveta inteira; os outros seguem rodando (Alt+Shift+Z)'
                }
              >
                {zoomed ? <ZoomOut size={16} /> : <ZoomIn size={16} />}
              </button>
              <button
                type="button"
                onClick={onClosePane}
                className="felixo-btn-icon rounded-sm p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                aria-label="Fechar painel"
                title="Fechar este painel: o agente continua rodando e o cartão segue no canvas"
              >
                <X size={16} />
              </button>
            </>
          )}
          {solo && soloHeading.close}
        </div>
      </div>
      {!collapsed && snapshot?.message && (
        <div className="border-b border-[color-mix(in_srgb,var(--color-error)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-error)_14%,transparent)] px-3 py-2 text-xs text-theme-error">
          {snapshot.message}
        </div>
      )}
      {/* Espelho da faixa do cartão: alvo e motivo antes do spawn. Nenhum
          botão apaga a conversa gravada; fechar a gaveta sem escolher deixa o
          bloco parado, sem processo. */}
      {!collapsed && resumeBanner && (
        <div
          ref={resumeBannerRef}
          role="status"
          data-terminal-resume-banner
          className="border-b border-[color-mix(in_srgb,var(--color-warning)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] px-3 py-2 text-xs text-(--color-warning)"
        >
          <p className="font-medium">{resumeBanner.title}</p>
          <p className="mt-1 leading-relaxed text-zinc-300">{resumeBanner.detail}</p>
          {resumeBanner.target && (
            <p className="mt-1 wrap-break-word text-zinc-400">{resumeBanner.target}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {resumeBanner.actions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => runResumeAction(action.id)}
                className="felixo-btn rounded-sm bg-black/25 px-2 py-1 text-[11px] text-zinc-100 hover:bg-black/40"
              >
                {action.label}
              </button>
            ))}
          </div>
          {resumePickerOpen && resumeBanner.chooser && (
            <ResumeSessionPicker
              lookup={resumeBanner.chooser}
              onClose={() => setResumePickerOpen(false)}
              onChoose={(session) => {
                if (!confirmRestartOfLiveProcess()) return
                setResumePickerOpen(false)
                onChooseResumeSession?.(session)
              }}
            />
          )}
        </div>
      )}
      {!collapsed && snapshot?.contextWarning && (
        <div className="border-b border-[color-mix(in_srgb,var(--color-warning)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] px-3 py-2 text-xs text-(--color-warning)">
          {snapshot.contextWarning}
        </div>
      )}
      {!collapsed && scrollbackNotice && (
        <div role="status" className="border-b border-[color-mix(in_srgb,var(--color-warning)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] px-3 py-2 text-xs text-(--color-warning)">
          {scrollbackNotice}
        </div>
      )}
      {!collapsed && handoffError && (
        <div className="border-b border-[color-mix(in_srgb,var(--color-error)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-error)_14%,transparent)] px-3 py-2 text-xs text-theme-error">
          {handoffError}
        </div>
      )}
      {!collapsed && previewError && (
        <div className="border-b border-[color-mix(in_srgb,var(--color-error)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-error)_14%,transparent)] px-3 py-2 text-xs text-theme-error">
          {previewError}
        </div>
      )}
      {!collapsed && hasReading && (
        <div
          role="tablist"
          aria-label="Como mostrar este terminal"
          className="flex gap-1 border-b border-white/10 px-2 py-1"
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            selectReadingTab(!readingActive)
          }}
        >
          {[
            { id: terminalTabId, on: false, label: 'Terminal', controls: mountId },
            { id: readingTabId, on: true, label: 'Leitura', controls: readingPanelId },
          ].map((tab) => {
            const selected = readingActive === tab.on
            return (
              <button
                key={tab.label}
                id={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={tab.controls}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectReadingTab(tab.on)}
                data-felixo-terminal-tab={tab.on ? 'leitura' : 'terminal'}
                title={
                  tab.on
                    ? 'A conversa da tela como texto formatado (só leitura; o terminal segue rodando)'
                    : 'O terminal interativo'
                }
                className={`felixo-btn rounded-sm px-2 py-0.5 text-xs ${
                  selected ? 'bg-white/10 text-zinc-100' : 'text-zinc-400 hover:bg-white/6 hover:text-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      )}
      {/* The terminal element stays mounted while collapsed (the PTY and its
          scrollback must survive); only its box is hidden. A Leitura fica por
          cima dele, do mesmo tamanho: o xterm não muda de largura (o que faria
          a CLI redesenhar) e segue recebendo tudo; só sai do foco e do leitor
          de tela, para o conteúdo não ser lido duas vezes. */}
      {/* A tela do terminal fica escura em qualquer tema (as CLIs desenham para
          fundo escuro); só a moldura da gaveta acompanha o tema. */}
      <div className={`felixo-paleta-escura relative flex min-h-0 flex-1 bg-(--f-core-black-surface) ${collapsed ? 'invisible w-0' : ''}`}>
        <div
          ref={mountRef}
          id={mountId}
          data-felixo-terminal-mount
          role={hasReading ? 'tabpanel' : undefined}
          aria-labelledby={hasReading ? terminalTabId : undefined}
          aria-hidden={collapsed || readingActive || archiveOpen}
          inert={readingActive || archiveOpen}
          className="h-full min-w-0 flex-1 overflow-hidden px-1 pb-2 pt-1"
        />
        {detachedTerminal && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-(--f-core-black-surface) text-xs text-zinc-400">
            <span>
              {detachedTerminal.modo === 'pip'
                ? 'Este terminal está em picture-in-picture.'
                : 'Este terminal está em outra janela.'}
            </span>
            <button
              type="button"
              onClick={bringBackFromWindow}
              className="rounded-sm border border-white/15 px-2 py-1 text-zinc-200 hover:bg-white/10"
            >
              Trazer de volta
            </button>
          </div>
        )}
        {/* Claude em tela cheia: o xterm não tem barra nessa tela, então o app põe a dele ao lado. */}
        {scrollRailPlacement.render && (
          <TerminalScrollRail
            scrolledUp={scrollRail.scrolledUp}
            inert={scrollRailPlacement.inert}
            onScroll={(action) => store.scrollClaude(sessionId, action)}
          />
        )}
        {hasReading && readingProfile && (
          <TerminalReadingPanel
            sessionId={sessionId}
            profile={readingProfile}
            visible={readingActive && !collapsed}
            panelId={readingPanelId}
            labelledBy={readingTabId}
            panelRef={readingPanelRef}
          />
        )}
        {archiveOpen && !collapsed && (
          <Suspense fallback={null}>
            <TerminalArchivePanel
              ptySessionId={ptySessionIdForNode(sessionId)}
              onClose={() => {
                setArchiveFor(null)
                store.focus(sessionId)
              }}
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}
