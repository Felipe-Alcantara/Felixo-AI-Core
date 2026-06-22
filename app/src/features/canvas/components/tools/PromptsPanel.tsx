import { useEffect, useState } from 'react'
import { Check, Copy, Sparkles } from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'
import { defaultAutomations } from '../../../shared/data/automations'
import type { AutomationDefinition } from '../../../shared/types/automations'

type PromptsPanelProps = {
  onClose: () => void
}

/**
 * Canvas-side prompt library — the chat's pre-built prompts (automations),
 * default + custom. On the canvas there's no chat to "apply" to, so each prompt
 * is copied to the clipboard for you to paste into a terminal/agent.
 */
export function PromptsPanel({ onClose }: PromptsPanelProps) {
  const [custom, setCustom] = useState<AutomationDefinition[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.felixo?.automations?.list().then((result) => {
      if (!cancelled && result?.ok && Array.isArray(result.automations)) {
        setCustom(result.automations)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const prompts = [...defaultAutomations, ...custom]

  const copyPrompt = async (prompt: AutomationDefinition) => {
    await navigator.clipboard?.writeText(prompt.prompt)
    setCopiedId(prompt.id)
    window.setTimeout(() => setCopiedId((id) => (id === prompt.id ? null : id)), 1500)
  }

  return (
    <CanvasPanel title="Prompts" icon={<Sparkles size={15} />} onClose={onClose}>
      <ul className="flex flex-col gap-2">
        {prompts.map((prompt) => (
          <li key={prompt.id} className="rounded bg-zinc-800/60 p-2">
            <div className="mb-1 flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
                {prompt.name}
              </span>
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
            </div>
            {prompt.description && (
              <p className="text-xs text-zinc-500">{prompt.description}</p>
            )}
          </li>
        ))}
      </ul>
    </CanvasPanel>
  )
}
