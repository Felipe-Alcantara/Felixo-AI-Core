import { useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { FilePlus, FolderOpen, Plus, Trash2, X } from 'lucide-react'
import type { Model, ModelFileSelection } from '../types'
import { createModelId, detectModelCliType } from '../services/model-storage'

type ModelManagerModalProps = {
  isOpen: boolean
  models: Model[]
  onClose: () => void
  onAddModel: (model: Model) => void
  onClearModels: () => void
  onRemoveModel: (model: Model) => void
}

export function ModelManagerModal({
  isOpen,
  models,
  onClose,
  onAddModel,
  onClearModels,
  onRemoveModel,
}: ModelManagerModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const commandInputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formSource, setFormSource] = useState('')
  const [formCommand, setFormCommand] = useState('')

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
    setStatus(
      'Arquivo selecionado — confira os campos e clique em "Adicionar modelo".',
    )
  }

  function removeModel(model: Model) {
    onRemoveModel(model)
    setStatus(`Modelo "${model.name}" excluído.`)
  }

  function clearModels() {
    onClearModels()
    setStatus('Todos os modelos foram excluídos.')
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
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        className="flex max-h-[85vh] w-full max-w-[480px] flex-col rounded-3xl border border-white/10 bg-[var(--color-panel)] shadow-shell"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">
              Gerenciar modelos
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Importe, remova ou configure scripts de CLI.
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

        <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-5">
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
                  className="rounded-full border border-theme-error/20 px-3 py-1 text-[11px] text-theme-error transition hover:bg-theme-error/10"
                >
                  Limpar todos
                </button>
              )}
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-2xl border border-white/[0.08] bg-black/15 p-2">
              {models.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-zinc-500">
                  Nenhum modelo importado ainda.
                </p>
              ) : (
                models.map((model) => (
                  <div
                    key={model.id}
                    className="flex items-center gap-3 rounded-xl px-3 py-2 text-xs text-zinc-300"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-zinc-100">
                          {model.name}
                        </span>
                        <span className="shrink-0 rounded-full border border-white/[0.08] px-2 py-0.5 font-mono text-[10px] text-zinc-500">
                          {model.cliType}
                        </span>
                      </div>
                      <code className="mt-1 block truncate font-mono text-[11px] text-zinc-500">
                        {model.command}
                      </code>
                    </div>
                    <button
                      type="button"
                      title="Remover"
                      onClick={() => removeModel(model)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-theme-error/10 hover:text-theme-error"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <form className="space-y-3 rounded-2xl border border-white/[0.08] bg-black/10 p-3" onSubmit={handleSubmit}>
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
              <Plus size={14} aria-hidden="true" />
              Adicionar modelo
            </div>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
            />

            <label className="block text-xs text-zinc-400">
              Arquivo do modelo
              <div className="mt-1 flex gap-2">
                <input
                  ref={commandInputRef}
                  placeholder="Selecione ou digite o caminho"
                  value={formCommand}
                  onChange={(event) => setFormCommand(event.target.value)}
                  className="h-10 min-w-0 flex-1 rounded-2xl border border-white/[0.08] bg-[var(--color-input)] px-3 font-mono text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-cyan-200/30"
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
                onChange={(event) => setFormName(event.target.value)}
                className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[var(--color-input)] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-cyan-200/30"
              />
            </label>

            <label className="block text-xs text-zinc-400">
              Tipo
              <input
                placeholder="CLI local"
                value={formSource}
                onChange={(event) => setFormSource(event.target.value)}
                className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[var(--color-input)] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-cyan-200/30"
              />
            </label>

            <button
              type="submit"
              className="flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-zinc-100 text-sm font-medium text-zinc-950 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-100 focus:ring-offset-2 focus:ring-offset-[var(--color-panel)]"
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
