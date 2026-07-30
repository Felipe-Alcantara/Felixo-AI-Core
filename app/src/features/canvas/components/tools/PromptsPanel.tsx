import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, Plus, Sparkles, Trash2 } from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'
import { defaultAutomations } from '../../../shared/data/automations'
import type { AutomationDefinition, AutomationScope } from '../../../shared/types/automations'

type PromptsPanelProps = {
  onClose: () => void
}

const SAVE_DEBOUNCE_MS = 500

const SCOPES: AutomationScope[] = ['chat', 'code', 'docs', 'git', 'planning']

function createAutomationId() {
  return `automation-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`
}

/**
 * Canvas-side prompt library — the chat's pre-built prompts (automations),
 * default + custom. On the canvas there's no chat to "apply" to, so each prompt
 * is copied to the clipboard for you to paste into a terminal/agent.
 * Custom automations can be created, edited (debounced autosave) and removed
 * here directly via IPC; default automations are read-only.
 */
export function PromptsPanel({ onClose }: PromptsPanelProps) {
  const [custom, setCustom] = useState<AutomationDefinition[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const saveTimers = useRef(new Map<string, number>())

  useEffect(() => {
    let cancelled = false
    void window.felixo?.automations?.list().then((result) => {
      if (!cancelled && result?.ok && Array.isArray(result.automations)) {
        setCustom(result.automations)
      }
    })
    const timers = saveTimers.current
    return () => {
      cancelled = true
      timers.forEach((timer) => window.clearTimeout(timer))
      timers.clear()
    }
  }, [])

  const prompts = [...defaultAutomations, ...custom]

  const copyPrompt = async (prompt: AutomationDefinition) => {
    try {
      await navigator.clipboard?.writeText(prompt.prompt)
      setCopiedId(prompt.id)
      window.setTimeout(() => setCopiedId((id) => (id === prompt.id ? null : id)), 1500)
    } catch {
      setCopiedId(null)
    }
  }

  const persistAutomation = useCallback((automation: AutomationDefinition) => {
    void window.felixo?.automations?.save({
      ...automation,
      updatedAt: new Date().toISOString(),
    })
  }, [])

  const editCustomAutomation = useCallback(
    (automationId: string, patch: Partial<AutomationDefinition>) => {
      setCustom((current) => {
        const next = current.map((automation) =>
          automation.id === automationId ? { ...automation, ...patch } : automation,
        )
        const edited = next.find((automation) => automation.id === automationId)
        if (edited) {
          const pending = saveTimers.current.get(automationId)
          if (pending) {
            window.clearTimeout(pending)
          }
          saveTimers.current.set(
            automationId,
            window.setTimeout(() => {
              saveTimers.current.delete(automationId)
              persistAutomation(edited)
            }, SAVE_DEBOUNCE_MS),
          )
        }
        return next
      })
    },
    [persistAutomation],
  )

  const addCustomAutomation = useCallback(async () => {
    const now = new Date().toISOString()
    const automation: AutomationDefinition = {
      id: createAutomationId(),
      name: 'Novo prompt',
      description: '',
      prompt: '',
      scope: 'chat',
      createdAt: now,
      updatedAt: now,
    }
    await window.felixo?.automations?.save(automation)
    setCustom((current) => [...current, automation])
  }, [])

  const removeCustomAutomation = useCallback(async (automationId: string) => {
    const pending = saveTimers.current.get(automationId)
    if (pending) {
      window.clearTimeout(pending)
      saveTimers.current.delete(automationId)
    }
    await window.felixo?.automations?.delete(automationId)
    setCustom((current) => current.filter((automation) => automation.id !== automationId))
  }, [])

  return (
    <CanvasPanel title="Prompts" icon={<Sparkles size={15} />} onClose={onClose}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Prontos
        </span>
        <button
          type="button"
          onClick={() => void addCustomAutomation()}
          className="flex items-center gap-1 rounded bg-emerald-700 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-600"
        >
          <Plus size={13} />
          Novo prompt
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {prompts.map((prompt) => {
          const isCustom = !prompt.isDefault

          return (
            <li key={prompt.id} className="rounded bg-zinc-800/60 p-2">
              <div className="mb-1 flex items-center gap-2">
                {isCustom ? (
                  <input
                    value={prompt.name}
                    onChange={(event) =>
                      editCustomAutomation(prompt.id, { name: event.target.value })
                    }
                    placeholder="Nome do prompt"
                    className="min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-100 outline-none"
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
                    {prompt.name}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void copyPrompt(prompt)}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-zinc-300 hover:bg-white/10"
                  title="Copiar prompt"
                >
                  {copiedId === prompt.id ? (
                    <>
                      <Check size={13} className="text-emerald-400" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy size={13} />
                      Copiar
                    </>
                  )}
                </button>
                {isCustom && (
                  <button
                    type="button"
                    onClick={() => void removeCustomAutomation(prompt.id)}
                    className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-red-400"
                    aria-label="Remover prompt"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {isCustom ? (
                <>
                  <input
                    value={prompt.description}
                    onChange={(event) =>
                      editCustomAutomation(prompt.id, { description: event.target.value })
                    }
                    placeholder="Descrição curta…"
                    className="mb-1 w-full bg-transparent text-xs text-zinc-500 outline-none placeholder:text-zinc-600"
                  />
                  <textarea
                    value={prompt.prompt}
                    onChange={(event) =>
                      editCustomAutomation(prompt.id, { prompt: event.target.value })
                    }
                    placeholder="Texto do prompt…"
                    rows={2}
                    className="mb-1 w-full resize-y rounded bg-zinc-900/60 p-2 text-xs text-zinc-300 outline-none placeholder:text-zinc-600"
                  />
                  <select
                    value={prompt.scope}
                    onChange={(event) =>
                      editCustomAutomation(prompt.id, {
                        scope: event.target.value as AutomationScope,
                      })
                    }
                    className="rounded bg-zinc-900/60 px-1.5 py-1 text-xs text-zinc-300 outline-none"
                  >
                    {SCOPES.map((scope) => (
                      <option key={scope} value={scope}>
                        {scope}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                prompt.description && (
                  <p className="text-xs text-zinc-500">{prompt.description}</p>
                )
              )}
            </li>
          )
        })}
      </ul>
    </CanvasPanel>
  )
}
