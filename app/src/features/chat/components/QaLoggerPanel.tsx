import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Terminal, Trash2 } from 'lucide-react'
import type { QaLogEntry } from '../types'

type QaLoggerPanelProps = {
  isOpen: boolean
  onToggleOpen: () => void
}

const MIN_HEIGHT = 96
const MAX_HEIGHT = 360
const DEFAULT_HEIGHT = 192

export function QaLoggerPanel({
  isOpen,
  onToggleOpen,
}: QaLoggerPanelProps) {
  const [entries, setEntries] = useState<QaLogEntry[]>([])
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const [dragging, setDragging] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const startY = useRef(0)
  const startHeight = useRef(0)

  const onMouseMove = useCallback((event: MouseEvent) => {
    if (!isDragging.current) {
      return
    }

    const delta = startY.current - event.clientY
    const nextHeight = Math.min(
      MAX_HEIGHT,
      Math.max(MIN_HEIGHT, startHeight.current + delta),
    )
    setHeight(nextHeight)
  }, [])

  const onMouseUp = useCallback(() => {
    isDragging.current = false
    setDragging(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  useEffect(() => {
    let isMounted = true

    window.felixo?.qaLogger?.getEntries().then((nextEntries) => {
      if (isMounted) {
        setEntries(nextEntries)
      }
    })

    const removeEntryListener = window.felixo?.qaLogger?.onEntry((entry) => {
      setEntries((currentEntries) => [...currentEntries, entry].slice(-400))
    })
    const removeClearListener = window.felixo?.qaLogger?.onCleared(() => {
      setEntries([])
    })

    return () => {
      isMounted = false
      removeEntryListener?.()
      removeClearListener?.()
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    endRef.current?.scrollIntoView({ block: 'end' })
  }, [entries, isOpen])

  useEffect(() => {
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  function clearLogs() {
    window.felixo?.qaLogger?.clear()
  }

  function handleDragStart(event: React.MouseEvent) {
    isDragging.current = true
    setDragging(true)
    startY.current = event.clientY
    startHeight.current = height
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }

  if (!isOpen) {
    return (
      <section className="h-10 shrink-0 border-t border-white/[0.08] bg-[#10100f] text-zinc-400">
        <header className="flex h-full items-center justify-between px-3">
          <div className="flex min-w-0 items-center gap-2 text-[11px] font-medium">
            <Terminal size={13} aria-hidden="true" />
            <span>QA Logger</span>
            <span className="rounded-full border border-white/[0.08] px-2 py-0.5 font-mono text-[10px] text-zinc-500">
              {entries.length}
            </span>
          </div>

          <button
            type="button"
            title="Abrir QA Logger"
            onClick={onToggleOpen}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
          >
            <ChevronUp size={14} aria-hidden="true" />
            <span className="sr-only">Abrir QA Logger</span>
          </button>
        </header>
      </section>
    )
  }

  return (
    <section
      style={{ height }}
      className={[
        'relative shrink-0 border-t border-white/[0.08] bg-[#10100f] text-zinc-300',
        dragging ? '' : 'transition-[height] duration-300 ease-in-out',
      ].join(' ')}
    >
      <header className="flex h-9 items-center justify-between border-b border-white/[0.07] px-3">
        <div className="flex min-w-0 items-center gap-2 text-[11px] font-medium text-zinc-400">
          <Terminal size={13} aria-hidden="true" />
          <span>QA Logger</span>
          <span className="rounded-full border border-white/[0.08] px-2 py-0.5 font-mono text-[10px] text-zinc-500">
            {entries.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Limpar logs"
            onClick={clearLogs}
            disabled={entries.length === 0}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-700 disabled:hover:bg-transparent"
          >
            <Trash2 size={13} aria-hidden="true" />
            <span className="sr-only">Limpar logs</span>
          </button>
          <button
            type="button"
            title="Recolher QA Logger"
            onClick={onToggleOpen}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
          >
            <ChevronDown size={14} aria-hidden="true" />
            <span className="sr-only">Recolher QA Logger</span>
          </button>
        </div>
      </header>

      <div className="h-[calc(100%-2.25rem)] overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
        {entries.length === 0 ? (
          <p className="text-zinc-600">Aguardando eventos do backend.</p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="grid grid-cols-[4.25rem_3.75rem_5.5rem_minmax(0,1fr)] gap-2 border-b border-white/[0.03] py-1 last:border-b-0"
            >
              <span className="text-zinc-600">{formatTime(entry.createdAt)}</span>
              <span className={getLevelClassName(entry.level)}>
                {entry.level.toUpperCase()}
              </span>
              <span className="truncate text-zinc-500">{entry.scope}</span>
              <span className="min-w-0 whitespace-pre-wrap break-words text-zinc-300">
                {entry.message}
                {entry.sessionId && (
                  <span className="text-zinc-600"> [{entry.sessionId.slice(0, 8)}]</span>
                )}
                {entry.details !== null && (
                  <span className="block text-zinc-500">
                    {formatDetails(entry.details)}
                  </span>
                )}
              </span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <div
        onMouseDown={handleDragStart}
        className="absolute left-0 top-0 h-1 w-full cursor-row-resize hover:bg-white/10 active:bg-white/20"
      />
    </section>
  )
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function formatDetails(details: unknown) {
  if (typeof details === 'string') {
    return details
  }

  return JSON.stringify(details)
}

function getLevelClassName(level: QaLogEntry['level']) {
  if (level === 'error') {
    return 'text-red-300'
  }

  if (level === 'warn') {
    return 'text-yellow-300'
  }

  if (level === 'debug') {
    return 'text-sky-300'
  }

  return 'text-emerald-300'
}
