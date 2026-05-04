import { useState } from 'react'
import type { FormEvent } from 'react'
import { BrainCircuit, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import type { SkillPrompt } from '../types'

type SkillsModalProps = {
  isOpen: boolean
  skills: SkillPrompt[]
  onClose: () => void
  onSaveSkills: (skills: SkillPrompt[]) => void
}

export function SkillsModal({
  isOpen,
  skills,
  onClose,
  onSaveSkills,
}: SkillsModalProps) {
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [prompt, setPrompt] = useState('')

  if (!isOpen) {
    return null
  }

  const editingSkill = editingSkillId
    ? skills.find((skill) => skill.id === editingSkillId)
    : null

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextName = name.trim()
    const nextPrompt = prompt.trim()

    if (!nextName || !nextPrompt) {
      return
    }

    const now = new Date().toISOString()

    if (editingSkill) {
      onSaveSkills(
        skills.map((skill) =>
          skill.id === editingSkill.id
            ? {
                ...skill,
                name: nextName,
                description: description.trim(),
                prompt: nextPrompt,
                updatedAt: now,
              }
            : skill,
        ),
      )
    } else {
      onSaveSkills([
        {
          id: createSkillId(nextName),
          name: nextName,
          description: description.trim(),
          prompt: nextPrompt,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        },
        ...skills,
      ])
    }

    clearDraft()
  }

  function editSkill(skill: SkillPrompt) {
    setEditingSkillId(skill.id)
    setName(skill.name)
    setDescription(skill.description)
    setPrompt(skill.prompt)
  }

  function clearDraft() {
    setEditingSkillId(null)
    setName('')
    setDescription('')
    setPrompt('')
  }

  function toggleSkill(skillId: string) {
    const now = new Date().toISOString()
    onSaveSkills(
      skills.map((skill) =>
        skill.id === skillId
          ? { ...skill, enabled: !skill.enabled, updatedAt: now }
          : skill,
      ),
    )
  }

  function removeSkill(skillId: string) {
    onSaveSkills(skills.filter((skill) => skill.id !== skillId))
    if (editingSkillId === skillId) {
      clearDraft()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        className="flex max-h-[86vh] w-full max-w-[900px] flex-col rounded-3xl border border-white/10 bg-[var(--color-panel)] shadow-shell"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Skills</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Superprompts persistentes para ferramentas, plataformas e estilos.
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

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] gap-4 overflow-y-auto px-5 py-5 max-md:grid-cols-1">
          <div className="space-y-3">
            {skills.length === 0 ? (
              <p className="rounded-2xl border border-white/[0.08] bg-black/10 px-3 py-6 text-center text-sm text-zinc-500">
                Nenhuma skill cadastrada.
              </p>
            ) : (
              skills.map((skill) => (
                <article
                  key={skill.id}
                  className="rounded-2xl border border-white/[0.08] bg-black/10 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <BrainCircuit
                          size={14}
                          aria-hidden="true"
                          className="shrink-0 text-cyan-200"
                        />
                        <h3 className="truncate text-sm font-medium text-zinc-100">
                          {skill.name}
                        </h3>
                        <span
                          className={[
                            'rounded-full border px-2 py-0.5 text-[10px]',
                            skill.enabled
                              ? 'border-theme-success/20 bg-theme-success/10 text-theme-success'
                              : 'border-zinc-500/20 bg-zinc-500/10 text-zinc-500',
                          ].join(' ')}
                        >
                          {skill.enabled ? 'Ativa' : 'Inativa'}
                        </span>
                      </div>
                      {skill.description && (
                        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                          {skill.description}
                        </p>
                      )}
                      <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-xl bg-black/20 p-2 font-mono text-[11px] leading-relaxed text-zinc-400">
                        {skill.prompt}
                      </pre>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <label
                        title={skill.enabled ? 'Desativar' : 'Ativar'}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/[0.08] hover:text-zinc-100"
                      >
                        <input
                          type="checkbox"
                          checked={skill.enabled}
                          onChange={() => toggleSkill(skill.id)}
                          className="h-4 w-4 accent-cyan-300"
                        />
                        <span className="sr-only">
                          {skill.enabled ? 'Desativar' : 'Ativar'} {skill.name}
                        </span>
                      </label>
                      <button
                        type="button"
                        title="Editar skill"
                        onClick={() => editSkill(skill)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/[0.08] hover:text-zinc-100"
                      >
                        <Pencil size={14} aria-hidden="true" />
                        <span className="sr-only">Editar {skill.name}</span>
                      </button>
                      <button
                        type="button"
                        title="Remover skill"
                        onClick={() => removeSkill(skill.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-theme-error/10 hover:text-theme-error"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                        <span className="sr-only">Remover {skill.name}</span>
                      </button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>

          <form
            className="space-y-3 rounded-2xl border border-white/[0.08] bg-black/10 p-3"
            onSubmit={handleSubmit}
          >
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
              {editingSkill ? (
                <Save size={14} aria-hidden="true" />
              ) : (
                <Plus size={14} aria-hidden="true" />
              )}
              {editingSkill ? 'Editar skill' : 'Nova skill'}
            </div>

            <label className="block text-xs text-zinc-400">
              Nome
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Django REST"
                className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-cyan-200/30"
              />
            </label>

            <label className="block text-xs text-zinc-400">
              Descrição
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Quando aplicar"
                className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-cyan-200/30"
              />
            </label>

            <label className="block text-xs text-zinc-400">
              Superprompt
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Instrucao persistente da skill"
                rows={8}
                className="mt-1 min-h-44 w-full resize-none rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 py-2 text-sm leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-cyan-200/30"
              />
            </label>

            <div className="flex gap-2">
              {editingSkill && (
                <button
                  type="button"
                  onClick={clearDraft}
                  className="flex h-10 flex-1 items-center justify-center rounded-2xl border border-white/[0.08] text-sm font-medium text-zinc-300 transition hover:bg-white/[0.08]"
                >
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                disabled={!name.trim() || !prompt.trim()}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-2xl bg-zinc-100 text-sm font-medium text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"
              >
                {editingSkill ? (
                  <Save size={16} aria-hidden="true" />
                ) : (
                  <Plus size={16} aria-hidden="true" />
                )}
                {editingSkill ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  )
}

function createSkillId(name: string) {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  return `${base || 'skill'}-${Date.now()}`
}
