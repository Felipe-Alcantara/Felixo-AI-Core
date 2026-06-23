import { memo, useEffect, useState } from 'react'
import {
  Handle,
  Position,
  NodeResizer,
  useReactFlow,
  type NodeProps,
} from '@xyflow/react'
import { Check, Copy, Eye, FileText, Pencil, Stethoscope } from 'lucide-react'
import { NodeHeader } from './NodeHeader'
import { MarkdownContent } from '../../shared/components/MarkdownContent'
import type {
  DiagnosisRequestStatus,
  FileNodeData,
  FileNodeMode,
} from '../types'

type FileNodeDataWithHandlers = FileNodeData & {
  onDataChange?: (nodeId: string, patch: Partial<FileNodeData>) => void
  onGenerateDiagnosis?: (nodeId: string) => Promise<DiagnosisRequestStatus>
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
  const { deleteElements } = useReactFlow()

  const mode: FileNodeMode = nodeData.mode ?? 'scratchpad'

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
      <Handle type="target" position={Position.Left} className="!bg-sky-500" />
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
      <Handle type="source" position={Position.Right} className="!bg-sky-500" />
    </div>
  )
}

export const FileNode = memo(FileNodeComponent)
