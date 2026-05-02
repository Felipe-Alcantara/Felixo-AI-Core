import { useState } from 'react'
import type { FormEvent } from 'react'
import { BrainCircuit, Save, X } from 'lucide-react'
import type { CliType, Model, ReasoningEffort } from '../types'

type ModelConfigModalProps = {
  isOpen: boolean
  model: Model
  onClose: () => void
  onUpdateModel: (model: Model) => void
}

type SelectOption = { value: string; label: string }

type ProviderModelSpec = {
  context: string
  costIn: string
  costOut: string
  bestFor: string
}

const providerModelSpecs: Record<string, ProviderModelSpec> = {
  sonnet: { context: '200k tokens', costIn: 'US$ 3.00/1M', costOut: 'US$ 15.00/1M', bestFor: 'Código, revisão, escrita' },
  opus: { context: '200k tokens', costIn: 'US$ 15.00/1M', costOut: 'US$ 75.00/1M', bestFor: 'Tarefas complexas, raciocínio profundo' },
  haiku: { context: '200k tokens', costIn: 'US$ 0.80/1M', costOut: 'US$ 4.00/1M', bestFor: 'Respostas rápidas, classificação' },
  'gpt-5.5': { context: '~270k tokens', costIn: 'US$ 2.00/1M', costOut: 'US$ 10.00/1M', bestFor: 'Código avançado, agentes' },
  'gpt-5.4': { context: '~270k tokens', costIn: 'US$ 2.50/1M', costOut: 'US$ 10.00/1M', bestFor: 'Código, revisão, raciocínio' },
  'gpt-5.4-mini': { context: '~270k tokens', costIn: 'US$ 0.75/1M', costOut: 'US$ 4.50/1M', bestFor: 'Subagentes de código com custo menor' },
  'gpt-5.3-codex': { context: '~200k tokens', costIn: 'US$ 1.50/1M', costOut: 'US$ 6.00/1M', bestFor: 'Código, edição de arquivos' },
  'gpt-5.2': { context: '~128k tokens', costIn: 'US$ 1.25/1M', costOut: 'US$ 5.00/1M', bestFor: 'Uso geral, custo moderado' },
  'gemini-3-flash-preview': { context: '1M tokens', costIn: 'US$ 0.30/1M', costOut: 'US$ 2.50/1M', bestFor: 'Contexto longo, automações' },
  'gemini-3.1-flash-lite-preview': { context: '1M tokens', costIn: 'US$ 0.10/1M', costOut: 'US$ 0.40/1M', bestFor: 'Classificação, resumo barato' },
  'gemini-2.5-flash': { context: '1M tokens', costIn: 'US$ 0.30/1M', costOut: 'US$ 2.50/1M', bestFor: 'Contexto longo, resumo' },
  'gemini-2.5-flash-lite': { context: '1M tokens', costIn: 'US$ 0.10/1M', costOut: 'US$ 0.40/1M', bestFor: 'Tarefas pequenas, muito barato' },
}

const providerModelOptionsByCliType: Partial<Record<CliType, SelectOption[]>> = {
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

const reasoningEffortOptionsByCliType: Partial<Record<CliType, SelectOption[]>> = {
  claude: [
    { value: '', label: 'Padrão' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'max', label: 'Max' },
  ],
  codex: [
    { value: '', label: 'Padrão' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'xhigh', label: 'XHigh' },
  ],
  'codex-app-server': [
    { value: '', label: 'Padrão' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'xhigh', label: 'XHigh' },
  ],
}

const defaultEffortOptions: SelectOption[] = [{ value: '', label: 'Padrão' }]

export function ModelConfigModal({
  isOpen,
  model,
  onClose,
  onUpdateModel,
}: ModelConfigModalProps) {
  const [providerModel, setProviderModel] = useState(model.providerModel ?? '')
  const [reasoningEffort, setReasoningEffort] = useState<'' | ReasoningEffort>(
    model.reasoningEffort ?? '',
  )

  if (!isOpen) {
    return null
  }

  const capabilities = getModelCapabilities(model)
  const providerOptions = getProviderModelOptions(model)
  const effortOptions = reasoningEffortOptionsByCliType[model.cliType] ?? defaultEffortOptions
  const selectedSpec = providerModel ? providerModelSpecs[providerModel] ?? null : null

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    onUpdateModel({
      ...model,
      providerModel: providerModel || undefined,
      reasoningEffort: (reasoningEffort as ReasoningEffort) || undefined,
    })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        className="flex max-h-[80vh] w-full max-w-[400px] flex-col rounded-3xl border border-white/10 bg-[var(--color-panel)] shadow-shell"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">
              {model.name}
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Detalhes e execução do modelo.
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

            {providerOptions.length > 1 && (
              <label className="block text-xs text-zinc-400">
                Modelo do provedor
                <select
                  value={providerModel}
                  onChange={(event) => setProviderModel(event.target.value)}
                  className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[var(--color-input)] px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-cyan-200/30"
                >
                  {providerOptions.map((option) => (
                    <option key={option.value || 'default'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {selectedSpec && (
              <div className="grid grid-cols-2 gap-2">
                <SpecCard label="Contexto" value={selectedSpec.context} />
                <SpecCard label="Entrada" value={selectedSpec.costIn} />
                <SpecCard label="Saída" value={selectedSpec.costOut} />
                <SpecCard label="Indicado para" value={selectedSpec.bestFor} />
              </div>
            )}

            {effortOptions.length > 1 && (
              <label className="block text-xs text-zinc-400">
                Effort
                <select
                  value={reasoningEffort}
                  onChange={(event) =>
                    setReasoningEffort(event.target.value as '' | ReasoningEffort)
                  }
                  className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[var(--color-input)] px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-cyan-200/30"
                >
                  {effortOptions.map((option) => (
                    <option key={option.value || 'default'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
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

function SpecCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/15 px-3 py-2">
      <span className="block text-[10px] uppercase text-zinc-600">{label}</span>
      <span className="mt-0.5 block text-[11px] text-zinc-200">{value}</span>
    </div>
  )
}

function getProviderModelOptions(model: Model): SelectOption[] {
  const options: SelectOption[] = [
    { value: '', label: 'Padrão' },
    ...(providerModelOptionsByCliType[model.cliType] ?? []),
  ]

  const current = model.providerModel ?? ''

  if (current && !options.some((o) => o.value === current)) {
    options.push({ value: current, label: current })
  }

  return options
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
