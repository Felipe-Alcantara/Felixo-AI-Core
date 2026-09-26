import { useId, useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import type { AgentConfig } from '../hooks/useAgentConfig'
import { PRESET_CONTEXT_MAX, PRESET_NAME_MAX } from '../services/agent-preset'
import { FelixoSelect, type FelixoSelectOption } from '../../shared/components/FelixoSelect'

const ROTULO = 'felixo-field-label'
const CAMPO = 'felixo-control w-full text-sm'
const NENHUM = ''

type Props = { config: AgentConfig }

/**
 * Preset de agente no formulário de "novo agente": escolher uma receita pronta
 * (nativa ou salva), ajustar o contexto e salvar o resultado como preset novo.
 * Escolher um preset só PREENCHE o formulário — quem abre o agente continua
 * sendo o botão de sempre, e o contexto vai por arquivo no terminal.
 */
export function AgentPresetFields({ config }: Props) {
  const id = useId()
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const { presets, duplicate, remove, error } = config.presets
  const active = config.activePreset

  const options: FelixoSelectOption[] = [
    { value: NENHUM, label: 'Nenhum (configurar à mão)' },
    ...presets.map((preset) => ({
      value: preset.id,
      label: `${preset.icon ? `${preset.icon} ` : ''}${preset.name}${preset.native ? ' · nativo' : ''}`,
      description: preset.description || undefined,
    })),
  ]

  async function handleSave() {
    const name = newName.trim()
    if (!name || saving) return
    setSaving(true)
    try {
      const saved = await config.saveAsPreset(name)
      if (saved) setNewName('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-3">
      <label htmlFor={`${id}-preset`} className={ROTULO}>
        Preset
      </label>
      <FelixoSelect
        id={`${id}-preset`}
        value={active?.id ?? NENHUM}
        onChange={(value) =>
          config.applyPreset(presets.find((preset) => preset.id === value) ?? null)
        }
        options={options}
        menuLabel="Presets de agente"
        aria-label="Preset de agente"
      />

      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] text-zinc-400 hover:text-zinc-200">
          Contexto do agente e salvar como preset
        </summary>

        <label htmlFor={`${id}-context`} className={`${ROTULO} mt-2`}>
          Contexto inicial
        </label>
        <textarea
          id={`${id}-context`}
          value={config.contextDraft}
          onChange={(event) => config.setContextDraft(event.target.value.slice(0, PRESET_CONTEXT_MAX))}
          rows={5}
          placeholder="Instruções que o agente recebe ao nascer (entregues por arquivo)."
          className={`${CAMPO} resize-y`}
        />
        {active && active.skillIds.length > 0 && (
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            Skills do preset: {active.skillIds.map((skill) => skill.replace(/^builtin-/, '')).join(', ')}
          </p>
        )}

        <div className="mt-2 flex items-center gap-2">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value.slice(0, PRESET_NAME_MAX))}
            placeholder="Nome do novo preset"
            aria-label="Nome do novo preset"
            className={`${CAMPO} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!newName.trim() || saving || !config.agent || config.agent.isLauncher}
            className="felixo-btn felixo-secondary-action rounded-sm px-2 py-1 text-[11px] disabled:opacity-50"
          >
            {saving ? 'Salvando…' : 'Salvar como preset'}
          </button>
        </div>

        {active && (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void duplicate(active)}
              className="felixo-btn felixo-secondary-action flex items-center gap-1 rounded-sm px-2 py-1 text-[11px]"
            >
              <Copy size={11} aria-hidden /> Duplicar
            </button>
            {!active.native && (
              <button
                type="button"
                onClick={() => {
                  void remove(active.id).then((ok) => {
                    if (ok) config.applyPreset(null)
                  })
                }}
                className="felixo-btn flex items-center gap-1 rounded-sm px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/10"
              >
                <Trash2 size={11} aria-hidden /> Excluir
              </button>
            )}
          </div>
        )}
        {error && <p className="mt-1 text-[11px] text-red-400">{error}</p>}
      </details>
    </div>
  )
}
