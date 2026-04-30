import { useRef } from 'react'
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react'
import { Mic, Plus, Send, Square, X } from 'lucide-react'
import type {
  ContextAttachment,
  Model,
  ModelId,
  ReasoningEffort,
} from '../types'

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

const providerModelOptionsByCliType: Partial<
  Record<Model['cliType'], RuntimeSelectOption[]>
> = {
  claude: [
    { value: 'sonnet', label: 'Sonnet 4.6' },
    { value: 'opus', label: 'Opus 4.6' },
    { value: 'haiku', label: 'Haiku 4.5' },
  ],
  codex: [
    { value: 'gpt-5.5', label: 'gpt-5.5' },
    { value: 'gpt-5.4', label: 'gpt-5.4' },
    { value: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
    { value: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
    { value: 'gpt-5.2', label: 'gpt-5.2' },
  ],
  'codex-app-server': [
    { value: 'gpt-5.5', label: 'gpt-5.5' },
    { value: 'gpt-5.4', label: 'gpt-5.4' },
    { value: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
    { value: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
    { value: 'gpt-5.2', label: 'gpt-5.2' },
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

const codexReasoningEffortOptions: ReasoningEffortOption[] = [
  defaultReasoningEffortOption,
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'XHigh' },
]

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
  codex: codexReasoningEffortOptions,
  'codex-app-server': codexReasoningEffortOptions,
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

    onChangeModelConfig({ providerModel: providerModel || undefined })
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
          : 'shrink-0 border-t border-white/[0.08] bg-[#171717] px-5 py-4 max-sm:px-3 max-sm:py-3 [@media(max-height:620px)]:py-2'
      }
    >
      <div
        className={
          isHome
            ? 'mx-auto w-full max-w-[600px]'
            : 'mx-auto w-full max-w-[680px]'
        }
      >
        <div className="rounded-[1.45rem] border border-white/[0.08] bg-[#2b2b2a] shadow-soft">
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
            disabled={isStreaming}
            rows={isHome ? 3 : 2}
            placeholder="Como posso ajudar você hoje?"
            className="max-h-36 min-h-16 w-full resize-none bg-transparent px-5 py-4 text-[13px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:text-zinc-500 max-sm:px-4 max-sm:py-3 [@media(max-height:620px)]:min-h-12"
          />

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-4 py-2.5 max-sm:px-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <button
                type="button"
                title="Adicionar contexto"
                onClick={() => attachmentInputRef.current?.click()}
                disabled={isStreaming}
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:bg-transparent"
              >
                <Plus size={17} aria-hidden="true" />
                <span className="sr-only">Adicionar contexto</span>
              </button>

              <select
                value={selectedModel?.id ?? ''}
                onChange={(event) => onSelectModel(event.target.value as ModelId)}
                disabled={isStreaming}
                title="Selecionar CLI"
                className="h-8 max-w-36 appearance-none truncate rounded-full border border-white/[0.08] bg-transparent px-3 text-[12px] text-zinc-300 outline-none transition hover:bg-white/[0.06] focus:ring-2 focus:ring-violet-200/40 disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:bg-transparent max-sm:max-w-28"
                aria-label="Selecionar modelo"
              >
                {models.length === 0 && (
                  <option value="">Nenhum modelo</option>
                )}
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>

              <select
                value={selectedProviderModel}
                onChange={(event) => changeProviderModel(event.target.value)}
                title="Modelo do provedor"
                aria-label="Modelo do provedor"
                disabled={!selectedModel || isStreaming}
                className="h-8 w-44 min-w-0 appearance-none truncate rounded-full border border-white/[0.08] bg-transparent px-3 font-mono text-[12px] text-zinc-300 outline-none transition hover:bg-white/[0.06] focus:ring-2 focus:ring-violet-200/40 disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:bg-transparent max-sm:w-32"
              >
                {providerModelOptions.map((option) => (
                  <option key={option.value || 'default'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                value={selectedReasoningEffort}
                onChange={(event) =>
                  changeReasoningEffort(
                    event.target.value as '' | ReasoningEffort,
                  )
                }
                title="Effort"
                aria-label="Effort"
                disabled={isReasoningEffortDisabled}
                className="h-8 w-[104px] appearance-none truncate rounded-full border border-white/[0.08] bg-transparent px-3 text-[12px] text-zinc-300 outline-none transition hover:bg-white/[0.06] focus:ring-2 focus:ring-violet-200/40 disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:bg-transparent"
              >
                {reasoningEffortOptions.map((option) => (
                  <option key={option.value || 'default'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Voz"
                disabled={isStreaming}
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:bg-transparent"
              >
                <Mic size={15} aria-hidden="true" />
                <span className="sr-only">Voz</span>
              </button>
              <button
                type={isStreaming ? 'button' : 'submit'}
                title={isStreaming ? 'Parar' : 'Enviar'}
                onClick={isStreaming ? onStop : undefined}
                disabled={!isStreaming && !input.trim()}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-zinc-950 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-100 focus:ring-offset-2 focus:ring-offset-[#2b2b2a] disabled:cursor-not-allowed disabled:bg-zinc-600 disabled:text-zinc-400"
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
                <span
                  key={attachment.id}
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
                    onClick={() => onRemoveAttachment(attachment.id)}
                    disabled={isStreaming}
                    className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.08] hover:text-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-700"
                  >
                    <X size={11} aria-hidden="true" />
                    <span className="sr-only">Remover anexo</span>
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap justify-center gap-2 [@media(max-height:620px)]:hidden">
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              disabled={isStreaming}
              onClick={() => onInputChange(`${starter}: `)}
              className="shrink-0 rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-[12px] text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-200/40 disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:bg-transparent"
            >
              {starter}
            </button>
          ))}
        </div>
      </div>
    </form>
  )
}

async function createAttachment(file: File): Promise<ContextAttachment> {
  const path = window.felixo?.getFilePath?.(file) ?? undefined
  const contentPreview = await createContentPreview(file)

  return {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    name: file.name,
    path,
    type: file.type || 'application/octet-stream',
    size: file.size,
    contentPreview,
  }
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

function shouldReadTextPreview(file: File) {
  if (file.size > 64 * 1024) {
    return false
  }

  return (
    file.type.startsWith('text/') ||
    /\.(cjs|css|html|js|json|jsx|md|py|ts|tsx|txt|xml|yaml|yml)$/i.test(file.name)
  )
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
  return model
    ? reasoningEffortOptionsByCliType[model.cliType] ?? [
        defaultReasoningEffortOption,
      ]
    : [defaultReasoningEffortOption]
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
