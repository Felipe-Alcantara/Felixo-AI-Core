import { useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { FilePlus, FolderOpen, Plus, Trash2, Upload, X } from 'lucide-react'
import type { Model, ModelFileSelection } from '../types'
import { createModelId } from '../services/model-storage'

type ModelSettingsModalProps = {
  models: Model[]
  isOpen: boolean
  onClose: () => void
  onAddModel: (model: Model) => void
  onRemoveModel: (model: Model) => void
}

export function ModelSettingsModal({
  models,
  isOpen,
  onClose,
  onAddModel,
  onRemoveModel,
}: ModelSettingsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const browserFileModeRef = useRef<'import' | 'fill'>('import')
  const browserFileFormRef = useRef<HTMLFormElement | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  if (!isOpen) {
    return null
  }

  function openBrowserFilePicker(
    mode: 'import' | 'fill',
    form: HTMLFormElement | null = null,
  ) {
    browserFileModeRef.current = mode
    browserFileFormRef.current = form
    fileInputRef.current?.click()
  }

  async function handleBrowserFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    const selection = await createSelectionFromBrowserFile(file)

    if (browserFileModeRef.current === 'fill' && browserFileFormRef.current) {
      fillFormFromSelection(browserFileFormRef.current, selection)
      setStatus('Arquivo selecionado pelo navegador.')
      return
    }

    onAddModel(createModelFromSelection(selection))
    setStatus(`Modelo "${selection.name}" importado.`)
  }

  function removeModel(model: Model) {
    onRemoveModel(model)
    setStatus(`Modelo "${model.name}" excluído.`)
  }

  async function importModelFile() {
    openBrowserFilePicker('import')
  }

  async function chooseModelFile(form: HTMLFormElement) {
    openBrowserFilePicker('fill', form)
  }

  function fillFormFromSelection(
    form: HTMLFormElement,
    selection: ModelFileSelection,
  ) {
    const commandInput = form.elements.namedItem('command')
    const nameInput = form.elements.namedItem('name')
    const sourceInput = form.elements.namedItem('source')

    if (commandInput instanceof HTMLInputElement) {
      commandInput.value = selection.command
    }

    if (nameInput instanceof HTMLInputElement && !nameInput.value.trim()) {
      nameInput.value = selection.name
    }

    if (sourceInput instanceof HTMLInputElement && !sourceInput.value.trim()) {
      sourceInput.value = selection.source
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const form = event.currentTarget
    const formData = new FormData(form)
    const rawName = String(formData.get('name') ?? '').trim()
    const source = String(formData.get('source') ?? '').trim()
    const command = String(formData.get('command') ?? '').trim()
    const name = rawName || inferModelName('', getFileNameFromCommand(command))

    if (!command) {
      setStatus('Informe ou escolha o arquivo do modelo.')
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
    })

    form.reset()
    setStatus(`Modelo "${name}" adicionado.`)
  }

  function createModelFromSelection(selection: ModelFileSelection): Model {
    return {
      id: createModelId(selection.name),
      ...selection,
    }
  }

  async function createSelectionFromBrowserFile(
    file: File,
  ): Promise<ModelFileSelection> {
    const content = await file.text().catch(() => '')
    const filePath = window.felixo?.getFilePath?.(file) ?? ''

    return {
      name: inferModelName(content, file.name),
      command: createCommandPath(file.name, filePath),
      source: 'CLI local',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
      <section className="w-full max-w-[520px] rounded-3xl border border-white/10 bg-[#242423] shadow-shell">
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
            onChange={handleBrowserFileChange}
          />

          <button
            type="button"
            onClick={importModelFile}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-zinc-100 text-sm font-medium text-zinc-950 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-100 focus:ring-offset-2 focus:ring-offset-[#242423]"
          >
            <Upload size={16} aria-hidden="true" />
            Importar arquivo
          </button>

          {status && (
            <p className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-zinc-400">
              {status}
            </p>
          )}

          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-300">
              <FilePlus size={14} aria-hidden="true" />
              Modelos importados
            </div>
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-2xl border border-white/[0.08] bg-black/15 p-2">
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
                    <div className="flex items-start justify-between gap-3">
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
                      </div>
                      <button
                        type="button"
                        title="Excluir modelo"
                        onClick={() => removeModel(model)}
                        className="flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11px] text-zinc-500 transition hover:bg-red-400/10 hover:text-red-200"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                        Excluir
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <form className="space-y-3" onSubmit={handleSubmit}>
            <label className="block text-xs text-zinc-400">
              Nome
              <input
                name="name"
                placeholder="Codex CLI"
                className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-violet-200/30"
              />
            </label>

            <label className="block text-xs text-zinc-400">
              Tipo
              <input
                name="source"
                placeholder="CLI local"
                className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-violet-200/30"
              />
            </label>

            <label className="block text-xs text-zinc-400">
              Arquivo do modelo
              <div className="mt-1 flex gap-2">
                <input
                  name="command"
                  placeholder="./ai-clis/codex.sh"
                  className="h-10 min-w-0 flex-1 rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 font-mono text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-violet-200/30"
                />
                <button
                  type="button"
                  title="Escolher arquivo"
                  onClick={(event) => chooseModelFile(event.currentTarget.form!)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100"
                >
                  <FolderOpen size={16} aria-hidden="true" />
                  <span className="sr-only">Escolher arquivo</span>
                </button>
              </div>
            </label>

            <button
              type="submit"
              className="flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-zinc-100 text-sm font-medium text-zinc-950 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-100 focus:ring-offset-2 focus:ring-offset-[#242423]"
            >
              <Plus size={16} aria-hidden="true" />
              Adicionar modelo
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}
