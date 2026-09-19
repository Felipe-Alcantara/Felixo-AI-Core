import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Copy, Download, FilePlus2, Pencil, Trash2, Upload, UserCog } from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'
import { useAgentPresets } from '../../hooks/useAgentPresets'
import {
  AGENTS,
  getAgent,
  getEffortLevels,
  supportsFastMode,
} from '../../services/agent-launch-options'
import {
  PRESET_CONTEXT_MAX,
  PRESET_NAME_MAX,
  serializePreset,
  type AgentPreset,
  type AgentPresetAgentId,
} from '../../services/agent-preset'
import {
  blankPreset,
  changePresetAgent,
  changePresetModel,
  checkPresetDraft,
  findMissingSkillIds,
  presetFileName,
  togglePresetSkill,
} from '../../services/agent-preset-editor'
import {
  FRAME_COLORS,
  FRAME_COLOR_LABELS,
  FRAME_COLOR_SWATCHES,
} from '../frame-colors'
import { FelixoSelect } from '../../../shared/components/FelixoSelect'
import type { CanvasSkill } from '../../types'

type Props = { onClose: () => void; toolsMenuOpen?: boolean }

const ROTULO = 'felixo-field-label'
const CAMPO = 'felixo-control w-full text-sm'
const IMPORT_MAX_BYTES = 256 * 1024
const NATIVE_AGENTS = AGENTS.filter((agent) => !agent.isLauncher)

/**
 * Gerenciar presets de agente: editar todos os campos, escolher as skills no
 * catálogo, duplicar, excluir e trocar arquivos entre máquinas (exportar e
 * importar `.fxpreset`). Preset nativo não se edita — duplica-se.
 */
export function AgentPresetsPanel({ onClose, toolsMenuOpen }: Props) {
  const { presets, save, duplicate, remove, importFromText, error } = useAgentPresets()
  const [draft, setDraft] = useState<AgentPreset | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [skills, setSkills] = useState<CanvasSkill[]>([])
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void window.felixo?.canvas?.listAvailableSkills?.().then((result) => {
      if (result?.ok) setSkills(result.skills ?? [])
    })
  }, [])

  const catalogIds = useMemo(() => new Set(skills.map((skill) => skill.id)), [skills])

  const flash = useCallback((tone: 'ok' | 'error', text: string) => setMessage({ tone, text }), [])

  const startNew = () => {
    setMessage(null)
    setDraft(blankPreset(`preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`))
  }

  async function handleSave() {
    if (!draft) return
    const check = checkPresetDraft(draft)
    if (!check.ok) return flash('error', check.message)
    const saved = await save(check.preset)
    if (!saved) return flash('error', 'Não foi possível salvar o preset.')
    setDraft(null)
    flash('ok', `Preset "${saved.name}" salvo.`)
  }

  async function handleExport(preset: AgentPreset) {
    try {
      const result = await window.felixo?.files?.saveTextFile({
        defaultPath: presetFileName(preset),
        content: serializePreset(preset),
        filters: [{ name: 'Preset de agente do Felixo', extensions: ['fxpreset'] }],
      })
      if (result && !result.ok && !result.canceled) {
        flash('error', result.message ?? 'Não foi possível salvar o arquivo.')
      } else if (result?.ok) {
        flash('ok', `Preset "${preset.name}" exportado.`)
      }
    } catch (exportError) {
      flash('error', exportError instanceof Error ? exportError.message : 'Não foi possível exportar.')
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > IMPORT_MAX_BYTES) {
      return flash('error', 'O arquivo é grande demais para ser um preset.')
    }
    let content: string
    try {
      content = await file.text()
    } catch {
      return flash('error', 'Não foi possível ler o arquivo selecionado.')
    }
    const result = await importFromText(content)
    if (!result.ok) return flash('error', result.message)
    flash('ok', `Preset "${result.preset.name}" importado.`)
  }

  async function handleRemove(preset: AgentPreset) {
    if (!window.confirm(`Excluir o preset "${preset.name}"?`)) return
    if (await remove(preset.id)) {
      if (draft?.id === preset.id) setDraft(null)
      flash('ok', `Preset "${preset.name}" excluído.`)
    }
  }

  const agent = draft ? getAgent(draft.agentId) : undefined
  const effortLevels = draft && agent ? getEffortLevels(agent, draft.model) : null
  const missing = draft ? findMissingSkillIds(draft, catalogIds) : []

  return (
    <CanvasPanel
      title="Presets de agente"
      icon={<UserCog size={15} />}
      onClose={onClose}
      panelId="agent-presets"
      size="md"
      toolsMenuOpen={toolsMenuOpen}
    >
      {(message || error) && (
        <p
          role="status"
          className={`mb-3 rounded p-2 text-xs ${
            message?.tone === 'ok' && !error
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'bg-red-500/10 text-red-400'
          }`}
        >
          {error ?? message?.text}
        </p>
      )}

      {draft ? (
        <div className="space-y-3">
          <div>
            <label htmlFor="preset-name" className={ROTULO}>Nome</label>
            <input
              id="preset-name"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value.slice(0, PRESET_NAME_MAX) })}
              className={CAMPO}
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <div className="w-20">
              <label htmlFor="preset-icon" className={ROTULO}>Ícone</label>
              <input
                id="preset-icon"
                value={draft.icon}
                onChange={(event) => setDraft({ ...draft, icon: event.target.value.slice(0, 4) })}
                placeholder="🧪"
                className={CAMPO}
              />
            </div>
            <div className="min-w-0 flex-1">
              <label htmlFor="preset-desc" className={ROTULO}>Descrição</label>
              <input
                id="preset-desc"
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value.slice(0, 160) })}
                className={CAMPO}
              />
            </div>
          </div>

          <div>
            <span className={ROTULO}>Cor da moldura</span>
            <div className="mt-1 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Cor da moldura">
              <button
                type="button"
                role="radio"
                aria-checked={!draft.color}
                onClick={() => setDraft({ ...draft, color: undefined })}
                className={`rounded border px-2 py-1 text-[11px] ${!draft.color ? 'border-white/60' : 'border-white/10'}`}
              >
                Sem cor
              </button>
              {FRAME_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={draft.color === color}
                  aria-label={FRAME_COLOR_LABELS[color]}
                  title={FRAME_COLOR_LABELS[color]}
                  onClick={() => setDraft({ ...draft, color })}
                  className={`h-6 w-6 rounded border ${draft.color === color ? 'border-white' : 'border-white/10'}`}
                  style={{ backgroundColor: FRAME_COLOR_SWATCHES[color] }}
                />
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="preset-agent" className={ROTULO}>Agente</label>
            <FelixoSelect
              id="preset-agent"
              value={draft.agentId}
              onChange={(value) => setDraft(changePresetAgent(draft, value as AgentPresetAgentId))}
              options={NATIVE_AGENTS.map((item) => ({ value: item.id, label: item.label }))}
              menuLabel="Agentes"
              aria-label="Agente do preset"
            />
          </div>
          <div>
            <label htmlFor="preset-model" className={ROTULO}>Modelo</label>
            <FelixoSelect
              id="preset-model"
              value={draft.model}
              onChange={(value) => setDraft(changePresetModel(draft, value))}
              options={[{ value: '', label: 'Padrão da CLI' }, ...(agent?.models ?? []).map((model) => ({ value: model, label: model }))]}
              menuLabel="Modelos"
              aria-label="Modelo do preset"
            />
          </div>
          {effortLevels && (
            <div>
              <label htmlFor="preset-effort" className={ROTULO}>Esforço</label>
              <FelixoSelect
                id="preset-effort"
                value={draft.effort}
                onChange={(value) => setDraft({ ...draft, effort: value })}
                options={[{ value: '', label: 'Padrão' }, ...effortLevels.map((level) => ({ value: level, label: level }))]}
                menuLabel="Esforço de raciocínio"
                aria-label="Esforço do preset"
              />
            </div>
          )}

          {supportsFastMode(agent, draft.model) && (
            <label className="felixo-checkbox-field">
              <input
                type="checkbox"
                checked={draft.fast}
                onChange={(event) => setDraft({ ...draft, fast: event.target.checked })}
                className="felixo-checkbox"
              />
              <span className="felixo-checkbox-copy">
                <span className="felixo-checkbox-label">Modo fast</span>
                <span className="felixo-checkbox-meta">Mais rápido, gasta mais do limite</span>
              </span>
            </label>
          )}
          <label className="felixo-checkbox-field">
            <input
              type="checkbox"
              checked={draft.yolo}
              onChange={(event) => setDraft({ ...draft, yolo: event.target.checked })}
              className="felixo-checkbox"
            />
            <span className="felixo-checkbox-copy">
              <span className="felixo-checkbox-label">Yolo</span>
              <span className="felixo-checkbox-meta">Acesso total, sem confirmações</span>
            </span>
          </label>

          <div>
            <label htmlFor="preset-cwd" className={ROTULO}>Pasta padrão (opcional)</label>
            <input
              id="preset-cwd"
              value={draft.cwd}
              onChange={(event) => setDraft({ ...draft, cwd: event.target.value })}
              placeholder="Caminho da pasta; fica de fora da exportação"
              className={CAMPO}
            />
          </div>

          <div>
            <label htmlFor="preset-context" className={ROTULO}>Contexto inicial</label>
            <textarea
              id="preset-context"
              value={draft.contextPrompt}
              onChange={(event) => setDraft({ ...draft, contextPrompt: event.target.value.slice(0, PRESET_CONTEXT_MAX) })}
              rows={6}
              className={`${CAMPO} resize-y`}
              placeholder="Instruções que o agente recebe ao nascer (entregues por arquivo)."
            />
          </div>

          <fieldset>
            <legend className={ROTULO}>Skills</legend>
            <div className="mt-1 max-h-44 space-y-1 overflow-auto rounded border border-white/10 p-2">
              {skills.length === 0 && (
                <p className="text-[11px] text-zinc-500">Nenhuma skill disponível no catálogo.</p>
              )}
              {skills.map((skill) => (
                <label key={skill.id} className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={draft.skillIds.includes(skill.id)}
                    onChange={() => setDraft(togglePresetSkill(draft, skill.id))}
                    className="mt-0.5"
                  />
                  <span>
                    {skill.name}
                    {skill.description && (
                      <span className="block text-[11px] text-zinc-500">{skill.description}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            {missing.length > 0 && (
              <p className="mt-1 text-[11px] text-amber-400">
                Não encontrada no catálogo (será ignorada ao abrir o agente): {missing.join(', ')}
              </p>
            )}
          </fieldset>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              className="felixo-btn flex-1 rounded bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-white"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="felixo-btn rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 ring-1 ring-white/10 hover:bg-zinc-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <button
              type="button"
              onClick={startNew}
              className="felixo-btn felixo-secondary-action flex items-center gap-1 rounded px-2 py-1 text-xs"
            >
              <FilePlus2 size={12} aria-hidden /> Novo preset
            </button>
            <button
              type="button"
              onClick={() => importRef.current?.click()}
              className="felixo-btn felixo-secondary-action flex items-center gap-1 rounded px-2 py-1 text-xs"
            >
              <Upload size={12} aria-hidden /> Importar
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".fxpreset,application/json"
              className="hidden"
              onChange={(event) => void handleImport(event)}
              aria-label="Importar preset de agente"
            />
          </div>

          <ul className="space-y-2">
            {presets.map((preset) => (
              <li key={preset.id} className="rounded border border-white/10 p-2">
                <p className="text-sm font-medium">
                  {preset.icon ? `${preset.icon} ` : ''}
                  {preset.name}
                  {preset.native && <span className="ml-2 text-[10px] font-normal text-zinc-500">nativo</span>}
                </p>
                {preset.description && <p className="text-[11px] text-zinc-500">{preset.description}</p>}
                <p className="mt-1 text-[11px] text-zinc-400">
                  {getAgent(preset.agentId)?.label ?? preset.agentId}
                  {preset.model ? ` · ${preset.model}` : ''}
                  {preset.fast ? ' · ⚡ fast' : ''}
                  {preset.skillIds.length > 0 ? ` · ${preset.skillIds.length} skill(s)` : ''}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {!preset.native && (
                    <button
                      type="button"
                      onClick={() => { setMessage(null); setDraft(preset) }}
                      className="felixo-btn felixo-secondary-action flex items-center gap-1 rounded px-2 py-1 text-[11px]"
                    >
                      <Pencil size={11} aria-hidden /> Editar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void duplicate(preset)}
                    className="felixo-btn felixo-secondary-action flex items-center gap-1 rounded px-2 py-1 text-[11px]"
                  >
                    <Copy size={11} aria-hidden /> Duplicar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExport(preset)}
                    className="felixo-btn felixo-secondary-action flex items-center gap-1 rounded px-2 py-1 text-[11px]"
                  >
                    <Download size={11} aria-hidden /> Exportar
                  </button>
                  {!preset.native && (
                    <button
                      type="button"
                      onClick={() => void handleRemove(preset)}
                      className="felixo-btn flex items-center gap-1 rounded px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 size={11} aria-hidden /> Excluir
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </CanvasPanel>
  )
}
