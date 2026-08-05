import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
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
import { useExitAnimation } from '../hooks/useExitAnimation'
import { DRAWER_EXIT_MS } from '../services/animation-timing'
import {
  COLLAPSED_WIDTH,
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
  }
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
  onClose,
}: TerminalDrawerProps) {
  const store = useTerminalSessions()
  const snapshot = useSessionSnapshot(sessionId)
  const canRestart = snapshot?.activity === 'exited' || snapshot?.activity === 'error'
  const mountRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(() =>
    readWidthPreference(
      localStorage,
      Math.min(DEFAULT_WIDTH, Math.max(MIN_WIDTH, Math.floor(window.innerWidth * 0.45))),
      MIN_WIDTH,
      Math.max(MIN_WIDTH, window.innerWidth - 200),
    ),
  )
  const draggingRef = useRef(false)
  const [resizing, setResizing] = useState(false)
  const { closing, close } = useExitAnimation(DRAWER_EXIT_MS, onClose)
  const [pinned, setPinned] = useState(() => readPinnedPreference(localStorage))
  // Collapsed keeps the session running and the terminal mounted — the drawer
  // just shrinks to a rail, so reopening is instant and nothing is lost.
  const [collapsed, setCollapsed] = useState(() => readCollapsedPreference(localStorage))
  const [maximized, setMaximized] = useState(false)

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

  const effectiveWidth = collapsed ? COLLAPSED_WIDTH : maximized ? window.innerWidth - 120 : width

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
  }, [store, sessionId])

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
      const next = Math.max(MIN_WIDTH, window.innerWidth - event.clientX)
      setWidth(Math.min(next, window.innerWidth - 200))
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
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={`relative flex h-full flex-col border-l border-white/10 bg-[#0b0f14] ${
        closing ? 'felixo-anim-drawer-out' : 'felixo-anim-drawer-in'
      }`}
      style={{
        width: collapsed
          ? `${COLLAPSED_WIDTH}px`
          : maximized
            ? 'calc(100vw - 120px)'
            : `min(${width}px, 75vw)`,
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
          {!collapsed && canRestart && (
            <button
              type="button"
              onClick={() => store.restart(sessionId, restartOptions ?? {})}
              className="felixo-btn-icon rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
              aria-label="Reiniciar terminal"
              title="Reiniciar terminal"
            >
              <RotateCcw size={16} />
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
      {/* The terminal element stays mounted while collapsed (the PTY and its
          scrollback must survive); only its box is hidden. */}
      <div
        ref={mountRef}
        className={`min-h-0 flex-1 overflow-hidden px-1 pb-2 pt-1 ${collapsed ? 'invisible w-0' : ''}`}
      />
    </div>
  )
}
