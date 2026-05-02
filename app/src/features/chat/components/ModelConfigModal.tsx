import { useState } from 'react'
import type { FormEvent } from 'react'
import { BrainCircuit, Save, X } from 'lucide-react'
import type { Model, ReasoningEffort } from '../types'

type ModelConfigModalProps = {
  isOpen: boolean
  model: Model
  onClose: () => void
  onUpdateModel: (model: Model) => void
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

export function ModelConfigModal({
  isOpen,
  model,
  onClose,
  onUpdateModel,
}: ModelConfigModalProps) {
  const [providerModel, setProviderModel] = useState(
    model.providerModel ?? '',
  )
  const [reasoningEffort, setReasoningEffort] = useState<'' | ReasoningEffort>(
    model.reasoningEffort ?? '',
  )

  if (!isOpen) {
    return null
  }

  const capabilities = getModelCapabilities(model)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    onUpdateModel({
      ...model,
      providerModel: providerModel.trim() || undefined,
      reasoningEffort: reasoningEffort || undefined,
    })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        className="flex max-h-[80vh] w-full max-w-[440px] flex-col rounded-3xl border border-white/10 bg-[var(--color-panel)] shadow-shell"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">
              {model.name}
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Configuração de execução do modelo.
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

        <form
          className="min-h-0 space-y-4 overflow-y-auto px-5 py-5"
          onSubmit={handleSubmit}
        >
          <div className="rounded-2xl border border-white/[0.06] bg-black/15 p-3 text-xs text-zinc-400">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-zinc-200">{model.name}</span>
              <span className="rounded-full border border-white/[0.08] px-2 py-0.5 font-mono text-[10px] text-zinc-500">
                {model.cliType}
              </span>
            </div>
            <code className="mt-1 block truncate font-mono text-[11px] text-zinc-500">
              {model.command}
            </code>
            <ul className="mt-2 space-y-1 leading-relaxed">
              {capabilities.map((capability) => (
                <li key={capability}>{capability}</li>
              ))}
            </ul>
          </div>

          <section className="space-y-3 rounded-2xl border border-white/[0.08] bg-black/10 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
              <BrainCircuit size={14} aria-hidden="true" />
              Execução
            </div>

            <label className="block text-xs text-zinc-400">
              Modelo do provedor
              <input
                placeholder="gpt-5.5"
                value={providerModel}
                onChange={(event) => setProviderModel(event.target.value)}
                className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[var(--color-input)] px-3 font-mono text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-cyan-200/30"
              />
            </label>

            <label className="block text-xs text-zinc-400">
              Effort
              <select
                value={reasoningEffort}
                onChange={(event) =>
                  setReasoningEffort(
                    event.target.value as '' | ReasoningEffort,
                  )
                }
                className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[var(--color-input)] px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-cyan-200/30"
              >
                {reasoningEffortOptions.map((option) => (
                  <option key={option.value || 'default'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <button
            type="submit"
            className="flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-zinc-100 text-sm font-medium text-zinc-950 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-100 focus:ring-offset-2 focus:ring-offset-[var(--color-panel)]"
          >
            <Save size={16} aria-hidden="true" />
            Salvar
          </button>
        </form>
      </section>
    </div>
  )
}

function getModelCapabilities(model: Model) {
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
