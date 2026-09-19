import {
  getAgent,
  isEffortValidForModel,
  supportsFastMode,
} from './agent-launch-options'
import {
  PRESET_NAME_MAX,
  normalizePreset,
  type AgentPreset,
  type AgentPresetAgentId,
} from './agent-preset'

/**
 * Regras de edição de um preset, fora do componente: trocar de CLI ou de
 * modelo mexe em outros campos (esforço, fast), e é ali que a tela erraria em
 * silêncio. Puro, para ter teste em vez de revisão visual.
 */

/** Trocar de CLI: modelo, esforço e fast eram dela e não valem para a nova. */
export function changePresetAgent(draft: AgentPreset, agentId: AgentPresetAgentId): AgentPreset {
  if (draft.agentId === agentId) return draft
  return { ...draft, agentId, model: '', effort: '', fast: false }
}

/** Trocar de modelo: o esforço e o fast só ficam se o novo modelo os aceita. */
export function changePresetModel(draft: AgentPreset, model: string): AgentPreset {
  const agent = getAgent(draft.agentId)
  return {
    ...draft,
    model,
    effort: agent && isEffortValidForModel(agent, model, draft.effort) ? draft.effort : '',
    fast: draft.fast && supportsFastMode(agent, model),
  }
}

export function togglePresetSkill(draft: AgentPreset, skillId: string): AgentPreset {
  const has = draft.skillIds.includes(skillId)
  return {
    ...draft,
    skillIds: has ? draft.skillIds.filter((id) => id !== skillId) : [...draft.skillIds, skillId],
  }
}

/** Skills que o preset cita e o catálogo atual não tem mais (ex.: skill removida). */
export function findMissingSkillIds(
  preset: Pick<AgentPreset, 'skillIds'>,
  catalogIds: ReadonlySet<string>,
): string[] {
  return preset.skillIds.filter((id) => !catalogIds.has(id))
}

export type DraftCheck = { ok: true; preset: AgentPreset } | { ok: false; message: string }

/** Confere o rascunho antes de salvar e devolve o preset já normalizado. */
export function checkPresetDraft(draft: AgentPreset): DraftCheck {
  if (!draft.name.trim()) return { ok: false, message: 'Dê um nome ao preset.' }
  if (draft.name.trim().length > PRESET_NAME_MAX) {
    return { ok: false, message: `O nome pode ter até ${PRESET_NAME_MAX} caracteres.` }
  }
  const preset = normalizePreset({ ...draft, native: false })
  if (!preset) return { ok: false, message: 'O preset está incompleto.' }
  return { ok: true, preset }
}

/** Nome de arquivo seguro para exportar: "Revisor de PR" → "revisor-de-pr.fxpreset". */
export function presetFileName(preset: Pick<AgentPreset, 'name'>): string {
  const slug = preset.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${slug || 'agente'}.fxpreset`
}

/** Um preset em branco para "Novo preset" (Claude, padrão de tudo). */
export function blankPreset(id: string): AgentPreset {
  return {
    id,
    name: '',
    description: '',
    icon: '',
    agentId: 'claude',
    model: '',
    effort: '',
    fast: false,
    yolo: false,
    contextPrompt: '',
    skillIds: [],
    cwd: '',
  }
}
