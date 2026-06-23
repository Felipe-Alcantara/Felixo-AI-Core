import { useEffect, useState } from 'react'
import { BrainCircuit, Check, Pencil, Plus, Trash2, Zap } from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'
import type { CanvasSkill } from '../../types'

/** Result of activating a skill, so the panel can show the right feedback. */
export type SkillActivationResult = 'sent' | 'copied'

type SkillsPanelProps = {
  /** Sends the skill to the expanded terminal, or copies it as a fallback. */
  onActivateSkill: (skill: CanvasSkill) => Promise<SkillActivationResult>
  onClose: () => void
}

const emptyDraft = { name: '', description: '', path: '' }

/**
 * Canvas skill library. A skill is a named pointer to a file; activating it
 * tells a connected agent where the skill lives so it reads and applies it.
 * Skills persist via the canvas settings bridge (canvas:get/set-skills).
 */
export function SkillsPanel({ onActivateSkill, onClose }: SkillsPanelProps) {
  const [skills, setSkills] = useState<CanvasSkill[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [feedbackId, setFeedbackId] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState('')

  useEffect(() => {
    let cancelled = false
    void window.felixo?.canvas?.getSkills?.().then((result) => {
      if (!cancelled && result?.ok && Array.isArray(result.skills)) {
        setSkills(result.skills)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const persist = async (next: CanvasSkill[]) => {
    setSkills(next)
    await window.felixo?.canvas?.setSkills?.(next)
  }

  const startNew = () => {
    setEditingId('new')
    setDraft(emptyDraft)
  }

  const startEdit = (skill: CanvasSkill) => {
    setEditingId(skill.id)
    setDraft({ name: skill.name, description: skill.description, path: skill.path })
  }

  const saveDraft = async () => {
    const name = draft.name.trim()
    const path = draft.path.trim()
    if (!name || !path) {
      return
    }
    const description = draft.description.trim()
    if (editingId === 'new') {
      const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
      await persist([...skills, { id, name, description, path }])
    } else {
      await persist(
        skills.map((skill) =>
          skill.id === editingId ? { ...skill, name, description, path } : skill,
        ),
      )
    }
    setEditingId(null)
    setDraft(emptyDraft)
  }

  const removeSkill = async (id: string) => {
    await persist(skills.filter((skill) => skill.id !== id))
  }

  const activate = async (skill: CanvasSkill) => {
    const result = await onActivateSkill(skill)
    setFeedbackId(skill.id)
    setFeedbackText(
      result === 'sent'
        ? 'Enviada ao terminal aberto.'
        : 'Sem terminal aberto — copiada para a área de transferência.',
    )
    window.setTimeout(() => setFeedbackId((id) => (id === skill.id ? null : id)), 2500)
  }

  return (
    <CanvasPanel title="Skills" icon={<BrainCircuit size={15} />} onClose={onClose}>
      <button
        type="button"
        onClick={startNew}
        className="mb-3 flex items-center gap-1 rounded bg-sky-700/50 px-2 py-1 text-sm text-sky-50 hover:bg-sky-600/60"
      >
        <Plus size={14} />
        Nova skill
      </button>

      {editingId && (
        <div className="mb-3 flex flex-col gap-2 rounded border border-white/10 bg-black/30 p-2">
          <input
            autoFocus
            value={draft.name}
            onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
            placeholder="Nome"
            className="rounded border border-white/10 bg-black/30 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-sky-500/50"
          />
          <input
            value={draft.path}
            onChange={(event) => setDraft((d) => ({ ...d, path: event.target.value }))}
            placeholder="Caminho do arquivo da skill"
            className="rounded border border-white/10 bg-black/30 px-2 py-1 font-mono text-xs text-zinc-100 outline-none focus:border-sky-500/50"
          />
          <textarea
            value={draft.description}
            onChange={(event) =>
              setDraft((d) => ({ ...d, description: event.target.value }))
            }
            placeholder="Descrição (opcional)"
            rows={2}
            className="resize-none rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-sky-500/50"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={!draft.name.trim() || !draft.path.trim()}
              className="rounded bg-sky-700/60 px-2 py-1 text-xs text-sky-50 hover:bg-sky-600/70 disabled:opacity-50"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingId(null)
                setDraft(emptyDraft)
              }}
              className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-white/10"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {skills.length === 0 && !editingId && (
        <p className="text-sm text-zinc-500">
          Nenhuma skill ainda. Crie uma apontando o caminho de um arquivo para o
          agente usar.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {skills.map((skill) => (
          <li key={skill.id} className="rounded bg-zinc-800/60 p-2">
            <div className="mb-1 flex items-center gap-1">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
                {skill.name}
              </span>
              <button
                type="button"
                onClick={() => void activate(skill)}
                className="flex items-center gap-1 rounded bg-emerald-700/40 px-1.5 py-0.5 text-xs text-emerald-100 hover:bg-emerald-600/50"
                title="Ativar: enviar ao terminal aberto (ou copiar)"
              >
                <Zap size={12} />
                Ativar
              </button>
              <button
                type="button"
                onClick={() => startEdit(skill)}
                className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                title="Editar"
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                onClick={() => void removeSkill(skill.id)}
                className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-red-300"
                title="Remover"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <p className="truncate font-mono text-[11px] text-zinc-500" title={skill.path}>
              {skill.path}
            </p>
            {skill.description && (
              <p className="mt-0.5 text-xs text-zinc-500">{skill.description}</p>
            )}
            {feedbackId === skill.id && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-300">
                <Check size={11} />
                {feedbackText}
              </p>
            )}
          </li>
        ))}
      </ul>
    </CanvasPanel>
  )
}
