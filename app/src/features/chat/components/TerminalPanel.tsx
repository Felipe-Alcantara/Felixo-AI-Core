import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

const MIN_WIDTH = 280
const MAX_WIDTH = 640
const DEFAULT_WIDTH = 360

export function TerminalPanel({
  sessions,
  isOpen,
  onToggleOpen,
  onClear,
}: TerminalPanelProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [dragging, setDragging] = useState(false)
  const [viewMode, setViewMode] = useState<'orchestrator' | 'threads'>(
    'threads',
  )
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true)
  const outputRef = useRef<HTMLDivElement>(null)
  const outputEndRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)
  const visibleSessions = useMemo(() => createVisibleSessions(sessions), [sessions])
  const hiddenSessionParentId = useMemo(() => {
    const hiddenParents = new Map<string, string>()

    for (const session of sessions) {
      if (
        isOrchestratorTurnSession(session) &&
        session.parentThreadId &&
        sessions.some((item) => item.sessionId === session.parentThreadId)
      ) {
        hiddenParents.set(session.sessionId, session.parentThreadId)
      }
    }

    return hiddenParents
  }, [sessions])

  const effectiveSelectedSessionId =
    visibleSessions.some((session) => session.sessionId === selectedSessionId)
      ? selectedSessionId
      : selectedSessionId && hiddenSessionParentId.has(selectedSessionId)
        ? hiddenSessionParentId.get(selectedSessionId) ?? null
        : visibleSessions[0]?.sessionId ?? null

  const selectedSession = useMemo(
    () =>
      visibleSessions.find(
        (session) => session.sessionId === effectiveSelectedSessionId,
      ) ??
      null,
    [effectiveSelectedSessionId, visibleSessions],
  )
  const groupedSessionRows = useMemo(
    () => createGroupedSessionRows(visibleSessions),
    [visibleSessions],
  )
  const orchestratorEntries = useMemo(
    () =>
      visibleSessions
        .flatMap((session) =>
          session.chunks
            .filter((chunk) => chunk.kind !== 'tool')
            .map((chunk) => ({
              chunk,
              sessionId: session.sessionId,
            })),
        )
        .sort(
          (a, b) =>
            new Date(a.chunk.createdAt).getTime() -
            new Date(b.chunk.createdAt).getTime(),
        ),
    [visibleSessions],
  )

  const selectedThreadEntries = useMemo(
    () => selectedSession?.chunks ?? [],
    [selectedSession],
  )

  const onMouseMove = useCallback((event: MouseEvent) => {
    if (!isDragging.current) {
      return
    }

    const delta = startX.current - event.clientX
    const nextWidth = Math.min(
      MAX_WIDTH,
      Math.max(MIN_WIDTH, startWidth.current + delta),
    )
    setWidth(nextWidth)
  }, [])

  const onMouseUp = useCallback(() => {
    isDragging.current = false
    setDragging(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  useEffect(() => {
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  useEffect(() => {
    if (!isOpen || !isPinnedToBottom) {
      return
    }

    outputEndRef.current?.scrollIntoView({ block: 'end' })
  }, [
    effectiveSelectedSessionId,
    isOpen,
    isPinnedToBottom,
    orchestratorEntries.length,
    selectedSession?.chunks.length,
    viewMode,
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
    setViewMode('threads')
    setIsPinnedToBottom(true)
  }

  function handleDragStart(event: React.MouseEvent) {
    isDragging.current = true
    setDragging(true)
    startX.current = event.clientX
    startWidth.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  if (!isOpen) {
    return (
      <aside className="flex w-11 shrink-0 flex-col items-center border-l border-white/[0.08] bg-[#111110] pt-3 text-zinc-500 max-[1020px]:hidden">
        <button
          type="button"
          title="Abrir logs da CLI"
          onClick={onToggleOpen}
          className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-white/[0.06] hover:text-zinc-200"
        >
          <Terminal size={15} aria-hidden="true" />
          <span className="sr-only">Abrir logs da CLI</span>
        </button>
        {sessions.some((session) => session.status === 'running') && (
          <span className="mt-2 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />
        )}
      </aside>
    )
  }

  return (
    <aside
      style={{ width }}
      className={[
        'relative flex shrink-0 flex-col border-l border-white/[0.08] bg-[#111110] text-zinc-300 max-[1020px]:hidden',
        dragging ? '' : 'transition-[width] duration-300 ease-in-out',
      ].join(' ')}
    >
      <header className="flex h-12 items-center justify-between border-b border-white/[0.07] px-3">
        <div className="flex min-w-0 items-center gap-2 text-[12px] font-medium text-zinc-300">
          <Terminal size={15} aria-hidden="true" />
          <span>Logs da CLI</span>
          <span className="rounded-full border border-white/[0.08] px-2 py-0.5 font-mono text-[10px] text-zinc-500">
            {visibleSessions.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Limpar logs da CLI"
            onClick={onClear}
            disabled={visibleSessions.length === 0}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-700 disabled:hover:bg-transparent"
          >
            <Trash2 size={13} aria-hidden="true" />
            <span className="sr-only">Limpar logs da CLI</span>
          </button>
          <button
            type="button"
            title="Recolher logs da CLI"
            onClick={onToggleOpen}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
          >
            <ChevronRight size={15} aria-hidden="true" />
            <span className="sr-only">Recolher logs da CLI</span>
          </button>
        </div>
      </header>

      <div className="flex shrink-0 gap-1 border-b border-white/[0.07] px-3 py-2">
        <button
          type="button"
          onClick={() => setViewMode('threads')}
          className={[
            'h-7 flex-1 rounded-lg text-[11px] transition',
            viewMode === 'threads'
              ? 'bg-white/[0.08] text-zinc-100'
              : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300',
          ].join(' ')}
        >
          Execuções
        </button>
        <button
          type="button"
          onClick={() => setViewMode('orchestrator')}
          className={[
            'h-7 flex-1 rounded-lg text-[11px] transition',
            viewMode === 'orchestrator'
              ? 'bg-white/[0.08] text-zinc-100'
              : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300',
          ].join(' ')}
        >
          Orquestração
        </button>
      </div>

      {viewMode === 'threads' && (
        <div className="max-h-40 shrink-0 overflow-y-auto border-b border-white/[0.07] p-2">
          {visibleSessions.length === 0 ? (
            <p className="px-2 py-3 text-[12px] text-zinc-600">
              Aguardando execução.
            </p>
          ) : (
            <div className="space-y-1">
              {groupedSessionRows.map(({ session, isChild }) => (
                <button
                  key={session.sessionId}
                  type="button"
                  onClick={() => selectSession(session.sessionId)}
                  className={[
                    'flex min-h-14 w-full items-start gap-2 rounded-lg py-1.5 pr-2 text-left transition',
                    isChild ? 'pl-5' : 'pl-2',
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
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className={getSessionRoleClassName(session)}>
                        {formatSessionRole(session)}
                      </span>
                      <span
                        className="shrink-0 rounded border border-white/[0.08] px-1.5 py-px font-mono text-[9px] uppercase leading-none text-zinc-500"
                        title={session.sessionId}
                      >
                        ID {formatExecutionId(session)}
                      </span>
                      <span className="truncate text-[11px] text-zinc-400">
                        {extractSessionModelName(session)}
                      </span>
                    </span>
                    <span
                      className="mt-0.5 block truncate text-[10px] text-zinc-500"
                      title={extractSessionPrompt(session) ?? undefined}
                    >
                      {extractSessionPrompt(session)
                        ? `Prompt: ${extractSessionPrompt(session)}`
                        : 'Prompt não registrado'}
                    </span>
                    <span className="block truncate text-[10px] text-zinc-600">
                      {formatStatus(session.status)} · {session.chunks.length} eventos ·{' '}
                      {formatBytes(session.outputSize)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {viewMode === 'threads' && (
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.06] px-3">
            <span className="font-mono text-[10px] text-zinc-500">
              {selectedSession
                ? `Execução ID ${formatExecutionId(selectedSession)} · ${formatTime(selectedSession.updatedAt)}`
                : 'sem execução'}
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
        )}

        <div className="relative min-h-0 flex-1">
          <div
            ref={outputRef}
            onScroll={handleOutputScroll}
            className="h-full overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed"
          >
            {viewMode === 'orchestrator' ? (
              orchestratorEntries.length === 0 ? (
                <p className="text-zinc-600">Aguardando eventos da CLI.</p>
              ) : (
                <div className="space-y-2">
                  {orchestratorEntries.map((entry) => (
                    <div
                      key={`${entry.sessionId}-${entry.chunk.id}`}
                      className="rounded-lg border border-white/[0.04] bg-black/10 p-2"
                    >
                      <div className="mb-1 font-mono text-[10px] text-zinc-600">
                        Execução {entry.sessionId.slice(0, 8)}
                      </div>
                      <TerminalChunk chunk={entry.chunk} />
                    </div>
                  ))}
                </div>
              )
            ) : selectedThreadEntries.length === 0 ? (
              <p className="text-zinc-600">
                {selectedSession ? 'Nenhum evento registrado nesta execução.' : 'Aguardando execução.'}
              </p>
            ) : (
              <div className="space-y-2">
                {selectedThreadEntries.map((chunk) => (
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

      <div
        onMouseDown={handleDragStart}
        className="absolute left-0 top-0 h-full w-1 cursor-col-resize hover:bg-white/10 active:bg-white/20"
      />
    </aside>
  )
}

function TerminalChunk({ chunk }: { chunk: TerminalOutputChunk }) {
  const metadata = formatMetadata(chunk)

  return (
    <div
      title={chunk.source}
      className={getChunkClassName(chunk)}
    >
      <div className="mb-1 flex min-w-0 items-center gap-2 text-[10px]">
        <span className="shrink-0 text-zinc-600">{formatTime(chunk.createdAt)}</span>
        <span className={getTitleClassName(chunk)}>
          {chunk.title ?? formatSource(chunk.source)}
        </span>
      </div>
      <div className="whitespace-pre-wrap break-words text-[11px] normal-case tracking-normal">
        {chunk.chunk}
      </div>
      {metadata.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {metadata.map((item) => (
            <span
              key={item.label}
              className="max-w-full truncate rounded border border-white/[0.06] px-1.5 py-0.5 text-[10px] text-zinc-500"
            >
              {item.label}: {item.value}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function createVisibleSessions(sessions: TerminalOutputSession[]) {
  const sessionsById = new Map(
    sessions.map((session) => [session.sessionId, session]),
  )
  const hiddenSessionIds = new Set<string>()
  const mergedSessions = new Map<string, TerminalOutputSession>()

  for (const session of sessions) {
    if (
      !isOrchestratorTurnSession(session) ||
      !session.parentThreadId ||
      !sessionsById.has(session.parentThreadId)
    ) {
      continue
    }

    hiddenSessionIds.add(session.sessionId)
    const parentSession =
      mergedSessions.get(session.parentThreadId) ??
      cloneTerminalSession(sessionsById.get(session.parentThreadId)!)
    mergedSessions.set(
      session.parentThreadId,
      mergeTerminalSessions(parentSession, session),
    )
  }

  return sessions
    .filter((session) => !hiddenSessionIds.has(session.sessionId))
    .map((session) => mergedSessions.get(session.sessionId) ?? session)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
}

function cloneTerminalSession(
  session: TerminalOutputSession,
): TerminalOutputSession {
  return {
    ...session,
    chunks: [...session.chunks],
  }
}

function mergeTerminalSessions(
  parentSession: TerminalOutputSession,
  childSession: TerminalOutputSession,
): TerminalOutputSession {
  const chunks = [...parentSession.chunks, ...childSession.chunks].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
  const startedAt =
    new Date(parentSession.startedAt).getTime() <=
    new Date(childSession.startedAt).getTime()
      ? parentSession.startedAt
      : childSession.startedAt
  const updatedAt =
    new Date(parentSession.updatedAt).getTime() >=
    new Date(childSession.updatedAt).getTime()
      ? parentSession.updatedAt
      : childSession.updatedAt

  return {
    ...parentSession,
    chunks,
    status: mergeSessionStatus(parentSession.status, childSession.status),
    startedAt,
    updatedAt,
    outputSize: parentSession.outputSize + childSession.outputSize,
  }
}

function mergeSessionStatus(
  parentStatus: TerminalSessionStatus,
  childStatus: TerminalSessionStatus,
): TerminalSessionStatus {
  if (parentStatus === 'error' || childStatus === 'error') {
    return 'error'
  }

  if (parentStatus === 'running' || childStatus === 'running') {
    return 'running'
  }

  if (parentStatus === 'stopped' || childStatus === 'stopped') {
    return 'stopped'
  }

  return 'completed'
}

function createGroupedSessionRows(sessions: TerminalOutputSession[]) {
  const sessionsById = new Map(
    sessions.map((session) => [session.sessionId, session]),
  )
  const childrenByParent = new Map<string, TerminalOutputSession[]>()
  const roots: TerminalOutputSession[] = []

  for (const session of sessions) {
    if (
      session.parentThreadId &&
      session.parentThreadId !== session.sessionId &&
      sessionsById.has(session.parentThreadId)
    ) {
      const children = childrenByParent.get(session.parentThreadId) ?? []
      children.push(session)
      childrenByParent.set(session.parentThreadId, children)
      continue
    }

    roots.push(session)
  }

  return roots.flatMap((session) => [
    { session, isChild: false },
    ...(childrenByParent.get(session.sessionId) ?? []).map((child) => ({
      session: child,
      isChild: true,
    })),
  ])
}

function formatSessionRole(session: TerminalOutputSession) {
  if (!session.parentThreadId || session.parentThreadId === session.sessionId) {
    return 'Chat'
  }

  if (session.sessionId.includes('orchestrator-turn')) {
    return 'Sistema'
  }

  return 'Agente'
}

function formatExecutionId(session: TerminalOutputSession) {
  return session.sessionId.slice(0, 8)
}

function extractSessionModelName(session: TerminalOutputSession) {
  const metadata = getSessionStartMetadata(session)

  return metadata?.modelName
    ? String(metadata.modelName)
    : metadata?.cliType
      ? String(metadata.cliType)
      : 'CLI'
}

function extractSessionPrompt(session: TerminalOutputSession) {
  const metadata = getSessionStartMetadata(session)

  return metadata?.promptHint ? String(metadata.promptHint) : null
}

function getSessionStartMetadata(session: TerminalOutputSession) {
  const startChunk = session.chunks.find(
    (chunk) => chunk.kind === 'lifecycle' && chunk.metadata,
  )

  return startChunk?.metadata ?? null
}

function getSessionRoleClassName(session: TerminalOutputSession) {
  const base =
    'shrink-0 rounded border px-1 py-px text-[9px] uppercase leading-none'

  if (!session.parentThreadId || session.parentThreadId === session.sessionId) {
    return `${base} border-sky-300/20 text-sky-200`
  }

  if (session.sessionId.includes('orchestrator-turn')) {
    return `${base} border-sky-300/20 text-sky-200`
  }

  return `${base} border-amber-300/20 text-amber-200`
}

function isOrchestratorTurnSession(session: TerminalOutputSession) {
  return session.sessionId.includes('orchestrator-turn')
}

function getChunkClassName(chunk: TerminalOutputChunk) {
  const base = 'border-l-2 py-1 pl-2 pr-1'

  if (chunk.kind === 'assistant') {
    return `${base} border-sky-300/50 text-zinc-200`
  }

  if (chunk.kind === 'metrics') {
    return `${base} border-theme-success/50 text-theme-success`
  }

  if (chunk.kind === 'tool') {
    return `${base} border-amber-300/50 text-zinc-200`
  }

  if (chunk.kind === 'error') {
    return `${base} border-theme-error/60 text-theme-error`
  }

  if (chunk.kind === 'stderr') {
    return `${base} border-amber-300/50 text-amber-200`
  }

  if (chunk.source === 'stdout') {
    return `${base} border-zinc-500/50 text-zinc-300`
  }

  if (chunk.severity === 'debug' || chunk.severity === 'info') {
    return `${base} border-zinc-600/50 text-zinc-500`
  }

  if (chunk.severity === 'warn') {
    return `${base} border-amber-300/50 text-amber-300`
  }

  return `${base} border-theme-error/60 text-theme-error`
}

function getTitleClassName(chunk: TerminalOutputChunk) {
  if (chunk.kind === 'assistant') {
    return 'min-w-0 truncate text-sky-200'
  }

  if (chunk.kind === 'metrics') {
    return 'min-w-0 truncate text-theme-success'
  }

  if (chunk.kind === 'tool') {
    return 'min-w-0 truncate text-amber-200'
  }

  if (chunk.kind === 'error') {
    return 'min-w-0 truncate text-theme-error'
  }

  return 'min-w-0 truncate text-zinc-500'
}

function formatSource(source: TerminalOutputChunk['source']) {
  if (source === 'stdout') {
    return 'Output'
  }

  if (source === 'stderr') {
    return 'Stderr'
  }

  return 'Sistema'
}

function getStatusDotClassName(status: TerminalSessionStatus) {
  if (status === 'running') {
    return 'animate-pulse bg-amber-300'
  }

  if (status === 'error') {
    return 'bg-theme-error'
  }

  if (status === 'stopped') {
    return 'bg-zinc-500'
  }

  return 'bg-theme-success'
}

function getStatusBadgeClassName(status: TerminalSessionStatus) {
  if (status === 'running') {
    return 'border-amber-200/20 bg-amber-200/10 text-amber-200'
  }

  if (status === 'error') {
    return 'border-theme-error/20 bg-theme-error/10 text-theme-error'
  }

  if (status === 'stopped') {
    return 'border-zinc-200/10 bg-zinc-200/5 text-zinc-400'
  }

  return 'border-theme-success/20 bg-theme-success/10 text-theme-success'
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

function formatMetadata(chunk: TerminalOutputChunk) {
  if (
    !chunk.metadata ||
    chunk.kind === 'lifecycle' ||
    chunk.kind === 'metrics'
  ) {
    return []
  }

  const labels: Record<string, string> = {
    cachedInputTokens: 'Cache do provedor',
    cliType: 'CLI',
    command: 'Comando',
    costUsd: 'Custo',
    durationMs: 'Tempo',
    inputTokens: 'Entrada',
    itemType: 'Tipo',
    mode: 'Modo',
    modelName: 'Modelo',
    outputTokens: 'Saída',
    providerSessionId: 'Sessão',
    reasoningOutputTokens: 'Raciocínio',
    tool: 'Ferramenta',
    totalTokens: 'Total',
  }

  return Object.entries(chunk.metadata)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => ({
      label: labels[key] ?? key,
      value: formatMetadataValue(key, value),
    }))
}

function formatMetadataValue(
  key: string,
  value: string | number | boolean | null | undefined,
) {
  if (value === null || value === undefined) {
    return ''
  }

  if (key.endsWith('Tokens') && typeof value === 'number') {
    return `${new Intl.NumberFormat('pt-BR').format(value)} tokens`
  }

  if (key === 'durationMs' && typeof value === 'number') {
    return value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(1)} s`
  }

  if (key === 'costUsd' && typeof value === 'number') {
    return `US$ ${value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`
  }

  return String(value)
}
