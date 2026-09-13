import { useRef } from 'react'
import type {
  ChangeEvent,
  ClipboardEvent,
  FormEvent,
  KeyboardEvent,
} from 'react'
import {
  BookOpen,
  CheckCheck,
  Code2,
  FolderOpen,
  ListChecks,
  Mic,
  Plus,
  ScanSearch,
  Send,
  Square,
  SquareTerminal,
  X,
} from 'lucide-react'
const STARTER_ICONS: Record<string, typeof Code2> = {
  'Código': Code2,
  'Planejar': ListChecks,
  'Analisar': ScanSearch,
  'Explicar': BookOpen,
  'Revisar': CheckCheck,
}

import { FelixoSelect } from '../../shared/components/FelixoSelect'
import { CliMark } from '../../shared/brand/CliMark'
import type {
  ContextAttachment,
  Model,
  ModelId,
  ReasoningEffort,
} from '../types'
import {
  getAgent,
  getEffortLevels,
  isEffortValidForModel,
} from '../../canvas/services/agent-launch-options'

type RuntimeSelectOption = {
  value: string
  label: string
}

type ReasoningEffortOption = {
  value: '' | ReasoningEffort
  label: string
}

const defaultProviderModelOption: RuntimeSelectOption = {
  value: '',
  label: 'Padrão',
}

const IMAGE_PREVIEW_MAX_WIDTH = 360
const IMAGE_PREVIEW_MAX_HEIGHT = 240
const IMAGE_PREVIEW_FALLBACK_MAX_BYTES = 256 * 1024

const providerModelOptionsByCliType: Partial<
  Record<Model['cliType'], RuntimeSelectOption[]>
> = {
  claude: [
    { value: 'sonnet', label: 'Sonnet 4.6' },
    { value: 'opus', label: 'Opus 4.6' },
    { value: 'haiku', label: 'Haiku 4.5' },
  ],
  codex: [
    { value: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
    { value: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
    { value: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
  ],
  'codex-app-server': [
    { value: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
    { value: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
    { value: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
  ],
  gemini: [
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
    { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  ],
  'gemini-acp': [
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
    { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  ],
}

const defaultReasoningEffortOption: ReasoningEffortOption = {
  value: '',
  label: 'Padrão',
}

const claudeReasoningEffortOptions: ReasoningEffortOption[] = [
  defaultReasoningEffortOption,
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' },
]

const reasoningEffortOptionsByCliType: Partial<
  Record<Model['cliType'], ReasoningEffortOption[]>
> = {
  claude: claudeReasoningEffortOptions,
}

const EFFORT_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'XHigh',
  max: 'Max',
  ultra: 'Ultra',
}

// Codex's per-model effort set (Sol/Terra support "ultra", Luna doesn't) lives in
// agent-launch-options.ts, the single source of truth also used by the canvas
// terminal launcher — derive the dropdown options from it instead of duplicating the table.
function getCodexReasoningEffortOptions(providerModel: string): ReasoningEffortOption[] {
  const agent = getAgent('codex')
  const levels = (agent && getEffortLevels(agent, providerModel)) ?? []
  return [
    defaultReasoningEffortOption,
    ...levels.map((level) => ({ value: level, label: EFFORT_LABELS[level] ?? level })),
  ]
}

type ModelRuntimeConfigPatch = Partial<
  Pick<Model, 'providerModel' | 'reasoningEffort'>
>

type ComposerProps = {
  input: string
  starters: string[]
  models: Model[]
  selectedModel: Model | null
  attachments: ContextAttachment[]
  variant?: 'home' | 'dock'
  isStreaming?: boolean
  onInputChange: (value: string) => void
  onSelectModel: (modelId: ModelId) => void
  onChangeModelConfig: (patch: ModelRuntimeConfigPatch) => void
  onAddAttachments: (attachments: ContextAttachment[]) => void
  onRemoveAttachment: (attachmentId: string) => void
  onSubmit: () => void
  onStop?: () => void
}

export function Composer({
  input,
  starters,
  models,
  selectedModel,
  attachments,
  variant = 'dock',
  isStreaming = false,
  onInputChange,
  onSelectModel,
  onChangeModelConfig,
  onAddAttachments,
  onRemoveAttachment,
  onSubmit,
  onStop,
}: ComposerProps) {
  const attachmentInputRef = useRef<HTMLInputElement>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isStreaming) {
      return
    }

    onSubmit()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !isStreaming) {
      event.preventDefault()
      onSubmit()
    }
  }

  function changeProviderModel(providerModel: string) {
    if (!selectedModel || isStreaming) {
      return
    }

    const currentProviderModel = selectedModel.providerModel ?? ''

    if (providerModel === currentProviderModel) {
      return
    }

    const currentEffort = selectedModel.reasoningEffort ?? ''
    const isCodex = selectedModel.cliType === 'codex' || selectedModel.cliType === 'codex-app-server'
    const codexAgent = isCodex ? getAgent('codex') : undefined
    const effortStillValid =
      !isCodex || !codexAgent || isEffortValidForModel(codexAgent, providerModel, currentEffort)

    onChangeModelConfig({
      providerModel: providerModel || undefined,
      ...(effortStillValid ? {} : { reasoningEffort: undefined }),
    })
  }

  function changeReasoningEffort(value: '' | ReasoningEffort) {
    if (!selectedModel || isStreaming) {
      return
    }

    onChangeModelConfig({ reasoningEffort: value || undefined })
  }

  async function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''

    if (files.length === 0) {
      return
    }

    const nextAttachments = await Promise.all(files.map(createAttachment))
    onAddAttachments(nextAttachments)
  }

  async function handlePickContext(mode: 'files' | 'directory') {
    if (isStreaming) {
      return
    }

    const pickContext = window.felixo?.files?.pickContext

    if (!pickContext) {
      if (mode === 'files') {
        attachmentInputRef.current?.click()
      }
      return
    }

    const result = await pickContext({ mode }).catch(() => null)

    if (!result?.ok) {
      if (mode === 'files') {
        attachmentInputRef.current?.click()
      }
      return
    }

    const nextAttachments = (result.attachments ?? [])
      .map(createPickedContextAttachment)
      .filter((attachment): attachment is ContextAttachment => Boolean(attachment))

    if (nextAttachments.length > 0) {
      onAddAttachments(nextAttachments)
    }
  }

  async function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (isStreaming) {
      return
    }

    const imageFiles = createClipboardImageFiles(event.clipboardData)

    if (imageFiles.length === 0) {
      return
    }

    if (!event.clipboardData.getData('text/plain')) {
      event.preventDefault()
    }

    const nextAttachments = await Promise.all(imageFiles.map(createAttachment))
    onAddAttachments(nextAttachments)
  }

  const isHome = variant === 'home'
  const providerModelOptions = getProviderModelOptions(selectedModel)
  const reasoningEffortOptions = getReasoningEffortOptions(selectedModel)
  const selectedProviderModel = selectedModel?.providerModel ?? ''
  const selectedReasoningEffort = resolveSelectedReasoningEffort(
    selectedModel,
    reasoningEffortOptions,
  )
  const isReasoningEffortDisabled =
    !selectedModel || isStreaming || reasoningEffortOptions.length <= 1

  return (
    <form
      onSubmit={handleSubmit}
      className={
        isHome
          ? ''
          : 'shrink-0 border-t border-white/[0.08] bg-[var(--color-main-bg)] px-5 py-4 max-sm:px-3 max-sm:py-3 [@media(max-height:620px)]:py-2'
      }
    >
      <div
        className={
          isHome
            ? 'mx-auto w-full max-w-[600px]'
            : 'mx-auto w-full max-w-[680px]'
        }
      >
        <div className="felixo-composer">
          <input
            ref={attachmentInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleAttachmentChange}
          />

          <textarea
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={isStreaming}
            rows={isHome ? 3 : 2}
            placeholder="Envie uma mensagem para o Felixo..."
            className="max-h-36 min-h-16 w-full resize-none bg-transparent px-5 py-4 text-[13px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:text-zinc-500 max-sm:px-4 max-sm:py-3 [@media(max-height:620px)]:min-h-12"
          />

          <div className="felixo-composer-footer">
            <div className="felixo-composer-controls">
              <button
                type="button"
                title="Adicionar arquivos de qualquer tipo"
                onClick={() => void handlePickContext('files')}
                disabled={isStreaming}
                className="felixo-btn-icon flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:bg-transparent"
              >
                <Plus size={17} aria-hidden="true" />
                <span className="sr-only">Adicionar arquivos</span>
              </button>

              <button
                type="button"
                title="Adicionar pasta inteira"
                onClick={() => void handlePickContext('directory')}
                disabled={isStreaming}
                className="felixo-btn-icon flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:bg-transparent"
              >
                <FolderOpen size={16} aria-hidden="true" />
                <span className="sr-only">Adicionar pasta</span>
              </button>

              <FelixoSelect
                value={selectedModel?.id ?? ''}
                onChange={(value) => onSelectModel(value as ModelId)}
                disabled={isStreaming}
                aria-label="Selecionar CLI"
                menuLabel="CLIs disponíveis"
                placeholder="Nenhuma CLI"
                className="felixo-composer-select"
                options={models.map((model) => ({
                  value: model.id,
                  label: model.name,
                  searchText: model.name,
                  icon: <CliMark cliType={model.cliType} size={15} />,
                }))}
              />

              <FelixoSelect
                value={selectedProviderModel}
                onChange={changeProviderModel}
                disabled={!selectedModel || isStreaming}
                aria-label="Modelo do provedor"
                menuLabel="Modelo do provedor"
                searchable={providerModelOptions.length > 8}
                className="felixo-composer-select felixo-composer-select-model"
                options={providerModelOptions.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
              />

              <FelixoSelect
                value={selectedReasoningEffort}
                onChange={(value) => changeReasoningEffort(value as '' | ReasoningEffort)}
                disabled={isReasoningEffortDisabled}
                aria-label="Esforço de raciocínio"
                menuLabel="Esforço de raciocínio"
                className="felixo-composer-select"
                options={reasoningEffortOptions.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
              />
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Voz"
                disabled={isStreaming}
                className="felixo-btn-icon flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:bg-transparent"
              >
                <Mic size={15} aria-hidden="true" />
                <span className="sr-only">Voz</span>
              </button>
              <button
                type={isStreaming ? 'button' : 'submit'}
                title={isStreaming ? 'Parar' : 'Enviar'}
                onClick={isStreaming ? onStop : undefined}
                disabled={!isStreaming && !input.trim() && attachments.length === 0}
                className="felixo-btn-icon felixo-composer-send"
              >
                {isStreaming ? (
                  <Square size={13} aria-hidden="true" />
                ) : (
                  <Send size={15} aria-hidden="true" />
                )}
                <span className="sr-only">{isStreaming ? 'Parar' : 'Enviar'}</span>
              </button>
            </div>
          </div>

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-white/[0.06] px-4 py-2.5 max-sm:px-3">
              {attachments.map((attachment) => (
                <AttachmentPreview
                  key={attachment.id}
                  attachment={attachment}
                  isStreaming={isStreaming}
                  onRemove={onRemoveAttachment}
                />
              ))}
            </div>
          )}
        </div>

        <div className="felixo-chat-starters [@media(max-height:620px)]:hidden">
          {starters.map((starter) => {
            const Icone = STARTER_ICONS[starter] ?? SquareTerminal
            return (
              <button
                key={starter}
                type="button"
                disabled={isStreaming}
                onClick={() => onInputChange(`${starter}: `)}
                className="felixo-btn felixo-chat-starter"
              >
                <Icone size={13} aria-hidden />
                {starter}
              </button>
            )
          })}
        </div>

        {/* Dicas do composer: atalhos que já existem, escritos onde a pessoa
            está prestes a digitar. */}
        <p className="felixo-composer-hints [@media(max-height:620px)]:hidden">
          <span><strong>@</strong> para mencionar</span>
          <span><strong>/</strong> para comandos</span>
          <span><strong>Shift + Enter</strong> para nova linha</span>
        </p>
      </div>
    </form>
  )
}

function AttachmentPreview({
  attachment,
  isStreaming,
  onRemove,
}: {
  attachment: ContextAttachment
  isStreaming: boolean
  onRemove: (attachmentId: string) => void
}) {
  if (isImageAttachment(attachment) && attachment.previewUrl) {
    return (
      <div
        title={attachment.path || attachment.name}
        className="relative flex w-48 max-w-full flex-col overflow-hidden rounded-lg border border-white/[0.08] bg-black/20 text-zinc-300"
      >
        <div className="flex aspect-[4/3] w-full items-center justify-center bg-black/25">
          <img
            src={attachment.previewUrl}
            alt={attachment.name}
            className="h-full w-full object-contain"
          />
        </div>
        <div className="flex min-w-0 items-center gap-1.5 border-t border-white/[0.06] px-2 py-1.5">
          <span className="min-w-0 flex-1 truncate text-[11px]">
            {attachment.name}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-zinc-600">
            {formatFileSize(attachment.size)}
          </span>
          <button
            type="button"
            title="Remover anexo"
            onClick={() => onRemove(attachment.id)}
            disabled={isStreaming}
            className="felixo-btn-icon flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-white/[0.08] hover:text-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-700"
          >
            <X size={12} aria-hidden="true" />
            <span className="sr-only">Remover anexo</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <span
      title={attachment.path || attachment.name}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/15 px-2.5 py-1 text-[11px] text-zinc-300"
    >
      <span className="max-w-40 truncate">{attachment.name}</span>
      <span className="shrink-0 font-mono text-zinc-600">
        {formatFileSize(attachment.size)}
      </span>
      <button
        type="button"
        title="Remover anexo"
        onClick={() => onRemove(attachment.id)}
        disabled={isStreaming}
        className="felixo-btn-icon ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-white/[0.08] hover:text-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-700"
      >
        <X size={11} aria-hidden="true" />
        <span className="sr-only">Remover anexo</span>
      </button>
    </span>
  )
}

async function createAttachment(file: File): Promise<ContextAttachment> {
  const filePath = window.felixo?.getFilePath?.(file) || undefined
  const isImage = isImageFile(file)
  const [savedImageAttachment, contentPreview, previewUrl] = await Promise.all([
    isImage ? saveImageAttachment(file) : Promise.resolve(null),
    createContentPreview(file),
    isImage ? createImagePreviewUrl(file) : Promise.resolve(undefined),
  ])
  // Images are copied into the app-owned attachment directory whenever the
  // renderer can provide their bytes. Keeping that path first means the
  // preview reader never needs to trust a renderer-supplied external path.
  const path = savedImageAttachment?.filePath ?? filePath

  return {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    name: savedImageAttachment?.fileName ?? file.name,
    path,
    type: savedImageAttachment?.type ?? (file.type || 'application/octet-stream'),
    size: savedImageAttachment?.size ?? file.size,
    previewUrl,
    contentPreview,
  }
}

function createPickedContextAttachment(value: unknown): ContextAttachment | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const attachment = value as {
    id?: unknown
    name?: unknown
    path?: unknown
    type?: unknown
    size?: unknown
    isDirectory?: unknown
  }
  const path = typeof attachment.path === 'string' ? attachment.path : ''

  if (!isAbsoluteFilePath(path)) {
    return null
  }

  return {
    id:
      typeof attachment.id === 'string' && attachment.id
        ? attachment.id
        : crypto.randomUUID?.() || `${Date.now()}`,
    name:
      typeof attachment.name === 'string' && attachment.name
        ? attachment.name
        : getPathName(path),
    path,
    type:
      typeof attachment.type === 'string' && attachment.type
        ? attachment.type
        : 'application/octet-stream',
    size:
      typeof attachment.size === 'number' && Number.isFinite(attachment.size)
        ? Math.max(0, attachment.size)
        : 0,
    isDirectory: attachment.isDirectory === true,
  }
}

function isAbsoluteFilePath(filePath: string) {
  return (
    filePath.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(filePath) ||
    filePath.startsWith('\\\\')
  )
}

function getPathName(filePath: string) {
  return filePath.split(/[\\/]/).filter(Boolean).pop() || filePath
}

async function saveImageAttachment(file: File) {
  if (!window.felixo?.files?.saveAttachment) {
    return null
  }

  const data = await file.arrayBuffer().catch(() => null)

  if (!data) {
    return null
  }

  const result = await window.felixo.files
    .saveAttachment({
      name: file.name,
      type: resolveImageMimeType(file) || 'application/octet-stream',
      data,
    })
    .catch(() => null)

  return result?.ok && result.filePath ? result : null
}

async function createContentPreview(file: File) {
  if (!shouldReadTextPreview(file)) {
    return undefined
  }

  const text = await file.text().catch(() => '')
  const trimmedText = text.trim()

  if (!trimmedText) {
    return undefined
  }

  return trimmedText.length > 6000
    ? `${trimmedText.slice(0, 6000)}\n[preview truncado]`
    : trimmedText
}

async function createImagePreviewUrl(file: File) {
  const objectUrl = URL.createObjectURL(file)

  try {
    const image = await loadImage(objectUrl)
    const { width, height } = fitImageSize(
      image.naturalWidth || image.width,
      image.naturalHeight || image.height,
      IMAGE_PREVIEW_MAX_WIDTH,
      IMAGE_PREVIEW_MAX_HEIGHT,
    )

    if (!width || !height) {
      return undefined
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')

    if (!context) {
      return undefined
    }

    context.drawImage(image, 0, 0, width, height)

    return canvas.toDataURL('image/webp', 0.82)
  } catch {
    return readSmallImageDataUrl(file)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Falha ao carregar preview da imagem.'))
    image.src = src
  })
}

function fitImageSize(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) {
  if (width <= 0 || height <= 0) {
    return { width: 0, height: 0 }
  }

  const scale = Math.min(1, maxWidth / width, maxHeight / height)

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function readSmallImageDataUrl(file: File) {
  if (file.size > IMAGE_PREVIEW_FALLBACK_MAX_BYTES) {
    return undefined
  }

  return new Promise<string | undefined>((resolve) => {
    const reader = new FileReader()

    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : undefined)
    reader.onerror = () => resolve(undefined)
    reader.readAsDataURL(file)
  })
}

function shouldReadTextPreview(file: File) {
  if (file.size > 64 * 1024) {
    return false
  }

  return (
    file.type.startsWith('text/') ||
    /\.(cjs|css|html|js|json|jsx|md|py|ts|tsx|txt|xml|yaml|yml)$/i.test(file.name)
  )
}

function createClipboardImageFiles(clipboardData: DataTransfer) {
  const itemFiles = Array.from(clipboardData.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
    .filter(isImageFile)

  const files =
    itemFiles.length > 0
      ? itemFiles
      : Array.from(clipboardData.files ?? []).filter(isImageFile)

  return files.map((file, index) =>
    createClipboardImageFile(file, index, files.length),
  )
}

function createClipboardImageFile(file: File, index: number, total: number) {
  const extension = getImageExtension(file)
  const indexSuffix = total > 1 ? `-${index + 1}` : ''
  const name = `clipboard-image-${formatClipboardTimestamp(new Date())}${indexSuffix}.${extension}`

  return new File([file], name, {
    type: file.type || getImageMimeTypeFromExtension(extension),
    lastModified: file.lastModified || Date.now(),
  })
}

function isImageFile(file: File) {
  return (
    file.type.startsWith('image/') ||
    /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name)
  )
}

function isImageAttachment(attachment: ContextAttachment) {
  if (attachment.isDirectory) {
    return false
  }

  return (
    attachment.type.startsWith('image/') ||
    /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(attachment.name)
  )
}

function getImageExtension(file: File) {
  const mimeExtensionByType: Record<string, string> = {
    'image/avif': 'avif',
    'image/bmp': 'bmp',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/svg+xml': 'svg',
    'image/webp': 'webp',
  }
  const extensionFromMime = mimeExtensionByType[file.type.toLowerCase()]

  if (extensionFromMime) {
    return extensionFromMime
  }

  const extensionFromName = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]

  return extensionFromName?.toLowerCase() ?? 'png'
}

function resolveImageMimeType(file: File) {
  return file.type || getImageMimeTypeFromExtension(getImageExtension(file))
}

function getImageMimeTypeFromExtension(extension: string) {
  if (extension === 'jpg' || extension === 'jpeg') {
    return 'image/jpeg'
  }

  if (extension === 'svg') {
    return 'image/svg+xml'
  }

  return `image/${extension}`
}

function formatClipboardTimestamp(date: Date) {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[-:]/g, '')
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function getProviderModelOptions(model: Model | null) {
  const options = [
    defaultProviderModelOption,
    ...(model ? providerModelOptionsByCliType[model.cliType] ?? [] : []),
  ]
  const currentProviderModel = model?.providerModel ?? ''

  if (
    currentProviderModel &&
    !options.some((option) => option.value === currentProviderModel)
  ) {
    return [
      ...options,
      {
        value: currentProviderModel,
        label: currentProviderModel,
      },
    ]
  }

  return options
}

function getReasoningEffortOptions(model: Model | null) {
  if (!model) {
    return [defaultReasoningEffortOption]
  }
  if (model.cliType === 'codex' || model.cliType === 'codex-app-server') {
    return getCodexReasoningEffortOptions(model.providerModel ?? '')
  }
  return reasoningEffortOptionsByCliType[model.cliType] ?? [defaultReasoningEffortOption]
}

function resolveSelectedReasoningEffort(
  model: Model | null,
  options: ReasoningEffortOption[],
) {
  const currentReasoningEffort = model?.reasoningEffort ?? ''

  return options.some((option) => option.value === currentReasoningEffort)
    ? currentReasoningEffort
    : ''
}
