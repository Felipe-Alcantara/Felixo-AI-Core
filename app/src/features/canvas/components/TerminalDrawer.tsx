import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
  RotateCcw,
  X,
} from 'lucide-react'
import {
  useSessionSnapshot,
  useTerminalSessions,
} from '../terminal/terminal-session-context'
import { CopyButton } from './TerminalCopyButton'
import { resolveOpenEditorFile } from './terminal-open-file'
import { useExitAnimation } from '../hooks/useExitAnimation'
import { DRAWER_EXIT_MS } from '../services/animation-timing'
import type { AgentSessionReference } from '../services/agent-session'
import { terminalScrollbackNotice } from '../terminal/terminal-scrollback'
import { useCanvasSurfaces } from '../hooks/canvas-surfaces-context'
import { drawerWidthLimit } from '../services/canvas-surfaces'
import {
  clampDrawerWidth,
  COLLAPSED_WIDTH,
  getDrawerMaxWidth,
  readCollapsedPreference,
  readPinnedPreference,
  readWidthPreference,
  shouldCloseOnOutsideClick,
  writeCollapsedPreference,
  writePinnedPreference,
  writeWidthPreference,
} from './terminal-drawer-pin'

type TerminalDrawerProps = {
  sessionId: string
  title: string
  /** Launch options to relaunch with when the session has exited (see restart button). */
  restartOptions?: {
    command?: string
    args?: string[]
    cwd?: string
    initialText?: string
    sourceLabel?: string
    /** Conta cujo ambiente deve continuar valendo quando o drawer reiniciar. */
    accountId?: string
    /** Provedor da conta; acompanha o restart até a validação do PTY. */
    providerId?: string
    agentSession?: AgentSessionReference
    resumeAgentSession?: boolean
    /** Render-time total used only when this drawer creates a fresh xterm. */
    terminalCount?: number
  }
  /**
   * Abre a escolha do agente que vai assumir o trabalho, levando o histórico
   * completo da sessão. Sempre disponível: passar responsabilidade é uma
   * decisão do usuário, não a consequência de um estado detectado.
   */
  onPassResponsibility?: (transcript: string) => void
  /**
   * Cria (ou reaproveita) o bloco "arquivo" apontando para o caminho dado, já
   * em modo visualização — o mesmo bloco que o painel Projetos cria ao abrir
   * um arquivo existente. Terminal continua sendo pty puro; quem renderiza
   * markdown/código/imagem é sempre o bloco arquivo.
   */
  onOpenFilePreview?: (filePath: string, fileName: string) => void
  onClose: () => void
}

const MIN_WIDTH = 440
const DEFAULT_WIDTH = 720

/**
 * Right-side drawer that hosts the live, interactive terminal for the expanded
 * node. It attaches the session's already-running xterm element (the PTY never
 * stopped), so expanding just reveals ongoing work.
 */
export function TerminalDrawer({
  sessionId,
  title,
  restartOptions,
  onPassResponsibility,
  onOpenFilePreview,
  onClose,
}: TerminalDrawerProps) {
  const store = useTerminalSessions()
  const snapshot = useSessionSnapshot(sessionId)
  const scrollbackNotice = terminalScrollbackNotice(snapshot?.scrollback)
  const isLive = snapshot?.activity !== 'exited' && snapshot?.activity !== 'error'
  const restart = () => {
    if (isLive && !window.confirm('O processo deste terminal ainda está rodando. Reiniciar mesmo assim?')) {
      return
    }
    store.restart(sessionId, restartOptions ?? {})
  }
  const mountRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(() =>
    (() => {
      const maxWidth = getDrawerMaxWidth(window.innerWidth)
      return readWidthPreference(
        localStorage,
        clampDrawerWidth(
          Math.min(DEFAULT_WIDTH, Math.max(MIN_WIDTH, Math.floor(window.innerWidth * 0.45))),
          window.innerWidth,
          MIN_WIDTH,
        ),
        Math.min(MIN_WIDTH, maxWidth),
        maxWidth,
      )
    })(),
  )
  const draggingRef = useRef(false)
  const [resizing, setResizing] = useState(false)
  const { closing, close } = useExitAnimation(DRAWER_EXIT_MS, onClose)
  const [pinned, setPinned] = useState(() => readPinnedPreference(localStorage))
  // Collapsed keeps the session running and the terminal mounted — the drawer
  // just shrinks to a rail, so reopening is instant and nothing is lost.
  const [collapsed, setCollapsed] = useState(() => readCollapsedPreference(localStorage))
  const { occupancy, viewport, reportDrawerWidth } = useCanvasSurfaces()
  // Teto vindo do que o painel da esquerda ocupa: os dois disputam a mesma
  // largura, e crescer um encolhe o outro em vez de cobrir.
  const widthLimit = drawerWidthLimit(viewport.width, occupancy, MIN_WIDTH)
  // O listener de arrasto é montado uma vez só; o teto muda enquanto ele está
  // vivo, então chega por ref em vez de remontar o listener a cada mudança.
  const widthLimitRef = useRef(widthLimit)
  useEffect(() => {
    widthLimitRef.current = widthLimit
  }, [widthLimit])
  const [maximized, setMaximized] = useState(false)
  const [handoffError, setHandoffError] = useState<string | undefined>()
  const [previewError, setPreviewError] = useState<string | undefined>()

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

  // Lê o histórico e entrega a escolha do agente para quem sabe criar nós no
  // canvas. O único motivo para o botão falhar aqui é não haver histórico —
  // uma sessão que acabou de subir e ainda não escreveu nada.
  const startResponsibilityHandoff = useCallback(() => {
    if (!onPassResponsibility) {
      return
    }

    const transcript = store.getTranscript(sessionId).text
    if (!transcript.trim()) {
      setHandoffError('Este terminal ainda não tem histórico para transferir.')
      return
    }

    setHandoffError(undefined)
    onPassResponsibility(transcript)
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

  const effectiveWidth = collapsed
    ? COLLAPSED_WIDTH
    : maximized
      ? Math.max(COLLAPSED_WIDTH, window.innerWidth - 120)
      : Math.min(width, widthLimit)

  // Publica o que está ocupando de fato — inclusive recolhida e maximizada —
  // para o painel da esquerda se ajustar a cada um desses estados.
  useEffect(() => {
    reportDrawerWidth(effectiveWidth)
    return () => reportDrawerWidth(0)
  }, [effectiveWidth, reportDrawerWidth])

  // Click outside the drawer closes it, unless pinned.
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (shouldCloseOnOutsideClick(pinned, containerRef.current, event.target as Node)) {
        close()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [pinned, close])

  // Attach the live terminal element into the drawer and focus it.
  //
  // `restart()` swaps in a brand-new xterm.Terminal under the same sessionId,
  // so `snapshot.generation` is in the deps too — without it this effect
  // wouldn't re-run after a restart, and the drawer would keep showing the
  // disposed terminal's (now-empty) container until it was closed and
  // reopened.
  useEffect(() => {
    const container = mountRef.current
    if (!container) {
      return
    }

    store.attach(sessionId, container)
    store.fit(sessionId)
    store.focus(sessionId)

    const rafId = window.requestAnimationFrame(() => {
      store.fit(sessionId)
    })

    // Re-fit whenever the mount box settles (open animation ends, window
    // resizes, drawer width changes). Without this the last row can stay
    // clipped because the first fit ran mid-animation on a smaller box.
    const observer = new ResizeObserver(() => store.fit(sessionId))
    observer.observe(container)

    return () => {
      window.cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [store, sessionId, snapshot?.generation])

  // Keep the terminal fitted as the drawer width changes. Expanding also
  // returns focus to the terminal so the user can type right away.
  useEffect(() => {
    if (collapsed) return
    store.fit(sessionId)
    store.focus(sessionId)
  }, [store, sessionId, effectiveWidth, collapsed])

  const onMouseDown = useCallback(() => {
    draggingRef.current = true
    setResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!draggingRef.current) {
        return
      }
      const next = window.innerWidth - event.clientX
      setWidth(
        Math.min(
          widthLimitRef.current,
          clampDrawerWidth(next, window.innerWidth, MIN_WIDTH),
        ),
      )
    }
    const onMouseUp = () => {
      if (draggingRef.current) {
        // Persist on release only: writing on every mousemove would hit
        // localStorage once per frame.
        setWidth((current) => {
          writeWidthPreference(localStorage, current)
          return current
        })
      }
      draggingRef.current = false
      setResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      if (draggingRef.current) {
        draggingRef.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={`relative flex h-full flex-col border-l border-white/10 bg-[#0b0f14] ${
        closing ? 'felixo-anim-drawer-out' : 'felixo-anim-drawer-in'
      }`}
      style={{
        // `effectiveWidth` já vem limitado pelo que o painel da esquerda
        // ocupa; usar a largura crua aqui era o que deixava a gaveta passar
        // por cima dele mesmo depois de o limite ter sido calculado.
        width: maximized
          ? 'max(44px, calc(100vw - 120px))'
          : `${effectiveWidth}px`,
        // Animate the collapse/maximize toggles, but never the resize drag —
        // the edge must track the pointer 1:1.
        transition: resizing ? undefined : 'width 560ms cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      {!collapsed && !maximized && (
        <div
          onMouseDown={onMouseDown}
          className="absolute left-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-emerald-500/40"
        />
      )}
      <div
        className={`flex items-center border-b border-white/10 py-2 text-sm text-zinc-200 ${
          collapsed ? 'flex-col gap-2 px-1' : 'justify-between px-3'
        }`}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expandir terminal' : 'Recolher terminal'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expandir terminal' : 'Recolher terminal'}
          className="felixo-btn-icon shrink-0 rounded p-1 text-zinc-400 transition-transform duration-500 hover:bg-white/10 hover:text-zinc-100"
        >
          {collapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
        {collapsed ? (
          // Vertical title strip, so the rail still says which agent it is.
          <span
            className="felixo-anim-sequential-panel min-h-0 flex-1 select-none truncate text-xs text-zinc-500"
            style={{ writingMode: 'vertical-rl' }}
            title={title}
          >
            {title}
          </span>
        ) : (
          <span className="felixo-anim-sequential-panel mr-auto ml-2 truncate font-medium">
            {title}
          </span>
        )}
        <div className={`flex items-center gap-2 ${collapsed ? 'flex-col' : ''}`}>
          {!collapsed && (
            <span className="text-xs text-zinc-500">
              {snapshot?.activity === 'working'
                ? 'trabalhando'
                : snapshot?.activity === 'idle'
                  ? 'aguardando'
                  : snapshot?.activity === 'exited'
                    ? 'encerrado'
                    : ''}
            </span>
          )}
          {!collapsed && (
            <span
              className="hidden text-[11px] text-zinc-600 sm:inline"
              title="Use Ctrl+clique (Windows/Linux) ou Cmd+clique (macOS) para abrir links no navegador"
            >
              links: Ctrl/Cmd+clique
            </span>
          )}
          {collapsed && (
            // The rail keeps a status dot so a collapsed agent still shows life.
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                snapshot?.activity === 'working'
                  ? 'bg-sky-400'
                  : snapshot?.activity === 'idle'
                    ? 'bg-emerald-400'
                    : snapshot?.activity === 'exited'
                      ? 'bg-zinc-600'
                      : 'bg-amber-400'
              }`}
              title={snapshot?.activity ?? ''}
            />
          )}
          {!collapsed && <CopyButton onCopy={() => store.copy(sessionId)} />}
          {!collapsed && (
            <button
              type="button"
              onClick={toggleMaximized}
              className="felixo-btn-icon rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
              aria-label={maximized ? 'Restaurar largura' : 'Maximizar terminal'}
              aria-pressed={maximized}
              title={maximized ? 'Restaurar largura' : 'Maximizar terminal'}
            >
              {maximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          )}
          {!collapsed && (
            <button
              type="button"
              onClick={restart}
              className="felixo-btn-icon rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
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
              className="felixo-btn-icon rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
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
              className="felixo-btn-icon rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
              aria-label="Passar responsabilidade para outro agente"
              title="Passar responsabilidade para outro agente"
            >
              <ArrowRightLeft size={16} />
            </button>
          )}
          {!collapsed && <button
            type="button"
            onClick={togglePinned}
            className={`felixo-btn-icon rounded p-1 hover:bg-white/10 ${
              pinned ? 'text-emerald-400 hover:text-emerald-300' : 'text-zinc-400 hover:text-zinc-100'
            }`}
            aria-label={pinned ? 'Desafixar terminal' : 'Fixar terminal'}
            title={pinned ? 'Desafixar (fecha ao clicar fora)' : 'Fixar (mantém aberto ao clicar fora)'}
          >
            {pinned ? <Pin size={16} /> : <PinOff size={16} />}
          </button>}
          <button
            type="button"
            onClick={close}
            className="felixo-btn-icon rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
            aria-label="Fechar terminal"
            title="Fechar terminal"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      {!collapsed && snapshot?.message && (
        <div className="border-b border-red-500/20 bg-red-950/30 px-3 py-2 text-xs text-red-300">
          {snapshot.message}
        </div>
      )}
      {!collapsed && snapshot?.contextWarning && (
        <div className="border-b border-amber-500/20 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
          {snapshot.contextWarning}
        </div>
      )}
      {!collapsed && scrollbackNotice && (
        <div role="status" className="border-b border-amber-500/20 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
          {scrollbackNotice}
        </div>
      )}
      {!collapsed && handoffError && (
        <div className="border-b border-red-500/20 bg-red-950/30 px-3 py-2 text-xs text-red-300">
          {handoffError}
        </div>
      )}
      {!collapsed && previewError && (
        <div className="border-b border-red-500/20 bg-red-950/30 px-3 py-2 text-xs text-red-300">
          {previewError}
        </div>
      )}
      {/* The terminal element stays mounted while collapsed (the PTY and its
          scrollback must survive); only its box is hidden. */}
      <div
        ref={mountRef}
        className={`min-h-0 flex-1 overflow-hidden px-1 pb-2 pt-1 ${collapsed ? 'invisible w-0' : ''}`}
      />
    </div>
  )
}
