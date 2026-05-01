import { useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { BrainCircuit, Save, SlidersHorizontal, X } from 'lucide-react'
import type { Model, OrchestratorMode, OrchestratorSettings } from '../types'

type OrchestratorSettingsModalProps = {
  isOpen: boolean
  models: Model[]
  settings: OrchestratorSettings
  onClose: () => void
  onSave: (settings: OrchestratorSettings) => void
}

const modeOptions: Array<{ value: OrchestratorMode; label: string }> = [
  { value: 'manual', label: 'Manual' },
  { value: 'semi_auto', label: 'Semiautomático' },
  { value: 'automatic', label: 'Automático' },
  { value: 'read_only', label: 'Somente leitura' },
  { value: 'experimental', label: 'Experimental' },
]

export function OrchestratorSettingsModal({
  isOpen,
  models,
  settings,
  onClose,
  onSave,
}: OrchestratorSettingsModalProps) {
  const [draft, setDraft] = useState(settings)
  const [skillsText, setSkillsText] = useState(settings.enabledSkills.join(', '))
  const spawnableModels = useMemo(
    () => models.filter((model) => model.cliType !== 'unknown'),
    [models],
  )

  if (!isOpen) {
    return null
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSave({
      ...draft,
      enabledSkills: skillsText
        .split(',')
        .map((skill) => skill.trim())
        .filter(Boolean),
      maxAgentsPerTurn: clampPositiveInteger(draft.maxAgentsPerTurn, 1),
      maxTurns: clampPositiveInteger(draft.maxTurns, 1),
      maxTotalAgents: clampPositiveInteger(draft.maxTotalAgents, 1),
      maxRuntimeMinutes: clampPositiveInteger(draft.maxRuntimeMinutes, 1),
      maxCostEstimate: clampNonNegative(draft.maxCostEstimate),
      maxContextTokens: clampNonNegative(draft.maxContextTokens),
    })
    onClose()
  }

  function updateNumber(
    field: keyof Pick<
      OrchestratorSettings,
      | 'maxAgentsPerTurn'
      | 'maxTurns'
      | 'maxTotalAgents'
      | 'maxRuntimeMinutes'
      | 'maxCostEstimate'
      | 'maxContextTokens'
    >,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const value = Number.parseFloat(event.target.value)
    setDraft((current) => ({
      ...current,
      [field]: Number.isFinite(value) ? value : 0,
    }))
  }

  function togglePreferred(modelId: string) {
    setDraft((current) => {
      const preferredModelIds = toggleValue(current.preferredModelIds, modelId)
      const blockedModelIds = preferredModelIds.includes(modelId)
        ? current.blockedModelIds.filter((id) => id !== modelId)
        : current.blockedModelIds

      return {
        ...current,
        preferredModelIds,
        blockedModelIds,
      }
    })
  }

  function toggleBlocked(modelId: string) {
    setDraft((current) => {
      const blockedModelIds = toggleValue(current.blockedModelIds, modelId)
      const preferredModelIds = blockedModelIds.includes(modelId)
        ? current.preferredModelIds.filter((id) => id !== modelId)
        : current.preferredModelIds

      return {
        ...current,
        blockedModelIds,
        preferredModelIds,
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        className="flex max-h-[88vh] w-full max-w-[720px] flex-col rounded-3xl border border-white/10 bg-[var(--color-panel)] shadow-shell"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">
              Orquestrador
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Modelos, contexto, skills e limites dos sub-agentes.
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

        <form className="min-h-0 overflow-y-auto px-5 py-5" onSubmit={submit}>
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="space-y-3 rounded-2xl border border-white/[0.08] bg-black/10 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
                <BrainCircuit size={14} aria-hidden="true" />
                Contexto
              </div>

              <label className="block text-xs text-zinc-400">
                Modo
                <select
                  value={draft.mode}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      mode: event.target.value as OrchestratorMode,
                    }))
                  }
                  className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-cyan-200/30"
                >
                  {modeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs text-zinc-400">
                Workflow padrão
                <input
                  value={draft.defaultWorkflow}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      defaultWorkflow: event.target.value,
                    }))
                  }
                  className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-cyan-200/30"
                />
              </label>

              <label className="block text-xs text-zinc-400">
                Skills
                <input
                  value={skillsText}
                  onChange={(event) => setSkillsText(event.target.value)}
                  className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-cyan-200/30"
                />
              </label>

              <label className="block text-xs text-zinc-400">
                Contexto personalizado
                <textarea
                  value={draft.customContext}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      customContext: event.target.value,
                    }))
                  }
                  rows={6}
                  className="mt-1 w-full resize-none rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 py-2 text-sm leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-cyan-200/30"
                />
              </label>
            </section>

            <section className="space-y-3 rounded-2xl border border-white/[0.08] bg-black/10 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
                <SlidersHorizontal size={14} aria-hidden="true" />
                Limites
              </div>

              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label="Por turno"
                  value={draft.maxAgentsPerTurn}
                  onChange={(event) => updateNumber('maxAgentsPerTurn', event)}
                />
                <NumberField
                  label="Turnos"
                  value={draft.maxTurns}
                  onChange={(event) => updateNumber('maxTurns', event)}
                />
                <NumberField
                  label="Total"
                  value={draft.maxTotalAgents}
                  onChange={(event) => updateNumber('maxTotalAgents', event)}
                />
                <NumberField
                  label="Minutos"
                  value={draft.maxRuntimeMinutes}
                  onChange={(event) => updateNumber('maxRuntimeMinutes', event)}
                />
                <NumberField
                  label="Custo est."
                  value={draft.maxCostEstimate}
                  min={0}
                  step={0.01}
                  onChange={(event) => updateNumber('maxCostEstimate', event)}
                />
                <NumberField
                  label="Contexto (tokens)"
                  value={draft.maxContextTokens}
                  min={0}
                  step={1000}
                  onChange={(event) => updateNumber('maxContextTokens', event)}
                />
              </div>

              <label className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-black/15 px-3 py-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={draft.requireConfirmationForSensitiveActions}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      requireConfirmationForSensitiveActions: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-cyan-300"
                />
                Confirmar ações sensíveis
              </label>
            </section>
          </div>

          <section className="mt-4 rounded-2xl border border-white/[0.08] bg-black/10 p-3">
            <div className="mb-3 text-xs font-medium text-zinc-300">
              Modelos para spawn
            </div>

            <div className="max-h-52 space-y-2 overflow-y-auto">
              {spawnableModels.length === 0 ? (
                <p className="px-2 py-5 text-center text-xs text-zinc-500">
                  Nenhum modelo configurado para orquestração.
                </p>
              ) : (
                spawnableModels.map((model) => (
                  <div
                    key={model.id}
                    className="grid gap-3 rounded-2xl border border-white/[0.06] bg-black/15 px-3 py-2 text-xs text-zinc-400 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-zinc-200">
                        {model.name}
                      </div>
                      <div className="truncate font-mono text-[11px] text-zinc-600">
                        {model.cliType}
                        {model.providerModel ? ` · ${model.providerModel}` : ''}
                      </div>
                    </div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draft.preferredModelIds.includes(model.id)}
                        onChange={() => togglePreferred(model.id)}
                        className="h-4 w-4 accent-cyan-300"
                      />
                      Preferido
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draft.blockedModelIds.includes(model.id)}
                        onChange={() => toggleBlocked(model.id)}
                        className="h-4 w-4 accent-red-300"
                      />
                      Bloqueado
                    </label>
                  </div>
                ))
              )}
            </div>
          </section>

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              className="flex h-10 items-center justify-center gap-2 rounded-2xl bg-zinc-100 px-4 text-sm font-medium text-zinc-950 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-100 focus:ring-offset-2 focus:ring-offset-[#242423]"
            >
              <Save size={16} aria-hidden="true" />
              Salvar
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function NumberField({
  label,
  value,
  min = 1,
  step,
  onChange,
}: {
  label: string
  value: number
  min?: number
  step?: number
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <label className="block text-xs text-zinc-400">
      {label}
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={onChange}
        className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-cyan-200/30"
      />
    </label>
  )
}

function toggleValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value]
}

function clampPositiveInteger(value: number, fallback: number) {
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function clampNonNegative(value: number) {
  return Number.isFinite(value) && value >= 0 ? value : 0
}
