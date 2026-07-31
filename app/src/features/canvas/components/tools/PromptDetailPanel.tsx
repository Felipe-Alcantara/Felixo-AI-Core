import { useState } from 'react'
import { ArrowLeft, Check, RotateCcw, SendHorizontal } from 'lucide-react'
import type { AutomationDefinition, AutomationScope } from '../../../shared/types/automations'

type PromptDetailPanelProps = {
  prompt: AutomationDefinition
  /** True when this preset already has a saved override to fall back from. */
  canResetToPreset: boolean
  /** Back to the prompt list. Confirms first if there's an unsaved draft. */
  onBack: () => void
  /** Persists the full edited draft as an override. Only called on "Salvar". */
  onSave: (patch: Partial<AutomationDefinition>) => void
  /** Discards the override and restores the built-in preset text. */
  onReset: () => void
  onInsert: () => void
}

const SCOPES: AutomationScope[] = ['chat', 'code', 'docs', 'git', 'planning', 'security']

const SCOPE_LABELS: Record<AutomationScope, string> = {
  chat: 'Chat',
  code: 'Código',
  docs: 'Docs',
  git: 'Git',
  planning: 'Planejamento',
  security: 'Segurança',
}

/**
 * Full-text viewer/editor for a preset prompt, rendered inline inside
 * PromptsPanel (same CanvasPanel frame, swapped content) instead of a second
 * floating panel — a second absolutely-positioned panel didn't fit next to
 * the first one in narrow app windows and got clipped off-screen.
 *
 * Edits are held as a local draft, not autosaved — a stray keystroke or
 * accidental edit shouldn't silently overwrite a preset. "Salvar" pushes the
 * whole draft up through `onSave` at once; "Cancelar" reverts every field
 * back to `prompt` without persisting anything. Both only appear once the
 * draft actually differs from the saved prompt.
 */
export function PromptDetailPanel({
  prompt,
  canResetToPreset,
  onBack,
  onSave,
  onReset,
  onInsert,
}: PromptDetailPanelProps) {
  const [name, setName] = useState(prompt.name)
  const [description, setDescription] = useState(prompt.description)
  const [scope, setScope] = useState(prompt.scope)
  const [text, setText] = useState(prompt.prompt)
  const [justSaved, setJustSaved] = useState(false)

  const isDirty =
    name !== prompt.name ||
    description !== prompt.description ||
    scope !== prompt.scope ||
    text !== prompt.prompt

  const cancelDraft = () => {
    setName(prompt.name)
    setDescription(prompt.description)
    setScope(prompt.scope)
    setText(prompt.prompt)
  }

  const saveDraft = () => {
    onSave({ name, description, scope, prompt: text })
    setJustSaved(true)
    window.setTimeout(() => setJustSaved(false), 1500)
  }

  const back = () => {
    if (isDirty && !window.confirm('Descartar as edições não salvas deste prompt?')) {
      return
    }
    onBack()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <button
        type="button"
        onClick={back}
        className="-mt-1 flex items-center gap-1 self-start rounded px-1 py-0.5 text-xs text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
      >
        <ArrowLeft size={13} />
        Voltar à lista
      </button>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
        <label className="block text-xs text-zinc-500">
          Nome
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded bg-zinc-800/60 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-sky-500/50"
          />
        </label>

        <label className="block text-xs text-zinc-500">
          Descrição
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Descrição curta…"
            className="mt-1 w-full rounded bg-zinc-800/60 px-2 py-1.5 text-xs text-zinc-300 outline-none placeholder:text-zinc-600 focus:ring-1 focus:ring-sky-500/50"
          />
        </label>

        <label className="block text-xs text-zinc-500">
          Escopo
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as AutomationScope)}
            className="mt-1 w-full rounded bg-zinc-800/60 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-sky-500/50"
          >
            {SCOPES.map((option) => (
              <option key={option} value={option}>
                {SCOPE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-h-0 flex-1 flex-col text-xs text-zinc-500">
          Prompt completo
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={18}
            className="mt-1 min-h-[20rem] flex-1 resize-y rounded bg-zinc-800/60 p-2 font-mono text-xs leading-relaxed text-zinc-200 outline-none focus:ring-1 focus:ring-sky-500/50"
          />
        </label>

        <p className="text-xs leading-relaxed text-zinc-600">
          {isDirty
            ? 'Você tem edições não salvas. Clique em "Salvar" para guardar uma versão personalizada por cima do preset, ou "Cancelar" para descartar.'
            : 'Editar e salvar este prompt cria uma versão personalizada por cima do preset padrão. O preset original continua disponível — use "Restaurar padrão" para descartar suas edições salvas.'}
        </p>
      </div>

      {isDirty && (
        <div className="-mx-3 flex items-center justify-end gap-2 border-t border-white/10 bg-amber-500/[0.06] px-3 py-2">
          <button
            type="button"
            onClick={cancelDraft}
            className="rounded px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/10 hover:text-zinc-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={saveDraft}
            className="flex items-center gap-1 rounded bg-emerald-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-600"
          >
            <Check size={13} />
            Salvar
          </button>
        </div>
      )}

      <div className="-mx-3 -mb-3 flex items-center justify-between gap-2 border-t border-white/10 px-3 py-2">
        <button
          type="button"
          onClick={onReset}
          disabled={!canResetToPreset}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-400 hover:bg-white/10 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          title="Descartar edições salvas e voltar ao texto padrão do preset"
        >
          <RotateCcw size={13} />
          Restaurar padrão
        </button>
        <button
          type="button"
          onClick={onInsert}
          disabled={isDirty}
          title={
            isDirty
              ? 'Salve ou cancele as edições pendentes antes de inserir'
              : 'Inserir no terminal aberto (ou copiar, se nenhum estiver aberto)'
          }
          className="flex items-center gap-1 rounded bg-emerald-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-emerald-700"
        >
          {justSaved ? (
            <>
              <Check size={13} />
              Salvo
            </>
          ) : (
            <>
              <SendHorizontal size={13} />
              Inserir
            </>
          )}
        </button>
      </div>
    </div>
  )
}
