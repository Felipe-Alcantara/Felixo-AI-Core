import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ChevronRight, Terminal, Trash2 } from 'lucide-react'
import type {
  TerminalOutputChunk,
  TerminalOutputSession,
  TerminalSessionStatus,
} from '../hooks/useTerminalOutput'

type TerminalPanelProps = {
  sessions: TerminalOutputSession[]
  isOpen: boolean
  onToggleOpen: () => void
  onClear: () => void
}

export function TerminalPanel({
  sessions,
  isOpen,
  onToggleOpen,
  onClear,
}: TerminalPanelProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true)
  const outputRef = useRef<HTMLDivElement>(null)
  const outputEndRef = useRef<HTMLDivElement>(null)

  const effectiveSelectedSessionId =
    sessions.some((session) => session.sessionId === selectedSessionId)
      ? selectedSessionId
      : sessions[0]?.sessionId ?? null

  const selectedSession = useMemo(
    () =>
      sessions.find(
        (session) => session.sessionId === effectiveSelectedSessionId,
      ) ??
      null,
    [effectiveSelectedSessionId, sessions],
  )

  useEffect(() => {
    if (!isOpen || !isPinnedToBottom) {
      return
    }

    outputEndRef.current?.scrollIntoView({ block: 'end' })
  }, [
    effectiveSelectedSessionId,
    isOpen,
    isPinnedToBottom,
    selectedSession?.chunks.length,
  ])

  function handleOutputScroll() {
    const output = outputRef.current

    if (!output) {
      return
    }

    const distanceFromBottom =
      output.scrollHeight - output.scrollTop - output.clientHeight
    setIsPinnedToBottom(distanceFromBottom < 32)
  }

  function jumpToBottom() {
    setIsPinnedToBottom(true)
    outputEndRef.current?.scrollIntoView({ block: 'end' })
  }

  function selectSession(sessionId: string) {
    setSelectedSessionId(sessionId)
    setIsPinnedToBottom(true)
  }

  if (!isOpen) {
    return (
      <aside className="flex w-11 shrink-0 flex-col items-center border-l border-white/[0.08] bg-[#111110] pt-3 text-zinc-500 max-[1020px]:hidden">
        <button
          type="button"
          title="Abrir terminal"
          onClick={onToggleOpen}
          className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-white/[0.06] hover:text-zinc-200"
        >
          <Terminal size={15} aria-hidden="true" />
          <span className="sr-only">Abrir terminal</span>
        </button>
        {sessions.some((session) => session.status === 'running') && (
          <span className="mt-2 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />
        )}
      </aside>
    )
  }

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-white/[0.08] bg-[#111110] text-zinc-300 max-[1020px]:hidden">
      <header className="flex h-12 items-center justify-between border-b border-white/[0.07] px-3">
        <div className="flex min-w-0 items-center gap-2 text-[12px] font-medium text-zinc-300">
          <Terminal size={15} aria-hidden="true" />
          <span>Terminal</span>
          <span className="rounded-full border border-white/[0.08] px-2 py-0.5 font-mono text-[10px] text-zinc-500">
            {sessions.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Limpar terminal"
            onClick={onClear}
            disabled={sessions.length === 0}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-700 disabled:hover:bg-transparent"
          >
            <Trash2 size={13} aria-hidden="true" />
            <span className="sr-only">Limpar terminal</span>
          </button>
          <button
            type="button"
            title="Recolher terminal"
            onClick={onToggleOpen}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
          >
            <ChevronRight size={15} aria-hidden="true" />
            <span className="sr-only">Recolher terminal</span>
          </button>
        </div>
      </header>

      <div className="max-h-40 shrink-0 overflow-y-auto border-b border-white/[0.07] p-2">
        {sessions.length === 0 ? (
          <p className="px-2 py-3 text-[12px] text-zinc-600">
            Aguardando execução.
          </p>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => (
              <button
                key={session.sessionId}
                type="button"
                onClick={() => selectSession(session.sessionId)}
                className={[
                  'flex min-h-10 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition',
                  effectiveSelectedSessionId === session.sessionId
                    ? 'bg-white/[0.07] text-zinc-100'
                    : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300',
                ].join(' ')}
              >
                <span
                  className={[
                    'h-2 w-2 shrink-0 rounded-full',
                    getStatusDotClassName(session.status),
                  ].join(' ')}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[11px]">
                    {session.sessionId.slice(0, 8)}
                  </span>
                  <span className="block truncate text-[10px] text-zinc-600">
                    {formatStatus(session.status)} · {session.chunks.length} chunks ·{' '}
                    {formatBytes(session.outputSize)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.06] px-3">
          <span className="font-mono text-[10px] text-zinc-500">
            {selectedSession
              ? `${selectedSession.sessionId.slice(0, 8)} · ${formatTime(
                  selectedSession.updatedAt,
                )}`
              : 'sem sessão'}
          </span>
          {selectedSession && (
            <span
              className={[
                'rounded-full border px-2 py-0.5 text-[10px]',
                getStatusBadgeClassName(selectedSession.status),
              ].join(' ')}
            >
              {formatStatus(selectedSession.status)}
            </span>
          )}
        </div>

        <div className="relative min-h-0 flex-1">
          <div
            ref={outputRef}
            onScroll={handleOutputScroll}
            className="h-full overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed"
          >
            {!selectedSession || selectedSession.chunks.length === 0 ? (
              <p className="text-zinc-600">Sem output bruto.</p>
            ) : (
              <div className="whitespace-pre-wrap break-words">
                {selectedSession.chunks.map((chunk) => (
                  <TerminalChunk key={chunk.id} chunk={chunk} />
                ))}
              </div>
            )}
            <div ref={outputEndRef} />
          </div>

          {!isPinnedToBottom && (
            <button
              type="button"
              title="Ir para o fim"
              onClick={jumpToBottom}
              className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-[#242423] text-zinc-300 shadow-soft transition hover:bg-[#30302f] hover:text-white"
            >
              <ArrowDown size={14} aria-hidden="true" />
              <span className="sr-only">Ir para o fim</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}

function TerminalChunk({ chunk }: { chunk: TerminalOutputChunk }) {
  return (
    <span
      title={chunk.source}
      className={getChunkClassName(chunk)}
    >
      {chunk.chunk}
    </span>
  )
}

function getChunkClassName(chunk: TerminalOutputChunk) {
  if (chunk.source === 'stdout') {
    return 'text-zinc-300'
  }

  if (chunk.severity === 'debug' || chunk.severity === 'info') {
    return 'text-zinc-500'
  }

  if (chunk.severity === 'warn') {
    return 'text-amber-300'
  }

  return 'text-red-300'
}

function getStatusDotClassName(status: TerminalSessionStatus) {
  if (status === 'running') {
    return 'animate-pulse bg-amber-300'
  }

  if (status === 'error') {
    return 'bg-red-400'
  }

  if (status === 'stopped') {
    return 'bg-zinc-500'
  }

  return 'bg-emerald-400'
}

function getStatusBadgeClassName(status: TerminalSessionStatus) {
  if (status === 'running') {
    return 'border-amber-200/20 bg-amber-200/10 text-amber-200'
  }

  if (status === 'error') {
    return 'border-red-200/20 bg-red-200/10 text-red-200'
  }

  if (status === 'stopped') {
    return 'border-zinc-200/10 bg-zinc-200/5 text-zinc-400'
  }

  return 'border-emerald-200/20 bg-emerald-200/10 text-emerald-200'
}

function formatStatus(status: TerminalSessionStatus) {
  if (status === 'running') {
    return 'Rodando'
  }

  if (status === 'error') {
    return 'Erro'
  }

  if (status === 'stopped') {
    return 'Interrompido'
  }

  return 'Concluído'
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}
