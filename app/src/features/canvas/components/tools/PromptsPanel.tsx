import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Eye, Plus, SendHorizontal, Sparkles, Trash2 } from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'
import { PromptDetailPanel } from './PromptDetailPanel'
import { defaultAutomations } from '../../../shared/data/automations'
import {
  buildOverridesById,
  buildPresetIds,
  resolveVisiblePrompts,
  upsertPresetOverride,
} from '../../services/prompt-overrides'
import type { AutomationDefinition, AutomationScope } from '../../../shared/types/automations'
import type { SkillActivationResult } from './SkillsPanel'

type PromptsPanelProps = {
  onClose: () => void
  /** Sends the prompt to the expanded terminal, or copies it as a fallback. */
  onInsertPrompt: (prompt: string) => Promise<SkillActivationResult>
}

const SAVE_DEBOUNCE_MS = 500

const SCOPES: AutomationScope[] = ['chat', 'code', 'docs', 'git', 'planning', 'security']

function createAutomationId() {
  return `automation-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`
}

/**
 * Canvas-side prompt library — the chat's pre-built prompts (automations),
 * default + custom. Each prompt is inserted directly into the expanded
 * terminal's agent if one is open; otherwise it falls back to the clipboard
 * for manual pasting, same behavior as SkillsPanel's "Ativar".
 *
 * Custom automations can be created, edited (debounced autosave) and removed
 * here directly via IPC. Default (preset) automations are read-only in this
 * list, but clicking "Ver" swaps the list for PromptDetailPanel (same
 * CanvasPanel frame) where the prompt text can be viewed and edited —
 * editing a preset persists an override under the same id, so it replaces
 * the built-in text everywhere it's read from without losing the ability to
 * fall back to a fresh preset later (the built-in definition in
 * defaultAutomations never changes).
 */
export function PromptsPanel({ onClose, onInsertPrompt }: PromptsPanelProps) {
  const [custom, setCustom] = useState<AutomationDefinition[]>([])
  const [feedbackId, setFeedbackId] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
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

  // `isPreset` (via presetIds) tracks a prompt's built-in origin regardless
  // of whether it's been overridden, so the list still routes it through the
  // detail-panel edit flow instead of the free-form custom-automation inputs.
  const presetIds = buildPresetIds(defaultAutomations)
  const overridesById = buildOverridesById(custom)
  const prompts = resolveVisiblePrompts(defaultAutomations, custom)
  const detailPrompt = detailId ? prompts.find((prompt) => prompt.id === detailId) ?? null : null
  const detailPresetFallback = detailId
    ? defaultAutomations.find((preset) => preset.id === detailId) ?? null
    : null

  const insertPrompt = async (prompt: AutomationDefinition) => {
    const result = await onInsertPrompt(prompt.prompt)
    setFeedbackId(prompt.id)
    setFeedbackText(
      result === 'sent'
        ? 'Inserido no terminal aberto.'
        : 'Sem terminal aberto — copiado para a área de transferência.',
    )
    window.setTimeout(() => setFeedbackId((id) => (id === prompt.id ? null : id)), 2500)
  }

  const persistAutomation = useCallback((automation: AutomationDefinition) => {
    void window.felixo?.automations?.save({
      ...automation,
      updatedAt: new Date().toISOString(),
    })
  }, [])

  const schedulePersist = useCallback(
    (automationId: string, automation: AutomationDefinition) => {
      const pending = saveTimers.current.get(automationId)
      if (pending) {
        window.clearTimeout(pending)
      }
      saveTimers.current.set(
        automationId,
        window.setTimeout(() => {
          saveTimers.current.delete(automationId)
          persistAutomation(automation)
        }, SAVE_DEBOUNCE_MS),
      )
    },
    [persistAutomation],
  )

  const editCustomAutomation = useCallback(
    (automationId: string, patch: Partial<AutomationDefinition>) => {
      setCustom((current) => {
        const next = current.map((automation) =>
          automation.id === automationId ? { ...automation, ...patch } : automation,
        )
        const edited = next.find((automation) => automation.id === automationId)
        if (edited) {
          schedulePersist(automationId, edited)
        }
        return next
      })
    },
    [schedulePersist],
  )

  // Editing a preset (default automation) upserts it into `custom` under the
  // same id, so it overrides the built-in text without mutating
  // defaultAutomations. See prompt-overrides.ts for the merge/upsert rules.
  const editPreset = useCallback(
    (preset: AutomationDefinition, patch: Partial<AutomationDefinition>) => {
      setCustom((current) => {
        const next = upsertPresetOverride(current, preset, patch)
        const edited = next.find((automation) => automation.id === preset.id)
        if (edited) {
          schedulePersist(preset.id, edited)
        }
        return next
      })
    },
    [schedulePersist],
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

  if (detailPrompt) {
    return (
      <CanvasPanel
        title={detailPrompt.name}
        icon={<Sparkles size={15} />}
        onClose={onClose}
        widthClassName="w-[36rem]"
      >
        <PromptDetailPanel
          key={`${detailPrompt.id}:${overridesById.has(detailPrompt.id) ? 'override' : 'preset'}`}
          prompt={detailPrompt}
          canResetToPreset={Boolean(detailPresetFallback) && overridesById.has(detailPrompt.id)}
          onBack={() => setDetailId(null)}
          onSave={(patch) => editPreset(detailPrompt, patch)}
          onReset={() => {
            if (detailPresetFallback) {
              void removeCustomAutomation(detailPrompt.id)
            }
          }}
          onInsert={() => void insertPrompt(detailPrompt)}
        />
      </CanvasPanel>
    )
  }

  return (
    <CanvasPanel
      title="Prompts"
      icon={<Sparkles size={15} />}
      onClose={onClose}
      widthClassName="w-[26rem]"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Prontos
        </span>
        <button
          type="button"
          onClick={() => void addCustomAutomation()}
          className="felixo-btn flex items-center gap-1 rounded bg-emerald-700 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-600"
        >
          <Plus size={13} />
          Novo prompt
        </button>
      </div>

      <ul className="felixo-anim-stagger-list flex flex-col gap-2">
        {prompts.map((prompt) => {
          const isPreset = presetIds.has(prompt.id)
          const isOverridden = isPreset && overridesById.has(prompt.id)
          const isFreeCustom = !isPreset

          return (
            <li key={prompt.id} className="rounded bg-zinc-800/60 p-2">
              <div className="mb-1 flex items-center gap-2">
                {isFreeCustom ? (
                  <input
                    value={prompt.name}
                    onChange={(event) =>
                      editCustomAutomation(prompt.id, { name: event.target.value })
                    }
                    placeholder="Nome do prompt"
                    className="min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-100 outline-none"
                  />
                ) : (
                  <span className="min-w-0 flex-1 break-words text-sm font-medium text-zinc-100">
                    {prompt.name}
                    {isOverridden && (
                      <span className="ml-1.5 rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] font-normal text-zinc-500">
                        editado
                      </span>
                    )}
                  </span>
                )}
                {isPreset && (
                  <button
                    type="button"
                    onClick={() => setDetailId(prompt.id)}
                    className="felixo-btn flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-zinc-300 hover:bg-white/10"
                    title="Ver e editar o texto completo do prompt"
                  >
                    <Eye size={13} />
                    Ver
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void insertPrompt(prompt)}
                  className="felixo-btn flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-zinc-300 hover:bg-white/10"
                  title="Inserir no terminal aberto (ou copiar, se nenhum estiver aberto)"
                >
                  {feedbackId === prompt.id ? (
                    <>
                      <Check size={13} className="text-emerald-400" />
                      Feito
                    </>
                  ) : (
                    <>
                      <SendHorizontal size={13} />
                      Inserir
                    </>
                  )}
                </button>
                {isFreeCustom && (
                  <button
                    type="button"
                    onClick={() => void removeCustomAutomation(prompt.id)}
                    className="felixo-btn-icon rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-red-400"
                    aria-label="Remover prompt"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {isFreeCustom ? (
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

              {feedbackId === prompt.id && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-300">
                  <Check size={11} />
                  {feedbackText}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </CanvasPanel>
  )
}
