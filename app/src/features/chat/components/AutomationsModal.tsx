import { useState } from 'react'
import type { FormEvent } from 'react'
import { Play, Plus, Sparkles, Trash2, X } from 'lucide-react'
import type { AutomationDefinition, AutomationScope } from '../types'

type AutomationDraft = Pick<
  AutomationDefinition,
  'description' | 'name' | 'prompt' | 'scope'
>

type AutomationsModalProps = {
  isOpen: boolean
  automations: AutomationDefinition[]
  customAutomations: AutomationDefinition[]
  onClose: () => void
  onApplyAutomation: (automation: AutomationDefinition) => void
  onAddAutomation: (automation: AutomationDraft) => void
  onRemoveAutomation: (automationId: string) => void
}

const scopeOptions: Array<{ value: AutomationScope; label: string }> = [
  { value: 'planning', label: 'Planejamento' },
  { value: 'code', label: 'Código' },
  { value: 'docs', label: 'Docs' },
  { value: 'git', label: 'Git' },
  { value: 'chat', label: 'Chat' },
]

export function AutomationsModal({
  isOpen,
  automations,
  customAutomations,
  onClose,
  onApplyAutomation,
  onAddAutomation,
  onRemoveAutomation,
}: AutomationsModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [prompt, setPrompt] = useState('')
  const [scope, setScope] = useState<AutomationScope>('planning')

  if (!isOpen) {
    return null
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextName = name.trim()
    const nextPrompt = prompt.trim()

    if (!nextName || !nextPrompt) {
      return
    }

    onAddAutomation({
      name: nextName,
      description: description.trim() || 'Automação personalizada.',
      prompt: nextPrompt,
      scope,
    })
    setName('')
    setDescription('')
    setPrompt('')
    setScope('planning')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        className="flex max-h-[86vh] w-full max-w-[860px] flex-col rounded-3xl border border-white/10 bg-[#242423] shadow-shell"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">
              Automações
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Prompts operacionais prontos e modelos personalizados.
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

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px] gap-4 overflow-y-auto px-5 py-5 max-md:grid-cols-1">
          <div className="space-y-3">
            {automations.map((automation) => (
              <article
                key={automation.id}
                className="rounded-2xl border border-white/[0.08] bg-black/10 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Sparkles
                        size={14}
                        aria-hidden="true"
                        className="shrink-0 text-violet-300"
                      />
                      <h3 className="truncate text-sm font-medium text-zinc-100">
                        {automation.name}
                      </h3>
                      <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[10px] text-zinc-500">
                        {formatScope(automation.scope)}
                      </span>
                      {automation.isDefault && (
                        <span className="rounded-full border border-theme-success/20 bg-theme-success/10 px-2 py-0.5 text-[10px] text-theme-success">
                          Padrão
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                      {automation.description}
                    </p>
                    <p className="mt-2 line-clamp-2 font-mono text-[11px] leading-relaxed text-zinc-400">
                      {automation.prompt}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {!automation.isDefault && (
                      <button
                        type="button"
                        title="Remover automação"
                        onClick={() => onRemoveAutomation(automation.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-theme-error/10 hover:text-theme-error"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                        <span className="sr-only">Remover automação</span>
                      </button>
                    )}
                    <button
                      type="button"
                      title="Usar automação"
                      onClick={() => onApplyAutomation(automation)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] text-zinc-200 transition hover:bg-white/[0.08]"
                    >
                      <Play size={14} aria-hidden="true" />
                      <span className="sr-only">Usar automação</span>
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <form
            className="space-y-3 rounded-2xl border border-white/[0.08] bg-black/10 p-3"
            onSubmit={handleSubmit}
          >
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
              <Plus size={14} aria-hidden="true" />
              Nova automação
            </div>

            <label className="block text-xs text-zinc-400">
              Nome
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Revisar release"
                className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-violet-200/30"
              />
            </label>

            <label className="block text-xs text-zinc-400">
              Descrição
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Quando usar este fluxo"
                className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-violet-200/30"
              />
            </label>

            <label className="block text-xs text-zinc-400">
              Escopo
              <select
                value={scope}
                onChange={(event) => setScope(event.target.value as AutomationScope)}
                className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-violet-200/30"
              >
                {scopeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-zinc-400">
              Prompt
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Instrucao base da automacao"
                rows={5}
                className="mt-1 min-h-28 w-full resize-none rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-violet-200/30"
              />
            </label>

            <button
              type="submit"
              disabled={!name.trim() || !prompt.trim()}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-zinc-100 text-sm font-medium text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"
            >
              <Plus size={16} aria-hidden="true" />
              Criar automação
            </button>

            <p className="text-[11px] leading-relaxed text-zinc-600">
              Personalizadas salvas: {customAutomations.length}
            </p>
          </form>
        </div>
      </section>
    </div>
  )
}

function formatScope(scope: AutomationScope) {
  const labels: Record<AutomationScope, string> = {
    chat: 'Chat',
    code: 'Código',
    docs: 'Docs',
    git: 'Git',
    planning: 'Plano',
  }

  return labels[scope]
}
