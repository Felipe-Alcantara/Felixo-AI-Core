import { memo, useEffect } from 'react'
import { NODE_MIN_SIZE } from '../services/node-geometry'
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
import {
  resolvePromptDisplayLabel,
  toPromptInsertionMetadata,
} from '../../shared/types/prompt-insertion'
import { useAccountChain, useCliAccountLabel } from '../hooks/useAccountChain'
import { useAccountChainActions } from '../hooks/account-chain-actions-context'
import {
  BANNER_ACTION_LABELS,
  accountChipLabel,
  buildTerminalChainBanners,
  ptySessionIdForNode,
} from '../services/account-chain-view'

type TerminalNodeDataWithHandlers = TerminalNodeData & {
  onExpand?: (nodeId: string) => void
  onDetails?: (nodeId: string) => void
  onSessionStarted?: (nodeId: string, startedAt: number) => void
  onAgentSession?: (nodeId: string, reference: AgentSessionReference) => void
  onClearAgentSession?: (nodeId: string) => void
  onDataChange?: (nodeId: string, patch: Partial<TerminalNodeData>) => void
  /** Tells the running agent its new name once a rename is committed (blur/Enter). */
  onRenameCommit?: (nodeId: string, label: string) => void
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
  const onDataChange = nodeData.onDataChange
  const persistedInsertion = nodeData.lastPromptInsertion

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
      initialTextIsHandoff: nodeData.initialTextIsHandoff,
      sourceLabel: nodeData.label,
      fallbackCommand: nodeData.fallbackCommand,
      keepShellOpen: nodeData.keepShellOpen,
      accountId: nodeData.accountId,
      providerId: nodeData.providerId,
      accountMode: nodeData.accountMode,
      chainTicket: nodeData.chainTicket,
      agentSession: nodeData.agentSession,
      resumeAgentSession: nodeData.resumeAgentSession,
      terminalCount: nodeData.terminalCount,
      performanceMode,
      onAgentSession: (reference) => onAgentSession?.(id, reference),
    })
  }, [
    store,
    id,
    nodeData.command,
    nodeData.args,
    nodeData.cwd,
    nodeData.label,
    nodeData.initialText,
    nodeData.initialTextIsHandoff,
    nodeData.initialTextReady,
    nodeData.fallbackCommand,
    nodeData.keepShellOpen,
    nodeData.accountId,
    nodeData.providerId,
    nodeData.accountMode,
    nodeData.chainTicket,
    nodeData.agentSession,
    nodeData.resumeAgentSession,
    nodeData.terminalCount,
    performanceMode,
    onAgentSession,
    nodeData.sessionStartedAt,
  ])

  useEffect(() => {
    if (metadata?.startedAt != null && metadata.startedAt !== nodeData.sessionStartedAt) {
      onSessionStarted?.(id, metadata.startedAt)
    }
  }, [id, metadata?.startedAt, onSessionStarted, nodeData.sessionStartedAt])

  // Keep a body-free provenance record on the canvas node. The live snapshot
  // retains `content` for the terminal/details runtime, while persistence gets
  // only identity, origin, ordering, submission intent and timestamp.
  useEffect(() => {
    const insertion = snapshot?.lastPromptInsertion
    if (!insertion || !onDataChange) return
    const safe = toPromptInsertionMetadata(insertion)
    if (JSON.stringify(persistedInsertion) === JSON.stringify(safe)) return
    onDataChange(id, { lastPromptInsertion: safe })
  }, [id, onDataChange, persistedInsertion, snapshot?.lastPromptInsertion])

  const promptDisplay = resolvePromptDisplayLabel(
    snapshot?.lastPrompt,
    snapshot?.lastPromptInsertion ?? persistedInsertion,
  )
  const repository = repositoryLabel(nodeData.cwd)
  const provider = providerIdentity(nodeData.command)
  const accountLabel = useCliAccountLabel(nodeData.accountId)
  const chainActions = useAccountChainActions()
  const { snapshot: chainSnapshot } = useAccountChain()
  const chainSessionId = ptySessionIdForNode(id)
  const successorId = nodeData.chainSuccessorNodeId
  const successor = successorId ? chainActions?.nodeSummary(successorId) : null
  // Faixas da cadeia: proposta aberta, última detecção e "continuado em".
  // Moram fora do botão da prévia (a prévia inteira é um botão) e nenhuma
  // abre diálogo sozinha.
  const chainBanners = buildTerminalChainBanners({
    proposal:
      chainSnapshot.state?.pendingProposals.find(
        (proposal) =>
          proposal.kind === 'continuation' &&
          proposal.state === 'proposed' &&
          proposal.sourceSessionId === chainSessionId,
      ) ?? null,
    detection: chainSnapshot.detections[chainSessionId] ?? null,
    successor:
      successorId && successor
        ? { nodeId: successorId, label: successor.label, at: successor.decidedAt, reasonClass: successor.reasonClass }
        : null,
  })
  const chainError = chainActions?.errorFor(id) ?? null
  // Hoje nenhuma outra UI mostra em que conta o bloco roda; o selo diz a conta
  // e o modo (fixa/cadeia) sem abrir nada.
  const accountChip =
    provider.id === 'terminal'
      ? null
      : accountChipLabel({
          accountId: nodeData.accountId,
          accountLabel,
          accountMode: nodeData.accountMode,
        })
  const configuredModel = configuredAgentModel(nodeData.command, nodeData.args)
  const activity = snapshot?.activity ?? 'starting'
  const preview = snapshot?.previewLines ?? []
  const scrollbackNotice = terminalScrollbackNotice(snapshot?.scrollback)
  const isLive = activity !== 'exited' && activity !== 'error'
  const canResume = canResumeAgentSession(
    nodeData.command,
    nodeData.cwd,
    nodeData.agentSession,
    nodeData.accountId,
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
      initialTextIsHandoff: !canResume && nodeData.initialTextIsHandoff,
      sourceLabel: nodeData.label,
      fallbackCommand: nodeData.fallbackCommand,
      keepShellOpen: nodeData.keepShellOpen,
      accountId: nodeData.accountId,
      providerId: nodeData.providerId,
      // Reiniciar é spawn comum na mesma conta: nunca leva ticket da cadeia.
      accountMode: nodeData.accountMode,
      agentSession: nodeData.agentSession,
      resumeAgentSession: canResume,
      terminalCount: nodeData.terminalCount,
      performanceMode,
      onAgentSession: (reference) => nodeData.onAgentSession?.(id, reference),
    })
    nodeData.onSessionStarted?.(id, Date.now())
  }

  return (
    <div data-activity={activity} className="felixo-canvas-card felixo-canvas-card-terminal flex h-full w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-(--f-core-black-surface) text-zinc-200 shadow-xl">
      <NodeResizer
        isVisible={selected}
        minWidth={NODE_MIN_SIZE.terminal.width}
        minHeight={NODE_MIN_SIZE.terminal.height}
      />
      <TerminalSideHandles />
      <NodeHeader
        icon={<ProviderMark command={nodeData.command} />}
        editableValue={nodeData.label ?? ''}
        placeholder="Terminal"
        onTitleChange={(label) => nodeData.onDataChange?.(id, { label })}
        onTitleCommit={(label) => nodeData.onRenameCommit?.(id, label)}
        className="bg-white/4 text-(--f-core-white)"
        onRemove={() => {
          store.remove(id)
          void deleteElements({ nodes: [{ id }] })
        }}
      >
        <CopyButton onCopy={() => store.copy(id)} />
        <button
          type="button"
          className="felixo-btn-icon nodrag rounded-sm p-0.5 opacity-70 hover:bg-black/20 hover:opacity-100"
          onClick={restart}
          aria-label="Reiniciar terminal"
          title="Reiniciar terminal"
        >
          <RotateCcw size={13} />
        </button>
        <button
          type="button"
          className="felixo-btn-icon nodrag rounded-sm p-0.5 opacity-70 hover:bg-black/20 hover:opacity-100"
          onClick={() => nodeData.onDetails?.(id)}
          aria-label="Ver detalhes do terminal"
          title="Ver detalhes"
        >
          <Info size={13} />
        </button>
        <button
          type="button"
          className="felixo-btn-icon nodrag rounded-sm p-0.5 opacity-70 hover:bg-black/20 hover:opacity-100"
          onClick={() => nodeData.onExpand?.(id)}
          data-terminal-expand-trigger={id}
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
        {accountChip && (
          <span className="felixo-node-account" title={accountChip.title}>
            {accountChip.text}
          </span>
        )}
      </div>

      {(chainBanners.length > 0 || chainError) && (
        <div className="nodrag nowheel nopan flex shrink-0 flex-col gap-1 px-2 pt-2">
          {chainBanners.map((banner) => (
            <div
              key={banner.key}
              role="status"
              className={`rounded-sm border px-1.5 py-1 text-[10px] leading-snug ${
                banner.tone === 'warning'
                  ? 'border-[color-mix(in_srgb,var(--color-warning)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] text-(--color-warning)'
                  : 'border-white/10 bg-white/4 text-(--f-core-white-soft)'
              }`}
            >
              <p>{banner.text}</p>
              {chainActions && banner.actions.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {banner.actions.map((action) => (
                    <button
                      key={action}
                      type="button"
                      onClick={(event) =>
                        chainActions.onBannerAction({
                          nodeId: id,
                          banner,
                          action,
                          trigger: event.currentTarget,
                        })
                      }
                      className="felixo-btn rounded-sm bg-black/25 px-1.5 py-0.5 text-[10px] text-zinc-100 hover:bg-black/40"
                    >
                      {BANNER_ACTION_LABELS[action]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {chainError && (
            <p role="alert" className="text-[10px] text-theme-error">
              {chainError}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => nodeData.onExpand?.(id)}
        data-terminal-expand-trigger={id}
        className="felixo-node-preview nodrag nowheel nopan flex min-h-0 flex-1 flex-col gap-1 p-2 text-left"
        aria-label={`Abrir ${nodeData.label || provider.label}`}
      >
        <ActivityBadge activity={activity} exitCode={snapshot?.exitCode} />
        {promptDisplay && (
          <div
            className="shrink-0 rounded-sm border border-white/10 bg-(--f-core-white)/10 px-1.5 py-1 text-[10px] leading-snug text-(--f-core-white-soft)"
            title={promptDisplay.detail}
          >
            <span className="mr-1 font-semibold text-(--f-core-white-soft)">›</span>
            <span className="line-clamp-2">{promptDisplay.label}</span>
          </div>
        )}
        {snapshot?.contextWarning && (
          <div
            className="shrink-0 rounded-sm border border-[color-mix(in_srgb,var(--color-warning)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] px-1.5 py-1 text-[10px] leading-snug text-(--color-warning)"
            title={snapshot.contextWarning}
          >
            {snapshot.contextWarning}
          </div>
        )}
        {scrollbackNotice && (
          <div
            role="status"
            className="shrink-0 rounded-sm border border-[color-mix(in_srgb,var(--color-warning)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] px-1.5 py-1 text-[10px] leading-snug text-(--color-warning)"
            title={scrollbackNotice}
          >
            {scrollbackNotice}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-hidden font-mono text-[10px] leading-snug text-zinc-400">
          {snapshot?.message ? (
            <span className="text-theme-error">{snapshot.message}</span>
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
          />
          <Handle
            type="target"
            id={`t-${id}`}
            position={position}
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
    starting: { label: 'iniciando…', className: 'text-(--color-warning)' },
    working: { label: 'trabalhando', className: 'text-(--f-core-white-soft)' },
    waiting_approval: {
      label: 'aguardando aprovação',
      className: 'text-(--color-warning)',
    },
    idle: { label: 'aguardando', className: 'text-(--f-core-white-soft)' },
    exited: {
      label: `encerrado${exitCode != null ? ` (${exitCode})` : ''}`,
      className: 'text-zinc-500',
    },
    error: { label: 'erro', className: 'text-theme-error' },
  }
  const { label, className } = config[activity]

  return (
    <span className={`felixo-node-activity flex items-center gap-1 text-[11px] font-medium ${className}`}>
      {activity === 'working' && <Loader2 size={11} className="animate-spin" />}
      {activity === 'waiting_approval' && <AlertCircle size={11} />}
      {activity === 'idle' && <span className="h-1.5 w-1.5 rounded-full bg-(--f-core-active)" />}
      {label}
    </span>
  )
}

export const TerminalNode = memo(TerminalNodeComponent)
