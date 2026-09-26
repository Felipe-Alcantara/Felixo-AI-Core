import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Save, X } from 'lucide-react'
import type { Model, ModelAvailabilityStatus, OrchestratorSettings } from '../types'
import { DialogResizeHandles } from '../../shared/dialog/DialogResizeHandles'
import { useResizableDialog } from '../../shared/dialog/useResizableDialog'

type OrchestratorSettingsModalProps = {
  isOpen: boolean
  models: Model[]
  settings: OrchestratorSettings
  onClose: () => void
  onSave: (settings: OrchestratorSettings) => void
}

export function OrchestratorSettingsModal({
  isOpen,
  models,
  settings,
  onClose,
  onSave,
}: OrchestratorSettingsModalProps) {
  const dialog = useResizableDialog('orchestrator-settings')
  const [draft, setDraft] = useState(settings)
  const spawnableModels = useMemo(
    () => models.filter((model) => model.cliType !== 'unknown'),
    [models],
  )

  useEffect(() => {
    if (!isOpen) return
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSave(draft)
    onClose()
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <section
        {...dialog.frameProps}
        className="relative flex max-h-[82vh] w-full max-w-[640px] flex-col rounded-3xl border border-white/10 bg-(--color-panel) shadow-shell"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">
              Orquestrador
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Modelos disponiveis para sub-agentes.
            </p>
          </div>

          <button
            type="button"
            title="Fechar"
            onClick={onClose}
            className="felixo-btn-icon flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-white/8 hover:text-zinc-100"
          >
            <X size={16} aria-hidden="true" />
            <span className="sr-only">Fechar</span>
          </button>
        </header>

        <form className="min-h-0 overflow-y-auto px-5 py-5" onSubmit={submit}>
          <section className="rounded-2xl border border-white/8 bg-black/10 p-3">
            <div className="mb-3 text-xs font-medium text-zinc-300">
              Modelos para spawn
            </div>

            <div className="max-h-[48vh] space-y-2 overflow-y-auto">
              {spawnableModels.length === 0 ? (
                <p className="px-2 py-5 text-center text-xs text-zinc-500">
                  Nenhum modelo configurado para orquestração.
                </p>
              ) : (
                spawnableModels.map((model) => {
                  const status = getModelStatus(model, draft)

                  return (
                    <div
                      key={model.id}
                      className="grid gap-3 rounded-2xl border border-white/6 bg-black/15 px-3 py-2 text-xs text-zinc-400 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-zinc-200">
                            {model.name}
                          </span>
                          <ModelStatusBadge status={status} />
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
                          className="h-4 w-4"
                          style={{ accentColor: 'var(--color-error)' }}
                        />
                        Bloqueado
                      </label>
                    </div>
                  )
                })
              )}
            </div>
          </section>

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              className="felixo-btn flex h-10 items-center justify-center gap-2 rounded-2xl bg-zinc-100 px-4 text-sm font-medium text-zinc-950 hover:bg-white focus:outline-hidden focus:ring-2 focus:ring-zinc-100 focus:ring-offset-2 focus:ring-offset-[#242423]"
            >
              <Save size={16} aria-hidden="true" />
              Salvar
            </button>
          </div>
        </form>
        <DialogResizeHandles dialog={dialog} />
      </section>
    </div>
  )
}

function toggleValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value]
}

function getModelStatus(
  model: Model,
  draft: OrchestratorSettings,
): ModelAvailabilityStatus {
  if (draft.blockedModelIds.includes(model.id)) {
    return 'blocked'
  }

  return 'available'
}

const statusConfig: Record<
  ModelAvailabilityStatus,
  { label: string; className: string }
> = {
  available: {
    label: 'Disponível',
    className: 'border-theme-success/20 bg-theme-success/10 text-theme-success',
  },
  blocked: {
    label: 'Bloqueado',
    className: 'border-theme-error/20 bg-theme-error/10 text-theme-error',
  },
  unavailable: {
    label: 'Indisponível',
    className: 'border-zinc-400/20 bg-zinc-400/10 text-zinc-400',
  },
  error: {
    label: 'Erro',
    className: 'border-theme-error/20 bg-theme-error/10 text-theme-error',
  },
  no_login: {
    label: 'Sem login',
    className: 'border-[color-mix(in_srgb,var(--color-warning)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] text-(--color-warning)',
  },
  limit_reached: {
    label: 'Limite atingido',
    className: 'border-[color-mix(in_srgb,var(--color-warning)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] text-(--color-warning)',
  },
  unknown: {
    label: 'Desconhecido',
    className: 'border-zinc-500/20 bg-zinc-500/10 text-zinc-500',
  },
}

function ModelStatusBadge({ status }: { status: ModelAvailabilityStatus }) {
  const config = statusConfig[status]

  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] leading-none ${config.className}`}
    >
      {config.label}
    </span>
  )
}
