import { memo, useEffect } from 'react'
import {
  Handle,
  Position,
  NodeResizer,
  useReactFlow,
  type NodeProps,
} from '@xyflow/react'
import {
  AlertCircle,
  Loader2,
  Maximize2,
  RotateCcw,
  Info,
} from 'lucide-react'
import { NodeHeader } from './NodeHeader'
import { usePerformanceMode } from '../../shared/performance/performance-mode-context'
import { ProviderMark } from '../../shared/brand/ProviderMark'
import { configuredAgentModel, providerIdentity } from '../../shared/brand/provider-identity'
import { CopyButton } from './TerminalCopyButton'
import {
  useSessionSnapshot,
  useSessionMetadata,
  useTerminalSessions,
} from '../terminal/terminal-session-context'
import type { SessionActivity } from '../terminal/terminal-session-store'
import { terminalScrollbackNotice } from '../terminal/terminal-scrollback'
import { repositoryLabel } from '../services/repository-grouping'
import type { TerminalNodeData } from '../types'
import {
  canResumeAgentSession,
  type AgentSessionReference,
} from '../services/agent-session'

type TerminalNodeDataWithHandlers = TerminalNodeData & {
  onExpand?: (nodeId: string) => void
  onDetails?: (nodeId: string) => void
  onSessionStarted?: (nodeId: string, startedAt: number) => void
  onAgentSession?: (nodeId: string, reference: AgentSessionReference) => void
  onClearAgentSession?: (nodeId: string) => void
  onDataChange?: (nodeId: string, patch: Partial<TerminalNodeData>) => void
  /** Tells the running agent its new name once a rename is committed (blur/Enter). */
  onRenameCommit?: (nodeId: string, label: string) => void
  onOpenWebpage?: (nodeId: string, url: string) => void
}

/**
 * Collapsed terminal block: a small, calm card that shows what the session is
 * doing (working / idle / exited) and a preview of its last output. The live,
 * interactive terminal opens in a side drawer when expanded — the PTY keeps
 * running in the background via the session store regardless.
 */
function TerminalNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = (data ?? {}) as TerminalNodeDataWithHandlers
  const store = useTerminalSessions()
  const { performanceMode } = usePerformanceMode()
  const snapshot = useSessionSnapshot(id)
  const metadata = useSessionMetadata(id)
  const { deleteElements } = useReactFlow()
  const onSessionStarted = nodeData.onSessionStarted
  const onAgentSession = nodeData.onAgentSession
  const onOpenWebpage = nodeData.onOpenWebpage

  // Start (or adopt) the background session as soon as the card mounts.
  // ensure() is idempotent, so initialText only fires on the first creation.
  useEffect(() => {
    if (nodeData.initialTextReady === false) {
      return
    }

    store.ensure(id, {
      command: nodeData.command,
      args: nodeData.args,
      cwd: nodeData.cwd,
      startedAt: nodeData.sessionStartedAt,
      initialText: nodeData.resumeAgentSession ? undefined : nodeData.initialText,
      sourceLabel: nodeData.label,
      fallbackCommand: nodeData.fallbackCommand,
      keepShellOpen: nodeData.keepShellOpen,
      accountId: nodeData.accountId,
      providerId: nodeData.providerId,
      agentSession: nodeData.agentSession,
      resumeAgentSession: nodeData.resumeAgentSession,
      terminalCount: nodeData.terminalCount,
      performanceMode,
      onAgentSession: (reference) => onAgentSession?.(id, reference),
      onOpenWebpage: (url: string) => onOpenWebpage?.(id, url),
    })
  }, [
    store,
    id,
    nodeData.command,
    nodeData.args,
    nodeData.cwd,
    nodeData.label,
    nodeData.initialText,
    nodeData.initialTextReady,
    nodeData.fallbackCommand,
    nodeData.keepShellOpen,
    nodeData.accountId,
    nodeData.providerId,
    nodeData.agentSession,
    nodeData.resumeAgentSession,
    nodeData.terminalCount,
    performanceMode,
    onAgentSession,
    onOpenWebpage,
    nodeData.sessionStartedAt,
  ])

  useEffect(() => {
    if (metadata?.startedAt != null && metadata.startedAt !== nodeData.sessionStartedAt) {
      onSessionStarted?.(id, metadata.startedAt)
    }
  }, [id, metadata?.startedAt, onSessionStarted, nodeData.sessionStartedAt])

  const repository = repositoryLabel(nodeData.cwd)
  const provider = providerIdentity(nodeData.command)
  const configuredModel = configuredAgentModel(nodeData.command, nodeData.args)
  const activity = snapshot?.activity ?? 'starting'
  const preview = snapshot?.previewLines ?? []
  const scrollbackNotice = terminalScrollbackNotice(snapshot?.scrollback)
  const isLive = activity !== 'exited' && activity !== 'error'
  const canResume = canResumeAgentSession(
    nodeData.command,
    nodeData.cwd,
    nodeData.agentSession,
  )

  const restart = () => {
    if (isLive && !window.confirm('O processo deste terminal ainda está rodando. Reiniciar mesmo assim?')) {
      return
    }
    store.restart(id, {
      command: nodeData.command,
      args: nodeData.args,
      cwd: nodeData.cwd,
      initialText: canResume ? undefined : nodeData.initialText,
      sourceLabel: nodeData.label,
      fallbackCommand: nodeData.fallbackCommand,
      keepShellOpen: nodeData.keepShellOpen,
      accountId: nodeData.accountId,
      providerId: nodeData.providerId,
      agentSession: nodeData.agentSession,
      resumeAgentSession: canResume,
      terminalCount: nodeData.terminalCount,
      performanceMode,
      onAgentSession: (reference) => nodeData.onAgentSession?.(id, reference),
      onOpenWebpage: (url: string) => onOpenWebpage?.(id, url),
    })
    nodeData.onSessionStarted?.(id, Date.now())
  }

  return (
    <div data-activity={activity} className="felixo-canvas-card felixo-canvas-card-terminal flex h-full w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-[var(--f-core-black-surface)] text-zinc-200 shadow-xl">
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={120}
        lineClassName="!border-white/30"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !bg-[var(--f-core-white)]"
      />
      <TerminalSideHandles />
      <NodeHeader
        icon={<ProviderMark command={nodeData.command} />}
        editableValue={nodeData.label ?? ''}
        placeholder="Terminal"
        onTitleChange={(label) => nodeData.onDataChange?.(id, { label })}
        onTitleCommit={(label) => nodeData.onRenameCommit?.(id, label)}
        className="bg-white/[0.04] text-[var(--f-core-white)]"
        onRemove={() => {
          store.remove(id)
          void deleteElements({ nodes: [{ id }] })
        }}
      >
        <CopyButton onCopy={() => store.copy(id)} />
        <button
          type="button"
          className="felixo-btn-icon nodrag rounded p-0.5 opacity-70 hover:bg-black/20 hover:opacity-100"
          onClick={restart}
          aria-label="Reiniciar terminal"
          title="Reiniciar terminal"
        >
          <RotateCcw size={13} />
        </button>
        <button
          type="button"
          className="felixo-btn-icon nodrag rounded p-0.5 opacity-70 hover:bg-black/20 hover:opacity-100"
          onClick={() => nodeData.onDetails?.(id)}
          aria-label="Ver detalhes do terminal"
          title="Ver detalhes"
        >
          <Info size={13} />
        </button>
        <button
          type="button"
          className="felixo-btn-icon nodrag rounded p-0.5 opacity-70 hover:bg-black/20 hover:opacity-100"
          onClick={() => nodeData.onExpand?.(id)}
          aria-label="Expandir terminal"
          title="Expandir"
        >
          <Maximize2 size={13} />
        </button>
      </NodeHeader>

      <div className="felixo-node-context" title={nodeData.cwd}>
        {typeof nodeData.terminalIndex === 'number' && <span className="felixo-node-index">#{nodeData.terminalIndex}</span>}
        <span className="felixo-node-context-name">{repository || provider.label}</span>
        {configuredModel && <span className="felixo-node-model" title={`Modelo configurado na criação: ${configuredModel}`}>{configuredModel}</span>}
      </div>

      <button
        type="button"
        onClick={() => nodeData.onExpand?.(id)}
        className="felixo-node-preview nodrag nowheel nopan flex min-h-0 flex-1 flex-col gap-1 p-2 text-left"
        aria-label={`Abrir ${nodeData.label || provider.label}`}
      >
        <ActivityBadge activity={activity} exitCode={snapshot?.exitCode} />
        {snapshot?.lastPrompt && (
          <div
            className="shrink-0 rounded border border-white/10 bg-[var(--f-core-white)]/10 px-1.5 py-1 text-[10px] leading-snug text-[var(--f-core-white-soft)]"
            title={snapshot.lastPrompt}
          >
            <span className="mr-1 font-semibold text-[var(--f-core-white-soft)]">›</span>
            <span className="line-clamp-2">{snapshot.lastPrompt}</span>
          </div>
        )}
        {snapshot?.contextWarning && (
          <div
            className="shrink-0 rounded border border-[color-mix(in_srgb,var(--color-warning)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] px-1.5 py-1 text-[10px] leading-snug text-[var(--color-warning)]"
            title={snapshot.contextWarning}
          >
            {snapshot.contextWarning}
          </div>
        )}
        {scrollbackNotice && (
          <div
            role="status"
            className="shrink-0 rounded border border-[color-mix(in_srgb,var(--color-warning)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] px-1.5 py-1 text-[10px] leading-snug text-[var(--color-warning)]"
            title={scrollbackNotice}
          >
            {scrollbackNotice}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-hidden font-mono text-[10px] leading-snug text-zinc-400">
          {snapshot?.message ? (
            <span className="text-[var(--color-error)]">{snapshot.message}</span>
          ) : preview.length > 0 ? (
            preview.map((line, index) => (
              <div key={index} className="overflow-hidden text-ellipsis whitespace-nowrap">
                {line}
              </div>
            ))
          ) : (
            <span className="text-zinc-600">Sem saída ainda…</span>
          )}
        </div>
      </button>

    </div>
  )
}

/**
 * A connection point on each side of the terminal, each an overlapping
 * source + target so a wire can be dragged out to (or dropped from) a file
 * block on any side. Mirrors the file block's FourSideHandles.
 */
function TerminalSideHandles() {
  const sides: Array<{ position: Position; id: string }> = [
    { position: Position.Top, id: 'top' },
    { position: Position.Right, id: 'right' },
    { position: Position.Bottom, id: 'bottom' },
    { position: Position.Left, id: 'left' },
  ]
  return (
    <>
      {sides.map(({ position, id }) => (
        <span key={id}>
          <Handle
            type="source"
            id={`s-${id}`}
            position={position}
            className="!h-2.5 !w-2.5 !bg-[var(--f-core-white)]"
          />
          <Handle
            type="target"
            id={`t-${id}`}
            position={position}
            className="!h-2.5 !w-2.5 !border-none !bg-transparent"
          />
        </span>
      ))}
    </>
  )
}

function ActivityBadge({
  activity,
  exitCode,
}: {
  activity: SessionActivity
  exitCode?: number
}) {
  const config: Record<SessionActivity, { label: string; className: string }> = {
    starting: { label: 'iniciando…', className: 'text-[var(--color-warning)]' },
    working: { label: 'trabalhando', className: 'text-[var(--f-core-white-soft)]' },
    waiting_approval: {
      label: 'aguardando aprovação',
      className: 'text-[var(--color-warning)]',
    },
    idle: { label: 'aguardando', className: 'text-[var(--f-core-white-soft)]' },
    exited: {
      label: `encerrado${exitCode != null ? ` (${exitCode})` : ''}`,
      className: 'text-zinc-500',
    },
    error: { label: 'erro', className: 'text-[var(--color-error)]' },
  }
  const { label, className } = config[activity]

  return (
    <span className={`felixo-node-activity flex items-center gap-1 text-[11px] font-medium ${className}`}>
      {activity === 'working' && <Loader2 size={11} className="animate-spin" />}
      {activity === 'waiting_approval' && <AlertCircle size={11} />}
      {activity === 'idle' && <span className="h-1.5 w-1.5 rounded-full bg-[var(--f-core-active)]" />}
      {label}
    </span>
  )
}

export const TerminalNode = memo(TerminalNodeComponent)
