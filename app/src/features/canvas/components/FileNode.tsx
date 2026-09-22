import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { NODE_MIN_SIZE } from '../services/node-geometry'
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
  CopyPlus,
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Stethoscope,
  Trash2,
  Unlink,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { NodeHeader } from './NodeHeader'
import { DeferredMarkdownContent } from '../../shared/components/DeferredMarkdownContent'
import { dirnameOf } from '../../shared/components/markdown-image-src'
import { isSafeImagePreviewMimeType, resolvePreviewKind } from './file-node-preview'
import { useFileNodeDocument } from '../hooks/useFileNodeDocument'
import type {
  CanvasImageMetadata,
  DiagnosisRequestStatus,
  FileNodeData,
  FileNodeMode,
} from '../types'

/** A terminal/agent block, summarised for the file node's link panel. */
export type LinkableAgent = { id: string; label: string }

type FileNodeDataWithHandlers = FileNodeData & {
  onDataChange?: (nodeId: string, patch: Partial<FileNodeData>) => void
  onGenerateDiagnosis?: (nodeId: string) => Promise<DiagnosisRequestStatus>
  onDuplicateImage?: (nodeId: string) => Promise<boolean>
  onRepairImage?: (nodeId: string) => Promise<boolean>
  onRemoveTemporaryImage?: (nodeId: string) => Promise<boolean>
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
 * A canvas block bound to a text file on disk, in one of two flavours:
 *
 * - a shared `.md` the block itself created, in the app's own directory;
 * - a file that already existed and the person opened — a project README, a
 *   script, a note. Here the block only points at it: nothing is created and
 *   nothing is deleted.
 *
 * Either way it watches the file, so an agent editing it (given its path) makes
 * the block re-render live, and editing here writes back to the same file —
 * that shared file is how humans and agents coordinate.
 */
function FileNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = (data ?? {}) as FileNodeDataWithHandlers
  const fileName = nodeData.fileName ?? ''
  const filePath = nodeData.filePath ?? ''
  const imageMetadata = nodeData.image
  const isImage =
    nodeData.fileKind === 'image' ||
    imageMetadata?.kind === 'generated-image' ||
    imageMetadata?.kind === 'local-image'
  /** Um arquivo externo é de outra pessoa; o bloco é só uma janela para ele. */
  const isExternal = isImage || Boolean(filePath)
  const displayName = isExternal
    ? (nodeData.fileLabel ?? (filePath || 'imagem gerada'))
    : fileName
  const document = useFileNodeDocument({
    fileName: isExternal ? undefined : fileName,
    filePath: isImage ? undefined : isExternal ? filePath : undefined,
  })
  const { content, save } = document
  const absolutePath = isImage ? filePath : document.absolutePath
  const previewKind = isImage ? 'image' : resolvePreviewKind(displayName)
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [imageZoom, setImageZoom] = useState(1)
  const [imagePreview, setImagePreview] = useState<{
    source: string
    dataUrl: string
    loading: boolean
    error: string
  }>({ source: '', dataUrl: '', loading: false, error: '' })
  const [imageActionFeedback, setImageActionFeedback] = useState('')
  const [duplicating, setDuplicating] = useState(false)
  const [repairing, setRepairing] = useState(false)
  const [diagnosing, setDiagnosing] = useState(false)
  const [diagnosisFeedback, setDiagnosisFeedback] = useState('')
  const [linkMenuOpen, setLinkMenuOpen] = useState(false)
  const linkMenuRef = useRef<HTMLDivElement>(null)
  // Timer do "copiado!" — guardado numa ref e limpo no unmount, senão copiar
  // e fechar/remover o bloco antes de 1.5s chama `setState` num componente
  // já desmontado.
  const copiedTimeoutRef = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (copiedTimeoutRef.current !== null) window.clearTimeout(copiedTimeoutRef.current)
    },
    [],
  )
  const { deleteElements } = useReactFlow()

  const mode: FileNodeMode = nodeData.mode ?? 'scratchpad'
  const connectedAgents = nodeData.connectedAgents ?? []
  const availableAgents = nodeData.availableAgents ?? []
  const imagePreviewKey = `${filePath}\u0000${imageMetadata?.mimeType ?? ''}`
  const imageReaderAvailable = Boolean(window.felixo?.files?.readImageAttachment)
  const renderedImagePreview = !filePath
    ? {
        source: imagePreviewKey,
        dataUrl: '',
        loading: false,
        error: 'A referência da imagem não está disponível neste canvas.',
      }
    : !isSafeImagePreviewMimeType(imageMetadata?.mimeType)
      ? {
          source: imagePreviewKey,
          dataUrl: '',
          loading: false,
          error: 'Este formato não tem preview seguro; use abrir ou salvar uma cópia.',
        }
      : !imageReaderAvailable
        ? {
            source: imagePreviewKey,
            dataUrl: '',
            loading: false,
            error: 'Preview de imagem indisponível nesta janela.',
          }
        : imagePreview.source === imagePreviewKey
          ? imagePreview
          : {
              source: imagePreviewKey,
              dataUrl: '',
              loading: true,
              error: '',
            }

  useEffect(() => {
    if (
      !isImage ||
      !filePath ||
      !isSafeImagePreviewMimeType(imageMetadata?.mimeType)
    ) {
      return
    }

    let cancelled = false
    const readImageAttachment = window.felixo?.files?.readImageAttachment
    if (!readImageAttachment) {
      return () => {
        cancelled = true
      }
    }

    void readImageAttachment({
      path: filePath,
      name: nodeData.fileLabel,
      type: imageMetadata?.mimeType,
    }).then((result) => {
      if (cancelled) return
      if (result?.ok && result.dataUrl) {
        setImagePreview({
          source: imagePreviewKey,
          dataUrl: result.dataUrl,
          loading: false,
          error: '',
        })
        return
      }
      setImagePreview({
        source: imagePreviewKey,
        dataUrl: '',
        loading: false,
        error: result?.message ?? 'Não foi possível abrir a imagem.',
      })
    }).catch(() => {
      if (!cancelled) {
        setImagePreview({
          source: imagePreviewKey,
          dataUrl: '',
          loading: false,
          error: 'Não foi possível abrir a imagem.',
        })
      }
    })

    return () => {
      cancelled = true
    }
  }, [filePath, imageMetadata?.mimeType, imagePreviewKey, isImage, nodeData.fileLabel])

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

  const copyPath = async () => {
    if (!absolutePath) return
    await navigator.clipboard?.writeText(absolutePath)
    if (copiedTimeoutRef.current !== null) window.clearTimeout(copiedTimeoutRef.current)
    setCopied(true)
    copiedTimeoutRef.current = window.setTimeout(() => {
      copiedTimeoutRef.current = null
      setCopied(false)
    }, 1500)
  }

  const openImageInSystem = async () => {
    if (!isImage || !absolutePath || !window.felixo?.files?.openImage) return
    const result = await window.felixo.files.openImage({ path: absolutePath })
    setImageActionFeedback(
      result?.ok ? 'Imagem aberta no sistema.' : result?.message ?? 'Não foi possível abrir a imagem.',
    )
  }

  const saveImageCopy = async () => {
    if (!isImage || !absolutePath || !window.felixo?.files?.saveImageCopy) return
    const result = await window.felixo.files.saveImageCopy({ path: absolutePath })
    if (result?.canceled) return
    setImageActionFeedback(
      result?.ok ? 'Cópia salva.' : result?.message ?? 'Não foi possível salvar a cópia.',
    )
  }

  const duplicateImage = async () => {
    if (duplicating || !nodeData.onDuplicateImage) return
    setDuplicating(true)
    setImageActionFeedback('')
    try {
      const ok = await nodeData.onDuplicateImage(id)
      setImageActionFeedback(ok ? 'Imagem duplicada no canvas.' : 'Não foi possível duplicar a imagem.')
    } finally {
      setDuplicating(false)
    }
  }

  const repairImage = async () => {
    if (repairing || !nodeData.onRepairImage) return
    setRepairing(true)
    setImageActionFeedback('')
    try {
      const ok = await nodeData.onRepairImage(id)
      setImageActionFeedback(ok ? 'Referência da imagem reparada.' : 'A imagem não foi reparada.')
    } finally {
      setRepairing(false)
    }
  }

  const removeTemporaryImage = async () => {
    if (!nodeData.onRemoveTemporaryImage) return
    const ok = await nodeData.onRemoveTemporaryImage(id)
    if (!ok) {
      setImageActionFeedback('Não foi possível remover o arquivo temporário.')
    }
  }

  const markImageLoadFailed = () => {
    setImagePreview((current) =>
      current.source === imagePreviewKey
        ? {
            ...current,
            dataUrl: '',
            loading: false,
            error: 'O arquivo não é uma imagem válida ou está corrompido.',
          }
        : current,
    )
  }

  return (
    <div className="felixo-canvas-card felixo-canvas-card-file flex h-full w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-[var(--f-core-graphite)] text-zinc-200 shadow-xl">
      <NodeResizer
        isVisible={selected}
        minWidth={NODE_MIN_SIZE.file.width}
        minHeight={NODE_MIN_SIZE.file.height}
        lineClassName="!border-white/30"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !bg-[var(--f-core-white)]"
      />
      <FourSideHandles />
      <NodeHeader
        icon={isImage ? <ImageIcon size={13} /> : <FileText size={13} />}
        editableValue={nodeData.label ?? displayName}
        placeholder={displayName || 'arquivo.md'}
        onTitleChange={(label) => nodeData.onDataChange?.(id, { label })}
        className="bg-white/[0.04] text-[var(--f-core-white)]"
        onRemove={() => void deleteElements({ nodes: [{ id }] })}
      >
        <button
          type="button"
          className="felixo-btn-icon nodrag rounded p-0.5 opacity-70 hover:bg-black/20 hover:opacity-100"
          onClick={() => void copyPath()}
          title="Copiar caminho do arquivo (para dar ao agente)"
          aria-label="Copiar caminho"
        >
          {copied ? <Check size={13} className="text-[var(--f-core-white-soft)]" /> : <Copy size={13} />}
        </button>
        {!isImage && (
          <button
            type="button"
            className="felixo-btn-icon nodrag rounded p-0.5 opacity-70 hover:bg-black/20 hover:opacity-100"
            onClick={() => setEditing((value) => !value)}
            // O rótulo diz o que a visualização vai fazer neste arquivo: markdown
            // formatado só onde isso significa alguma coisa. Num `.py`, dizer
            // "markdown" prometeria uma leitura que o conteúdo não tem.
            title={
              editing
                ? previewKind === 'markdown'
                  ? 'Visualizar como markdown'
                  : 'Visualizar texto'
                : 'Editar'
            }
            aria-label={
              editing
                ? previewKind === 'markdown'
                  ? 'Visualizar como markdown'
                  : 'Visualizar texto'
                : 'Editar'
            }
          >
            {editing ? <Eye size={13} /> : <Pencil size={13} />}
          </button>
        )}
      </NodeHeader>

      {/*
        Scratchpad/Plano só fazem sentido num arquivo que o bloco criou para
        coordenar agentes. Num README de projeto, "Gerar diagnóstico" ofereceria
        sobrescrever o arquivo de outra pessoa — então ali o lugar mostra de onde
        o arquivo veio, que é o que importa saber.
      */}
      {isExternal ? (
        <div
          className="nodrag truncate border-b border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-[var(--f-core-secondary)]"
          title={absolutePath || filePath}
        >
          {absolutePath || 'Referência local indisponível — selecione reparar.'}
        </div>
      ) : (
        <div className="nodrag flex items-center gap-1 border-b border-white/10 bg-white/[0.04] px-2 py-1 text-[11px]">
          <span className="inline-flex overflow-hidden rounded ring-1 ring-white/10">
            <button
              type="button"
              onClick={() => setMode('scratchpad')}
              className={`felixo-btn px-1.5 py-0.5 ${mode === 'scratchpad' ? 'bg-white/[0.10] text-[var(--f-core-white)]' : 'text-[var(--f-core-white-soft)] hover:bg-white/5'}`}
              title="Modo scratchpad: log vivo e leve"
            >
              Scratchpad
            </button>
            <button
              type="button"
              onClick={() => setMode('plan')}
              className={`felixo-btn px-1.5 py-0.5 ${mode === 'plan' ? 'bg-white/[0.10] text-[var(--f-core-white)]' : 'text-[var(--f-core-white-soft)] hover:bg-white/5'}`}
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
              className="felixo-btn nodrag ml-auto inline-flex items-center gap-1 rounded bg-white/[0.10] px-1.5 py-0.5 text-[var(--f-core-white)] hover:bg-white/[0.16] disabled:opacity-50"
              title="Pedir ao terminal conectado um diagnóstico do repositório"
            >
              <Stethoscope size={12} />
              {diagnosing ? 'Solicitando…' : 'Gerar diagnóstico'}
            </button>
          )}
        </div>
      )}

      {!isImage && document.error && (
        <div className="nodrag border-b border-[color-mix(in_srgb,var(--color-error)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-error)_14%,transparent)] px-2 py-1 text-[11px] text-[var(--color-error)]">
          {document.error}
        </div>
      )}

      {!isExternal && mode === 'plan' && diagnosisFeedback && (
        <div className="nodrag border-b border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-[var(--f-core-white-soft)]">
          {diagnosisFeedback}
        </div>
      )}

      {isImage ? (
        <ImageArtifactPreview
          name={displayName}
          metadata={imageMetadata}
          path={absolutePath}
          preview={renderedImagePreview}
          zoom={imageZoom}
          onZoomChange={setImageZoom}
          onImageError={markImageLoadFailed}
          onOpen={openImageInSystem}
          onSaveCopy={saveImageCopy}
          onDuplicate={() => void duplicateImage()}
          onRepair={() => void repairImage()}
          onRemoveTemporary={() => void removeTemporaryImage()}
          duplicating={duplicating}
          repairing={repairing}
          feedback={imageActionFeedback}
        />
      ) : editing ? (
        <textarea
          value={content}
          onChange={(event) => save(event.target.value)}
          aria-label="Conteúdo do arquivo"
          placeholder={isExternal ? 'Arquivo vazio.' : '# Conteúdo do arquivo .md'}
          className="nodrag nowheel nopan min-h-0 w-full flex-1 resize-none overflow-auto bg-transparent p-3 font-mono text-xs text-zinc-200 outline-none"
        />
      ) : content.trim() ? (
        previewKind === 'markdown' ? (
          <div className="nodrag nowheel nopan markdown-content min-h-0 flex-1 overflow-auto p-3 text-sm">
            <DeferredMarkdownContent baseDir={dirnameOf(absolutePath)} content={content} />
          </div>
        ) : (
          // Texto puro preserva indentação e quebra de linha — num arquivo de
          // código elas são o conteúdo, não formatação.
          <pre className="nodrag nowheel nopan min-h-0 flex-1 overflow-auto whitespace-pre p-3 font-mono text-xs text-zinc-200">
            {content}
          </pre>
        )
      ) : (
        <div className="nodrag nowheel nopan min-h-0 flex-1 overflow-auto p-3 text-sm">
          <span className="text-zinc-600">
            Arquivo vazio. Clique no lápis para editar.
          </span>
        </div>
      )}

      {!isImage && (
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
      )}
    </div>
  )
}

type ImagePreviewState = {
  source: string
  dataUrl: string
  loading: boolean
  error: string
}

type ImageArtifactPreviewProps = {
  name: string
  metadata?: CanvasImageMetadata
  path: string
  preview: ImagePreviewState
  zoom: number
  onZoomChange: (value: number) => void
  onImageError: () => void
  onOpen: () => void
  onSaveCopy: () => void
  onDuplicate: () => void
  onRepair: () => void
  onRemoveTemporary: () => void
  duplicating: boolean
  repairing: boolean
  feedback: string
}

function ImageArtifactPreview({
  name,
  metadata,
  path,
  preview,
  zoom,
  onZoomChange,
  onImageError,
  onOpen,
  onSaveCopy,
  onDuplicate,
  onRepair,
  onRemoveTemporary,
  duplicating,
  repairing,
  feedback,
}: ImageArtifactPreviewProps) {
  const hasPreview = Boolean(preview.dataUrl) && !preview.error

  const handlePreviewKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      onZoomChange(Math.min(3, Number((zoom + 0.25).toFixed(2))))
    } else if (event.key === '-') {
      event.preventDefault()
      onZoomChange(Math.max(0.5, Number((zoom - 0.25).toFixed(2))))
    } else if (event.key === '0') {
      event.preventDefault()
      onZoomChange(1)
    }
  }

  return (
    <div className="nodrag nowheel nopan flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden p-2">
      <div
        role="group"
        aria-label={`Preview da imagem ${name}`}
        tabIndex={0}
        onKeyDown={handlePreviewKeyDown}
        className="min-h-20 flex-1 overflow-auto rounded border border-white/10 bg-black/20 outline-none focus:ring-2 focus:ring-white/25"
      >
        {preview.loading ? (
          <div className="flex h-full min-h-24 items-center justify-center text-xs text-[var(--f-core-secondary)]">
            Carregando preview…
          </div>
        ) : hasPreview ? (
          <div className="flex min-h-full min-w-full items-center justify-center p-2">
            <img
              src={preview.dataUrl}
              alt={name}
              onError={onImageError}
              draggable={false}
              className="max-h-full max-w-full origin-center object-contain transition-transform duration-150"
              style={{ transform: `scale(${zoom})` }}
            />
          </div>
        ) : (
          <div
            role="status"
            className="flex h-full min-h-24 flex-col items-center justify-center gap-2 px-4 text-center text-xs text-[var(--f-core-secondary)]"
          >
            <ImageIcon size={22} className="opacity-60" aria-hidden="true" />
            <span>{preview.error || 'Preview indisponível.'}</span>
            {onRepair && (
              <button
                type="button"
                className="felixo-btn inline-flex items-center gap-1 rounded bg-white/[0.10] px-2 py-1 text-[var(--f-core-white)] hover:bg-white/[0.16] disabled:opacity-50"
                onClick={onRepair}
                disabled={repairing}
                title="Escolher novamente o arquivo de imagem"
              >
                <RefreshCw size={12} aria-hidden="true" />
                {repairing ? 'Reparando…' : 'Reparar referência'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-1 text-[10px] text-[var(--f-core-secondary)]">
        <span aria-live="polite">Zoom {Math.round(zoom * 100)}% · + / − / 0</span>
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            className="felixo-btn-icon rounded p-1 hover:bg-white/10 disabled:opacity-40"
            onClick={() => onZoomChange(Math.max(0.5, Number((zoom - 0.25).toFixed(2))))}
            disabled={!hasPreview || zoom <= 0.5}
            title="Diminuir zoom"
            aria-label="Diminuir zoom"
          >
            <ZoomOut size={12} />
          </button>
          <button
            type="button"
            className="felixo-btn-icon rounded p-1 hover:bg-white/10 disabled:opacity-40"
            onClick={() => onZoomChange(Math.min(3, Number((zoom + 0.25).toFixed(2))))}
            disabled={!hasPreview || zoom >= 3}
            title="Aumentar zoom"
            aria-label="Aumentar zoom"
          >
            <ZoomIn size={12} />
          </button>
          <button
            type="button"
            className="felixo-btn-icon rounded px-1 py-0.5 hover:bg-white/10 disabled:opacity-40"
            onClick={() => onZoomChange(1)}
            disabled={!hasPreview || zoom === 1}
            title="Redefinir zoom"
            aria-label="Redefinir zoom"
          >
            100%
          </button>
        </span>
      </div>

      <ImageMetadata metadata={metadata} />

      <div className="flex flex-wrap gap-1 border-t border-white/10 pt-1.5">
        <button
          type="button"
          className="felixo-btn inline-flex items-center gap-1 rounded bg-white/[0.10] px-1.5 py-1 text-[10px] text-[var(--f-core-white)] hover:bg-white/[0.16] disabled:opacity-40"
          onClick={onOpen}
          disabled={!path}
          title="Abrir a imagem no aplicativo padrão do sistema"
        >
          <Eye size={12} aria-hidden="true" />
          Abrir no sistema
        </button>
        <button
          type="button"
          className="felixo-btn inline-flex items-center gap-1 rounded bg-white/[0.10] px-1.5 py-1 text-[10px] text-[var(--f-core-white)] hover:bg-white/[0.16] disabled:opacity-40"
          onClick={onSaveCopy}
          disabled={!path}
          title="Salvar uma cópia da imagem"
        >
          <Download size={12} aria-hidden="true" />
          Salvar cópia
        </button>
        <button
          type="button"
          className="felixo-btn inline-flex items-center gap-1 rounded bg-white/[0.10] px-1.5 py-1 text-[10px] text-[var(--f-core-white)] hover:bg-white/[0.16] disabled:opacity-40"
          onClick={onDuplicate}
          disabled={!path || duplicating}
          title="Criar uma cópia interna deste artefato"
        >
          <CopyPlus size={12} aria-hidden="true" />
          {duplicating ? 'Duplicando…' : 'Duplicar'}
        </button>
        {metadata?.temporary && (
          <button
            type="button"
            className="felixo-btn inline-flex items-center gap-1 rounded bg-[color-mix(in_srgb,var(--color-error)_14%,transparent)] px-1.5 py-1 text-[10px] text-[var(--color-error)] hover:bg-[color-mix(in_srgb,var(--color-error)_24%,transparent)] disabled:opacity-40"
            onClick={onRemoveTemporary}
            disabled={!path}
            title="Remover o arquivo temporário e este bloco"
          >
            <Trash2 size={12} aria-hidden="true" />
            Remover temporário
          </button>
        )}
      </div>

      {feedback && (
        <div role="status" aria-live="polite" className="text-[10px] text-[var(--f-core-white-soft)]">
          {feedback}
        </div>
      )}
    </div>
  )
}

function ImageMetadata({ metadata }: { metadata?: CanvasImageMetadata }) {
  const items: Array<[string, string]> = []
  if (metadata?.prompt) items.push(['Prompt', metadata.prompt])
  if (metadata?.model) items.push(['Modelo', metadata.model])
  if (metadata?.createdAt) items.push(['Data', formatImageDate(metadata.createdAt)])
  if (typeof metadata?.cost === 'number') {
    items.push(['Custo permitido', `US$ ${metadata.cost.toFixed(6)}`])
  }

  if (items.length === 0) return null

  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[10px]">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-[var(--f-core-secondary)]">{label}</dt>
          <dd className="truncate text-[var(--f-core-white-soft)]" title={value}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function formatImageDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 40)
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
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
            className="!h-2.5 !w-2.5 !bg-[var(--f-core-white)]"
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
    <div className="nodrag relative mt-auto border-t border-white/10 bg-white/[0.04] px-2 py-1.5 text-[11px]">
      <div className="mb-1 flex items-center gap-1 text-[var(--f-core-white-soft)]">
        <Link2 size={11} />
        <span>Agentes ligados</span>
        <span className="rounded bg-white/[0.08] px-1 text-[10px] text-[var(--f-core-white)]">
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
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--f-core-active)]" />
              <span className="min-w-0 flex-1 truncate text-[var(--f-core-white)]">{agent.label}</span>
              {canUnlink && (
                <button
                  type="button"
                  onClick={() => onUnlink(agent.id)}
                  className="felixo-btn-icon rounded p-0.5 text-[var(--f-core-secondary)] opacity-0 hover:bg-black/20 hover:text-[var(--color-error)] group-hover:opacity-100"
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
        <p className="text-[var(--f-core-secondary)]">Nenhum agente ligado ainda.</p>
      )}

      {canLink && (
        <div ref={menuRef} className="relative mt-1">
          <button
            type="button"
            onClick={onToggleMenu}
            className="felixo-btn inline-flex items-center gap-1 rounded bg-white/[0.10] px-1.5 py-0.5 text-[var(--f-core-white)] hover:bg-white/[0.16]"
            title="Ligar este arquivo a um agente do canvas"
          >
            <Plus size={11} />
            Ligar agente
          </button>

          {menuOpen && (
            <div className="nowheel absolute bottom-full left-0 z-10 mb-1 max-h-44 w-44 overflow-auto rounded-md border border-white/10 bg-[var(--f-core-graphite)] py-1 shadow-xl">
              {availableAgents.length > 0 ? (
                availableAgents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => onLink(agent.id)}
                    className="felixo-btn flex w-full items-center gap-1 px-2 py-1 text-left text-[var(--f-core-white)] hover:bg-white/[0.16]"
                  >
                    <Link2 size={11} className="shrink-0 opacity-60" />
                    <span className="min-w-0 flex-1 truncate">{agent.label}</span>
                  </button>
                ))
              ) : (
                <p className="px-2 py-1 text-[var(--f-core-secondary)]">
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
