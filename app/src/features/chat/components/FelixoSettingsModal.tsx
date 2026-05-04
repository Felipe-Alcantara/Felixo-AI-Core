import { BrainCircuit, MonitorCog, Palette, Save, User, X } from 'lucide-react'
import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { AppTheme, OrchestratorMode, OrchestratorSettings } from '../types'

type FelixoSettingsModalProps = {
  isOpen: boolean
  runtimeLabel: string
  theme: AppTheme
  orchestratorSettings: OrchestratorSettings
  projectsCount: number
  activeProjectsCount: number
  automationsCount: number
  onClose: () => void
  onThemeChange: (theme: AppTheme) => void
  onSaveOrchestratorSettings: (settings: OrchestratorSettings) => void
}

const modeOptions: Array<{ value: OrchestratorMode; label: string }> = [
  { value: 'manual', label: 'Manual' },
  { value: 'semi_auto', label: 'Semiautomático' },
  { value: 'automatic', label: 'Automático' },
  { value: 'read_only', label: 'Somente leitura' },
  { value: 'experimental', label: 'Experimental' },
]

export function FelixoSettingsModal({
  isOpen,
  ...dialogProps
}: FelixoSettingsModalProps) {
  if (!isOpen) {
    return null
  }

  return <FelixoSettingsDialog {...dialogProps} />
}

function FelixoSettingsDialog({
  runtimeLabel,
  theme,
  orchestratorSettings,
  projectsCount,
  activeProjectsCount,
  automationsCount,
  onClose,
  onThemeChange,
  onSaveOrchestratorSettings,
}: Omit<FelixoSettingsModalProps, 'isOpen'>) {
  const [settingsDraft, setSettingsDraft] = useState(orchestratorSettings)

  function saveGlobalSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSaveOrchestratorSettings(normalizeSettingsDraft(settingsDraft))
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
    setSettingsDraft((current) => ({
      ...current,
      [field]: Number.isFinite(value) ? value : 0,
    }))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        className="flex max-h-[86vh] w-full max-w-[620px] flex-col rounded-3xl border border-white/10 bg-[var(--color-panel)] shadow-shell"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Felixo</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Configuracoes locais do workspace e do perfil do app.
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

        <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-5">
          <section className="rounded-2xl border border-white/[0.08] bg-black/10 p-3">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-zinc-300">
              <User size={14} aria-hidden="true" />
              Perfil local
            </div>
            <div className="grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
              <Metric label="Nome" value="Felixo" />
              <Metric label="Runtime" value={runtimeLabel} />
            </div>
          </section>

          <form
            className="rounded-2xl border border-white/[0.08] bg-black/10 p-3"
            onSubmit={saveGlobalSettings}
          >
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-zinc-300">
              <BrainCircuit size={14} aria-hidden="true" />
              Memórias e orquestração global
            </div>

            <label className="block text-xs text-zinc-400">
              Memórias globais
              <textarea
                value={settingsDraft.globalMemories}
                onChange={(event) =>
                  setSettingsDraft((current) => ({
                    ...current,
                    globalMemories: event.target.value,
                  }))
                }
                rows={5}
                placeholder="Preferências, fatos estáveis e cuidados que o orquestrador deve lembrar."
                className="mt-1 w-full resize-none rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 py-2 text-sm leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-cyan-200/30"
              />
            </label>

            <label className="mt-3 block text-xs text-zinc-400">
              Contexto operacional
              <textarea
                value={settingsDraft.customContext}
                onChange={(event) =>
                  setSettingsDraft((current) => ({
                    ...current,
                    customContext: event.target.value,
                  }))
                }
                rows={4}
                placeholder="Preferências de execução, restrições e cuidados recorrentes."
                className="mt-1 w-full resize-none rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 py-2 text-sm leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-cyan-200/30"
              />
            </label>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-zinc-400">
                Workflow padrão
                <input
                  value={settingsDraft.defaultWorkflow}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      defaultWorkflow: event.target.value,
                    }))
                  }
                  className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-cyan-200/30"
                />
              </label>

              <label className="block text-xs text-zinc-400">
                Modo
                <select
                  value={settingsDraft.mode}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
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
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <NumberField
                label="Por turno"
                value={settingsDraft.maxAgentsPerTurn}
                onChange={(event) => updateNumber('maxAgentsPerTurn', event)}
              />
              <NumberField
                label="Turnos"
                value={settingsDraft.maxTurns}
                onChange={(event) => updateNumber('maxTurns', event)}
              />
              <NumberField
                label="Total"
                value={settingsDraft.maxTotalAgents}
                onChange={(event) => updateNumber('maxTotalAgents', event)}
              />
              <NumberField
                label="Minutos"
                value={settingsDraft.maxRuntimeMinutes}
                onChange={(event) => updateNumber('maxRuntimeMinutes', event)}
              />
              <NumberField
                label="Custo est."
                value={settingsDraft.maxCostEstimate}
                min={0}
                step={0.01}
                onChange={(event) => updateNumber('maxCostEstimate', event)}
              />
              <NumberField
                label="Contexto"
                value={settingsDraft.maxContextTokens}
                min={0}
                step={1000}
                onChange={(event) => updateNumber('maxContextTokens', event)}
              />
            </div>

            <label className="mt-3 flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-black/15 px-3 py-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={settingsDraft.requireConfirmationForSensitiveActions}
                onChange={(event) =>
                  setSettingsDraft((current) => ({
                    ...current,
                    requireConfirmationForSensitiveActions: event.target.checked,
                  }))
                }
                className="h-4 w-4 accent-cyan-300"
              />
              Confirmar ações sensíveis
            </label>

            <div className="mt-3 flex justify-end">
              <button
                type="submit"
                className="flex h-9 items-center justify-center gap-2 rounded-2xl bg-zinc-100 px-3 text-xs font-medium text-zinc-950 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-100 focus:ring-offset-2 focus:ring-offset-[#242423]"
              >
                <Save size={14} aria-hidden="true" />
                Salvar
              </button>
            </div>
          </form>

          <section className="rounded-2xl border border-white/[0.08] bg-black/10 p-3">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-zinc-300">
              <MonitorCog size={14} aria-hidden="true" />
              Estado do app
            </div>
            <div className="grid gap-2 text-xs text-zinc-400 sm:grid-cols-3">
              <Metric label="Projetos" value={`${projectsCount}`} />
              <Metric label="Ativos" value={`${activeProjectsCount}`} />
              <Metric label="Automações" value={`${automationsCount}`} />
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.08] bg-black/10 p-3">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-zinc-300">
              <Palette size={14} aria-hidden="true" />
              Aparência
            </div>
            <label className="block text-xs text-zinc-400">
              Tema
              <select
                value={theme}
                onChange={(event) => onThemeChange(event.target.value as AppTheme)}
                className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-cyan-200/30"
              >
                <option value="dark">Escuro</option>
                <option value="high_contrast">Alto contraste</option>
              </select>
            </label>
          </section>
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/15 px-3 py-2">
      <span className="block text-[10px] uppercase text-zinc-600">{label}</span>
      <span className="mt-1 block truncate font-mono text-zinc-200">{value}</span>
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

function normalizeSettingsDraft(settings: OrchestratorSettings) {
  return {
    ...settings,
    maxAgentsPerTurn: clampPositiveInteger(settings.maxAgentsPerTurn, 1),
    maxTurns: clampPositiveInteger(settings.maxTurns, 1),
    maxTotalAgents: clampPositiveInteger(settings.maxTotalAgents, 1),
    maxRuntimeMinutes: clampPositiveInteger(settings.maxRuntimeMinutes, 1),
    maxCostEstimate: clampNonNegative(settings.maxCostEstimate),
    maxContextTokens: clampNonNegative(settings.maxContextTokens),
  }
}

function clampPositiveInteger(value: number, fallback: number) {
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function clampNonNegative(value: number) {
  return Number.isFinite(value) && value >= 0 ? value : 0
}
