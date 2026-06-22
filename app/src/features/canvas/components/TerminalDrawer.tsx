import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  useSessionSnapshot,
  useTerminalSessions,
} from '../terminal/terminal-session-context'
import { CopyButton } from './TerminalCopyButton'

type TerminalDrawerProps = {
  sessionId: string
  title: string
  onClose: () => void
}

const MIN_WIDTH = 360
const DEFAULT_WIDTH = 560

/**
 * Right-side drawer that hosts the live, interactive terminal for the expanded
 * node. It attaches the session's already-running xterm element (the PTY never
 * stopped), so expanding just reveals ongoing work.
 */
export function TerminalDrawer({ sessionId, title, onClose }: TerminalDrawerProps) {
  const store = useTerminalSessions()
  const snapshot = useSessionSnapshot(sessionId)
  const mountRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const draggingRef = useRef(false)

  // Attach the live terminal element into the drawer and focus it.
  useEffect(() => {
    const container = mountRef.current
    if (!container) {
      return
    }

    store.attach(sessionId, container)
    store.fit(sessionId)
    store.focus(sessionId)
  }, [store, sessionId])

  // Keep the terminal fitted as the drawer width changes.
  useEffect(() => {
    store.fit(sessionId)
  }, [store, sessionId, width])

  const onMouseDown = useCallback(() => {
    draggingRef.current = true
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
      draggingRef.current = false
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
      className="relative flex h-full flex-col border-l border-white/10 bg-[#0b0f14]"
      style={{ width }}
    >
      <div
        onMouseDown={onMouseDown}
        className="absolute left-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-emerald-500/40"
      />
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-sm text-zinc-200">
        <span className="truncate font-medium">{title}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">
            {snapshot?.activity === 'working'
              ? 'trabalhando'
              : snapshot?.activity === 'idle'
                ? 'aguardando'
                : snapshot?.activity === 'exited'
                  ? 'encerrado'
                  : ''}
          </span>
          <CopyButton onCopy={() => store.copy(sessionId)} />
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
            aria-label="Recolher terminal"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      {snapshot?.message && (
        <div className="border-b border-red-500/20 bg-red-950/30 px-3 py-2 text-xs text-red-300">
          {snapshot.message}
        </div>
      )}
      <div ref={mountRef} className="min-h-0 flex-1 p-1" />
    </div>
  )
}
