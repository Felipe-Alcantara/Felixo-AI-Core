import { useEffect, useRef, useState } from 'react'
import { Terminal, Trash2 } from 'lucide-react'
import type { QaLogEntry } from '../types'

export function QaLoggerPanel() {
  const [entries, setEntries] = useState<QaLogEntry[]>([])
  const endRef = useRef<HTMLDivElement>(null)

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
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [entries])

  function clearLogs() {
    window.felixo?.qaLogger?.clear()
  }

  return (
    <section className="h-48 shrink-0 border-t border-white/[0.08] bg-[#10100f] text-zinc-300">
      <header className="flex h-9 items-center justify-between border-b border-white/[0.07] px-3">
        <div className="flex min-w-0 items-center gap-2 text-[11px] font-medium text-zinc-400">
          <Terminal size={13} aria-hidden="true" />
          <span>QA Logger</span>
          <span className="rounded-full border border-white/[0.08] px-2 py-0.5 font-mono text-[10px] text-zinc-500">
            {entries.length}
          </span>
        </div>

        <button
          type="button"
          title="Limpar logs"
          onClick={clearLogs}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
        >
          <Trash2 size={13} aria-hidden="true" />
          <span className="sr-only">Limpar logs</span>
        </button>
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
