import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import {
  Handle,
  Position,
  NodeResizer,
  useReactFlow,
  type NodeProps,
} from '@xyflow/react'
import {
  Check,
  Copy,
  Eye,
  FileText,
  Link2,
  Pencil,
  Plus,
  Stethoscope,
  Unlink,
} from 'lucide-react'
import { NodeHeader } from './NodeHeader'
import { MarkdownContent } from '../../shared/components/MarkdownContent'
import type {
  DiagnosisRequestStatus,
  FileNodeData,
  FileNodeMode,
} from '../types'

/** A terminal/agent block, summarised for the file node's link panel. */
export type LinkableAgent = { id: string; label: string }

type FileNodeDataWithHandlers = FileNodeData & {
  onDataChange?: (nodeId: string, patch: Partial<FileNodeData>) => void
  onGenerateDiagnosis?: (nodeId: string) => Promise<DiagnosisRequestStatus>
  /** Agents currently connected to this file (any edge direction). */
  connectedAgents?: LinkableAgent[]
  /** Agents on the canvas not yet connected to this file. */
  availableAgents?: LinkableAgent[]
  /** Connect this file to an agent and tell the agent about the file. */
  onLinkAgent?: (fileNodeId: string, agentId: string) => void
  /** Remove every edge between this file and the given agent. */
  onUnlinkAgent?: (fileNodeId: string, agentId: string) => void
}

/** Short user-facing feedback for each diagnosis request outcome. */
const DIAGNOSIS_FEEDBACK: Record<DiagnosisRequestStatus, string> = {
  ok: 'Diagnóstico solicitado ao terminal conectado.',
  'no-terminal': 'Ligue este arquivo a um terminal com agente primeiro.',
  'no-file': 'Arquivo do bloco indisponível.',
  'resolve-failed': 'Não foi possível resolver o caminho do arquivo.',
}

/**
 * A canvas block bound to a shared .md file on disk. It renders the file as
 * markdown and watches it: when an agent edits the file (given its path), the
 * block re-renders live. Editing here writes back to the same file, so humans
 * and agents collaborate through it.
 */
function FileNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = (data ?? {}) as FileNodeDataWithHandlers
  const fileName = nodeData.fileName ?? ''
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [absolutePath, setAbsolutePath] = useState('')
  const [copied, setCopied] = useState(false)
  const [diagnosing, setDiagnosing] = useState(false)
  const [diagnosisFeedback, setDiagnosisFeedback] = useState('')
  const [linkMenuOpen, setLinkMenuOpen] = useState(false)
  const linkMenuRef = useRef<HTMLDivElement>(null)
  const { deleteElements } = useReactFlow()

  const mode: FileNodeMode = nodeData.mode ?? 'scratchpad'
  const connectedAgents = nodeData.connectedAgents ?? []
  const availableAgents = nodeData.availableAgents ?? []

  // Close the "+ Ligar agente" menu when clicking anywhere outside it.
  useEffect(() => {
    if (!linkMenuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!linkMenuRef.current?.contains(event.target as Node)) {
        setLinkMenuOpen(false)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [linkMenuOpen])

  const linkAgent = (agentId: string) => {
    nodeData.onLinkAgent?.(id, agentId)
    setLinkMenuOpen(false)
  }

  const setMode = (next: FileNodeMode) => {
    setDiagnosisFeedback('')
    nodeData.onDataChange?.(id, { mode: next })
  }

  const generateDiagnosis = async () => {
    if (diagnosing || !nodeData.onGenerateDiagnosis) return
    setDiagnosing(true)
    setDiagnosisFeedback('')
    try {
      const status = await nodeData.onGenerateDiagnosis(id)
      setDiagnosisFeedback(DIAGNOSIS_FEEDBACK[status])
    } finally {
      setDiagnosing(false)
    }
  }

  // Load, resolve absolute path, and watch the file for external changes.
  useEffect(() => {
    const files = window.felixo?.canvasFiles
    if (!files || !fileName) {
      return
    }

    let cancelled = false

    const load = () => {
      void files.read({ name: fileName }).then((result) => {
        if (!cancelled && result?.ok) {
          setContent(result.content ?? '')
        }
      })
    }

    load()
    void files.resolve({ name: fileName }).then((result) => {
      if (!cancelled && result?.ok && result.path) {
        setAbsolutePath(result.path)
      }
    })
    void files.watch({ name: fileName })
    const off = files.onChanged((event) => {
      if (event.name === fileName) {
        load()
      }
    })

    return () => {
      cancelled = true
      off()
      void files.unwatch({ name: fileName })
    }
  }, [fileName])

  const save = (next: string) => {
    setContent(next)
    void window.felixo?.canvasFiles?.write({ name: fileName, content: next })
  }

  const copyPath = async () => {
    if (!absolutePath) return
    await navigator.clipboard?.writeText(absolutePath)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-sky-300/20 bg-[#0d1420] text-zinc-200 shadow-xl">
      <NodeResizer
        isVisible={selected}
        minWidth={220}
        minHeight={140}
        lineClassName="!border-sky-500/40"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !bg-sky-500"
      />
      <FourSideHandles />
      <NodeHeader
        icon={<FileText size={13} />}
        editableValue={nodeData.label ?? fileName}
        placeholder={fileName || 'arquivo.md'}
        onTitleChange={(label) => nodeData.onDataChange?.(id, { label })}
        className="bg-sky-950/60 text-sky-100"
        onRemove={() => void deleteElements({ nodes: [{ id }] })}
      >
        <button
          type="button"
          className="nodrag rounded p-0.5 opacity-70 hover:bg-black/20 hover:opacity-100"
          onClick={() => void copyPath()}
          title="Copiar caminho do arquivo (para dar ao agente)"
          aria-label="Copiar caminho"
        >
          {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
        </button>
        <button
          type="button"
          className="nodrag rounded p-0.5 opacity-70 hover:bg-black/20 hover:opacity-100"
          onClick={() => setEditing((value) => !value)}
          title={editing ? 'Visualizar' : 'Editar'}
          aria-label={editing ? 'Visualizar' : 'Editar'}
        >
          {editing ? <Eye size={13} /> : <Pencil size={13} />}
        </button>
      </NodeHeader>

      <div className="nodrag flex items-center gap-1 border-b border-sky-300/10 bg-sky-950/30 px-2 py-1 text-[11px]">
        <span className="inline-flex overflow-hidden rounded ring-1 ring-white/10">
          <button
            type="button"
            onClick={() => setMode('scratchpad')}
            className={`px-1.5 py-0.5 ${mode === 'scratchpad' ? 'bg-sky-700/60 text-sky-50' : 'text-sky-300/70 hover:bg-white/5'}`}
            title="Modo scratchpad: log vivo e leve"
          >
            Scratchpad
          </button>
          <button
            type="button"
            onClick={() => setMode('plan')}
            className={`px-1.5 py-0.5 ${mode === 'plan' ? 'bg-sky-700/60 text-sky-50' : 'text-sky-300/70 hover:bg-white/5'}`}
            title="Modo plano: gerar diagnóstico do repositório"
          >
            Plano
          </button>
        </span>
        {mode === 'plan' && (
          <button
            type="button"
            onClick={() => void generateDiagnosis()}
            disabled={diagnosing}
            className="nodrag ml-auto inline-flex items-center gap-1 rounded bg-sky-700/50 px-1.5 py-0.5 text-sky-50 hover:bg-sky-600/60 disabled:opacity-50"
            title="Pedir ao terminal conectado um diagnóstico do repositório"
          >
            <Stethoscope size={12} />
            {diagnosing ? 'Solicitando…' : 'Gerar diagnóstico'}
          </button>
        )}
      </div>

      {mode === 'plan' && diagnosisFeedback && (
        <div className="nodrag border-b border-sky-300/10 bg-sky-950/20 px-2 py-1 text-[11px] text-sky-200/80">
          {diagnosisFeedback}
        </div>
      )}

      {editing ? (
        <textarea
          value={content}
          onChange={(event) => save(event.target.value)}
          placeholder="# Conteúdo do arquivo .md"
          className="nodrag nowheel min-h-0 w-full flex-1 resize-none overflow-auto bg-transparent p-3 font-mono text-xs text-zinc-200 outline-none"
        />
      ) : (
        <div className="nodrag nowheel markdown-content min-h-0 flex-1 overflow-auto p-3 text-sm">
          {content.trim() ? (
            <MarkdownContent content={content} />
          ) : (
            <span className="text-zinc-600">Arquivo vazio. Clique no lapis para editar.</span>
          )}
        </div>
      )}

      <LinkedAgentsPanel
        connectedAgents={connectedAgents}
        availableAgents={availableAgents}
        menuOpen={linkMenuOpen}
        menuRef={linkMenuRef}
        canLink={Boolean(nodeData.onLinkAgent)}
        canUnlink={Boolean(nodeData.onUnlinkAgent)}
        onToggleMenu={() => setLinkMenuOpen((open) => !open)}
        onLink={linkAgent}
        onUnlink={(agentId) => nodeData.onUnlinkAgent?.(id, agentId)}
      />
    </div>
  )
}

/**
 * One connection point on each side of the block. Each side carries an
 * overlapping source + target handle, so you can drag a wire OUT from any side
 * to an agent and also drop a wire INTO any side — and a single handle hosts as
 * many edges as you like (React Flow's default), letting one file fan out to as
 * many agents as you want.
 */
function FourSideHandles() {
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
            className="!h-2.5 !w-2.5 !bg-sky-500"
          />
          {/* Target sits on top of the source so either drag direction works. */}
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

type LinkedAgentsPanelProps = {
  connectedAgents: LinkableAgent[]
  availableAgents: LinkableAgent[]
  menuOpen: boolean
  menuRef: RefObject<HTMLDivElement | null>
  canLink: boolean
  canUnlink: boolean
  onToggleMenu: () => void
  onLink: (agentId: string) => void
  onUnlink: (agentId: string) => void
}

/**
 * Footer listing every agent linked to this file, with a "+ Ligar agente"
 * picker for the agents still unconnected. This is the click-driven companion
 * to dragging wires from the side handles — both create the same edge.
 */
function LinkedAgentsPanel({
  connectedAgents,
  availableAgents,
  menuOpen,
  menuRef,
  canLink,
  canUnlink,
  onToggleMenu,
  onLink,
  onUnlink,
}: LinkedAgentsPanelProps) {
  return (
    <div className="nodrag relative mt-auto border-t border-sky-300/10 bg-sky-950/30 px-2 py-1.5 text-[11px]">
      <div className="mb-1 flex items-center gap-1 text-sky-300/70">
        <Link2 size={11} />
        <span>Agentes ligados</span>
        <span className="rounded bg-sky-800/50 px-1 text-[10px] text-sky-100">
          {connectedAgents.length}
        </span>
      </div>

      {connectedAgents.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {connectedAgents.map((agent) => (
            <li
              key={agent.id}
              className="group flex items-center gap-1 rounded px-1 py-0.5 hover:bg-white/5"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
              <span className="min-w-0 flex-1 truncate text-sky-100">
                {agent.label}
              </span>
              {canUnlink && (
                <button
                  type="button"
                  onClick={() => onUnlink(agent.id)}
                  className="rounded p-0.5 text-sky-300/60 opacity-0 hover:bg-black/20 hover:text-rose-300 group-hover:opacity-100"
                  title="Desligar este agente"
                  aria-label={`Desligar ${agent.label}`}
                >
                  <Unlink size={11} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sky-300/40">Nenhum agente ligado ainda.</p>
      )}

      {canLink && (
        <div ref={menuRef} className="relative mt-1">
          <button
            type="button"
            onClick={onToggleMenu}
            className="inline-flex items-center gap-1 rounded bg-sky-700/50 px-1.5 py-0.5 text-sky-50 hover:bg-sky-600/60"
            title="Ligar este arquivo a um agente do canvas"
          >
            <Plus size={11} />
            Ligar agente
          </button>

          {menuOpen && (
            <div className="nowheel absolute bottom-full left-0 z-10 mb-1 max-h-44 w-44 overflow-auto rounded-md border border-sky-300/20 bg-[#0d1420] py-1 shadow-xl">
              {availableAgents.length > 0 ? (
                availableAgents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => onLink(agent.id)}
                    className="flex w-full items-center gap-1 px-2 py-1 text-left text-sky-100 hover:bg-sky-800/40"
                  >
                    <Link2 size={11} className="shrink-0 opacity-60" />
                    <span className="min-w-0 flex-1 truncate">{agent.label}</span>
                  </button>
                ))
              ) : (
                <p className="px-2 py-1 text-sky-300/40">
                  Nenhum agente disponível. Crie um terminal primeiro.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const FileNode = memo(FileNodeComponent)
