import { useEffect, useRef, useState } from 'react'
import { Terminal, Trash2 } from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'
import type { QaLogEntry } from '../../../shared/types/qa-log'

type QaLoggerPanelProps = {
  onClose: () => void
  /** Widens the toolbar column; the panel slides over to clear it. */
  toolsMenuOpen?: boolean
}

/** Mesmo teto do dock antigo: o log é diagnóstico, não histórico. */
const MAX_ENTRIES = 400

/**
 * Eventos do processo principal, no canvas.
 *
 * Existia só como dock da tela de chat, então quem trabalha no canvas não via
 * nada do backend quando algo dava errado. Aqui vira painel de ferramenta,
 * como os outros, em vez de ocupar altura fixa da tela o tempo todo.
 */
export function QaLoggerPanel({ onClose, toolsMenuOpen }: QaLoggerPanelProps) {
  const [entries, setEntries] = useState<QaLogEntry[]>([])
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let isMounted = true

    void window.felixo?.qaLogger?.getEntries().then((nextEntries) => {
      if (isMounted) {
        setEntries(nextEntries.slice(-MAX_ENTRIES))
      }
    })

    const removeEntryListener = window.felixo?.qaLogger?.onEntry((entry) => {
      setEntries((current) => [...current, entry].slice(-MAX_ENTRIES))
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

  return (
    <CanvasPanel
      title="QA Logger"
      icon={<Terminal size={15} />}
      onClose={onClose}
      widthClassName="w-[30rem]"
      toolsMenuOpen={toolsMenuOpen}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-full border border-white/[0.08] px-2 py-0.5 font-mono text-[10px] text-zinc-500">
          {entries.length}
        </span>
        <button
          type="button"
          onClick={() => window.felixo?.qaLogger?.clear()}
          className="felixo-btn ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
        >
          <Trash2 size={12} />
          Limpar
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="text-[11px] text-zinc-600">Aguardando eventos do backend.</p>
      ) : (
        <div className="font-mono text-[10px] leading-relaxed">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="border-b border-white/[0.03] py-1 last:border-b-0"
            >
              <div className="flex items-baseline gap-2">
                <span className="shrink-0 text-zinc-600">
                  {formatTime(entry.createdAt)}
                </span>
                <span className={`shrink-0 ${getLevelClassName(entry.level)}`}>
                  {entry.level.toUpperCase()}
                </span>
                <span className="truncate text-zinc-500">{entry.scope}</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-zinc-300">
                {entry.message}
                {entry.sessionId && (
                  <span className="text-zinc-600"> [{entry.sessionId.slice(0, 8)}]</span>
                )}
              </p>
              {entry.details !== null && (
                <p className="whitespace-pre-wrap break-words text-zinc-500">
                  {formatDetails(entry.details)}
                </p>
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
    </CanvasPanel>
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
  return typeof details === 'string' ? details : JSON.stringify(details)
}

function getLevelClassName(level: QaLogEntry['level']) {
  if (level === 'error') {
    return 'text-theme-error'
  }

  if (level === 'warn') {
    return 'text-yellow-300'
  }

  if (level === 'debug') {
    return 'text-sky-300'
  }

  return 'text-theme-success'
}
