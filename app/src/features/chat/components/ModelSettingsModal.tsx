import { useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { BrainCircuit, FilePlus, FolderOpen, Plus, Save, Trash2, X } from 'lucide-react'
import type { Model, ModelFileSelection, ReasoningEffort } from '../types'
import { createModelId, detectModelCliType } from '../services/model-storage'

type ModelSettingsModalProps = {
  models: Model[]
  selectedModel: Model | null
  isOpen: boolean
  onClose: () => void
  onAddModel: (model: Model) => void
  onClearModels: () => void
  onUpdateModel: (model: Model) => void
  onRemoveModel: (model: Model) => void
}

type ModelConfigDraft = {
  providerModel: string
  reasoningEffort: '' | ReasoningEffort
}

const reasoningEffortOptions: Array<{
  value: '' | ReasoningEffort
  label: string
}> = [
  { value: '', label: 'Padrão da CLI' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'XHigh' },
  { value: 'max', label: 'Max' },
]

export function ModelSettingsModal({
  models,
  selectedModel,
  isOpen,
  onClose,
  onAddModel,
  onClearModels,
  onUpdateModel,
  onRemoveModel,
}: ModelSettingsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const commandInputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formSource, setFormSource] = useState('')
  const [formCommand, setFormCommand] = useState('')
  const [configDrafts, setConfigDrafts] = useState<Record<string, ModelConfigDraft>>({})
  const selectedConfigDraft = selectedModel ? configDrafts[selectedModel.id] : undefined
  const configProviderModel =
    selectedConfigDraft?.providerModel ?? selectedModel?.providerModel ?? ''
  const configReasoningEffort =
    selectedConfigDraft?.reasoningEffort ?? selectedModel?.reasoningEffort ?? ''
  const selectedCapabilities = getModelCapabilities(selectedModel)

  if (!isOpen) {
    return null
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    const selection = await createSelectionFromBrowserFile(file)
    setFormCommand(selection.command)
    if (!formName.trim()) setFormName(selection.name)
    if (!formSource.trim()) setFormSource(selection.source)
    setStatus('Arquivo selecionado — confira os campos e clique em "Adicionar modelo".')
  }

  function removeModel(model: Model) {
    onRemoveModel(model)
    setStatus(`Modelo "${model.name}" excluído.`)
  }

  function clearModels() {
    onClearModels()
    setStatus('Todos os modelos foram excluídos.')
  }

  function handleUpdateSelected(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedModel) {
      setStatus('Selecione um modelo para configurar.')
      return
    }

    const providerModel = configProviderModel.trim()

    onUpdateModel({
      ...selectedModel,
      providerModel: providerModel || undefined,
      reasoningEffort: configReasoningEffort || undefined,
    })
    setStatus(`Configuração de "${selectedModel.name}" atualizada.`)
  }

  function updateSelectedConfigDraft(patch: Partial<ModelConfigDraft>) {
    if (!selectedModel) {
      return
    }

    setConfigDrafts((current) => {
      const currentDraft = current[selectedModel.id]
      const base = {
        providerModel: currentDraft?.providerModel ?? selectedModel.providerModel ?? '',
        reasoningEffort:
          currentDraft?.reasoningEffort ?? selectedModel.reasoningEffort ?? '',
      }

      return {
        ...current,
        [selectedModel.id]: {
          ...base,
          ...patch,
        },
      }
    })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const command = formCommand.trim()
    const source = formSource.trim()
    const rawName = formName.trim()
    const name = rawName || inferModelName('', getFileNameFromCommand(command))

    if (!command) {
      setStatus('Informe ou escolha o arquivo do modelo.')
      commandInputRef.current?.focus()
      return
    }

    const existingModel = models.find((model) => model.command === command)

    if (existingModel) {
      setStatus(`Modelo "${existingModel.name}" já está importado.`)
      return
    }

    onAddModel({
      id: createModelId(name),
      name,
      source: source || 'CLI local',
      command,
      cliType: detectModelCliType({
        command,
        name,
        source: source || 'CLI local',
      }),
    })

    setFormName('')
    setFormSource('')
    setFormCommand('')
    setStatus(null)
    onClose()
  }

  async function createSelectionFromBrowserFile(
    file: File,
  ): Promise<ModelFileSelection> {
    const content = await file.text().catch(() => '')
    const filePath = window.felixo?.getFilePath?.(file) ?? ''
    const name = inferModelName(content, file.name)
    const command = createCommandPath(file.name, filePath)

    return {
      name,
      command,
      source: 'CLI local',
      cliType: detectModelCliType({
        command,
        name,
        source: 'CLI local',
      }),
    }
  }

  function createCommandPath(fileName: string, filePath: string) {
    if (!filePath) {
      return `./ai-clis/${fileName}`
    }

    const normalizedPath = filePath.replaceAll('\\', '/')
    const aiClisSegment = '/ai-clis/'
    const aiClisIndex = normalizedPath.lastIndexOf(aiClisSegment)

    if (aiClisIndex >= 0) {
      return `./ai-clis/${normalizedPath.slice(
        aiClisIndex + aiClisSegment.length,
      )}`
    }

    return filePath
  }

  function inferModelName(content: string, fileName: string) {
    const commentName = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.startsWith('# ') || line.startsWith('#\t'))

    if (commentName) {
      return commentName.replace(/^#\s*/, '').trim()
    }

    return fileName
      .replace(/\.[^.]+$/, '')
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(' ')
  }

  function getFileNameFromCommand(command: string) {
    if (!command) {
      return ''
    }

    return command.replaceAll('\\', '/').split('/').filter(Boolean).at(-1) ?? ''
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        className="w-full max-w-[520px] rounded-3xl border border-white/10 bg-[#242423] shadow-shell"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">
              Modelos locais
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Importe scripts executáveis, como os arquivos de ai-clis.
            </p>
          </div>

          <button
            type="button"
            title="Fechar"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100"
          >
            <X size={16} aria-hidden="true" />
            <span className="sr-only">Fechar</span>
          </button>
        </header>

        <div className="space-y-5 px-5 py-5">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
          />

          <button
            type="button"
            disabled={!selectedModel}
            onClick={() => selectedModel && removeModel(selectedModel)}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-red-300/20 text-sm font-medium text-red-200 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:border-white/[0.08] disabled:text-zinc-600 disabled:hover:bg-transparent"
          >
            <Trash2 size={16} aria-hidden="true" />
            Remover selecionado
          </button>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium text-zinc-300">
              <span className="flex items-center gap-2">
                <FilePlus size={14} aria-hidden="true" />
                Modelos importados
              </span>
              {models.length > 0 && (
                <button
                  type="button"
                  onClick={clearModels}
                  className="rounded-full border border-red-300/20 px-3 py-1 text-[11px] text-red-200 transition hover:bg-red-400/10"
                >
                  Limpar todos
                </button>
              )}
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-2xl border border-white/[0.08] bg-black/15 p-2">
              {models.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-zinc-500">
                  Nenhum modelo importado ainda.
                </p>
              ) : (
                models.map((model) => (
                  <div
                    key={model.id}
                    className="rounded-xl px-3 py-2 text-xs text-zinc-300"
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium text-zinc-100">
                            {model.name}
                          </span>
                          <span className="shrink-0 text-zinc-500">
                            {model.source}
                          </span>
                        </div>
                        <code className="mt-1 block truncate font-mono text-[11px] text-zinc-500">
                          {model.command}
                        </code>
                        {(model.providerModel || model.reasoningEffort) && (
                          <div className="mt-1 flex min-w-0 flex-wrap gap-1.5 text-[10px] text-zinc-500">
                            {model.providerModel && (
                              <span className="rounded-full border border-white/[0.08] px-2 py-0.5">
                                {model.providerModel}
                              </span>
                            )}
                            {model.reasoningEffort && (
                              <span className="rounded-full border border-white/[0.08] px-2 py-0.5">
                                effort {model.reasoningEffort}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        title="Excluir modelo"
                        onClick={() => removeModel(model)}
                        className="flex h-8 items-center gap-1.5 rounded-full border border-red-300/20 px-3 text-[11px] text-red-200 transition hover:bg-red-400/10"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                        Remover
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <form
            className="space-y-3 rounded-2xl border border-white/[0.08] bg-black/10 p-3"
            onSubmit={handleUpdateSelected}
          >
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
              <BrainCircuit size={14} aria-hidden="true" />
              Execução do selecionado
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-black/15 p-3 text-xs text-zinc-400">
              {selectedModel ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-zinc-200">
                      {selectedModel.name}
                    </span>
                    <span className="rounded-full border border-white/[0.08] px-2 py-0.5 font-mono text-[10px] text-zinc-500">
                      {selectedModel.cliType}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1 leading-relaxed">
                    {selectedCapabilities.map((capability) => (
                      <li key={capability}>{capability}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>Selecione um modelo para ver capacidades e campos.</p>
              )}
            </div>

            <label className="block text-xs text-zinc-400">
              Modelo
              <input
                placeholder="gpt-5.5"
                value={configProviderModel}
                onChange={(e) =>
                  updateSelectedConfigDraft({ providerModel: e.target.value })
                }
                disabled={!selectedModel}
                className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 font-mono text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-violet-200/30 disabled:cursor-not-allowed disabled:text-zinc-600"
              />
            </label>

            <label className="block text-xs text-zinc-400">
              Effort
              <select
                value={configReasoningEffort}
                onChange={(e) =>
                  updateSelectedConfigDraft({
                    reasoningEffort: e.target.value as '' | ReasoningEffort,
                  })
                }
                disabled={!selectedModel}
                className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-violet-200/30 disabled:cursor-not-allowed disabled:text-zinc-600"
              >
                {reasoningEffortOptions.map((option) => (
                  <option key={option.value || 'default'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              disabled={!selectedModel}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.08] text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:bg-transparent"
            >
              <Save size={16} aria-hidden="true" />
              Salvar configuração
            </button>
          </form>

          <form className="space-y-3" onSubmit={handleSubmit}>
            <label className="block text-xs text-zinc-400">
              Arquivo do modelo
              <div className="mt-1 flex gap-2">
                <input
                  ref={commandInputRef}
                  placeholder="Selecione ou digite o caminho"
                  value={formCommand}
                  onChange={(e) => setFormCommand(e.target.value)}
                  className="h-10 min-w-0 flex-1 rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 font-mono text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-violet-200/30"
                />
                <button
                  type="button"
                  title="Escolher arquivo"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100"
                >
                  <FolderOpen size={16} aria-hidden="true" />
                  <span className="sr-only">Escolher arquivo</span>
                </button>
              </div>
            </label>

            <label className="block text-xs text-zinc-400">
              Nome
              <input
                placeholder="Codex CLI"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-violet-200/30"
              />
            </label>

            <label className="block text-xs text-zinc-400">
              Tipo
              <input
                placeholder="CLI local"
                value={formSource}
                onChange={(e) => setFormSource(e.target.value)}
                className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-violet-200/30"
              />
            </label>

            <button
              type="submit"
              className="flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-zinc-100 text-sm font-medium text-zinc-950 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-100 focus:ring-offset-2 focus:ring-offset-[#242423]"
            >
              <Plus size={16} aria-hidden="true" />
              Adicionar modelo
            </button>

            {status && (
              <p className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-zinc-400">
                {status}
              </p>
            )}
          </form>
        </div>
      </section>
    </div>
  )
}

function getModelCapabilities(model: Model | null) {
  if (!model) {
    return []
  }

  if (model.cliType === 'claude') {
    return [
      'Processo persistente real por thread quando a CLI suporta stream-json.',
      'Configura modelo do provedor e effort no prompt/adapter.',
      'Usa retomada de sessão quando providerSessionId está disponível.',
    ]
  }

  if (model.cliType === 'codex' || model.cliType === 'codex-app-server') {
    return [
      'Executa com JSON estruturado e eventos de terminal humanizados.',
      'Configura modelo OpenAI e effort quando suportado pelo adapter.',
      'Prepara continuidade por thread e retomada nativa quando há sessão.',
    ]
  }

  if (model.cliType === 'gemini' || model.cliType === 'gemini-acp') {
    return [
      'Executa Gemini CLI com saída estruturada e parsing de eventos.',
      'Configura modelo do provedor quando o adapter aceita override.',
      'Prepara retomada nativa ou ACP conforme o tipo cadastrado.',
    ]
  }

  return [
    'Tipo de CLI ainda não reconhecido.',
    'Configure comando, nome e origem para o app detectar o adapter correto.',
  ]
}
