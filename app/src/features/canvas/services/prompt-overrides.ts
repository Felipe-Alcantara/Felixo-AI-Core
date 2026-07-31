import type { AutomationDefinition } from '../../shared/types/automations'

/**
 * Merges built-in presets with persisted custom automations for display.
 *
 * A custom entry sharing a preset's id is an override of that preset — the
 * override's (editable) text is shown in the preset's place, preserving
 * preset order. Custom automations with no matching preset id are the
 * user's own free-form prompts, appended after the presets.
 */
export function resolveVisiblePrompts(
  presets: AutomationDefinition[],
  custom: AutomationDefinition[],
): AutomationDefinition[] {
  const overridesById = buildOverridesById(custom)
  const presetIds = buildPresetIds(presets)
  const customOnly = custom.filter((automation) => !presetIds.has(automation.id))

  return [
    ...presets.map((preset) => overridesById.get(preset.id) ?? preset),
    ...customOnly,
  ]
}

export function buildPresetIds(presets: AutomationDefinition[]): Set<string> {
  return new Set(presets.map((preset) => preset.id))
}

export function buildOverridesById(
  custom: AutomationDefinition[],
): Map<string, AutomationDefinition> {
  return new Map(custom.map((automation) => [automation.id, automation]))
}

/**
 * Applies an edit to a preset by upserting an override into the custom list,
 * without mutating the built-in preset. The base object is the currently
 * visible version (an existing override if present, otherwise the pristine
 * preset), so partial edits stack on top of prior ones instead of resetting
 * untouched fields.
 */
export function upsertPresetOverride(
  custom: AutomationDefinition[],
  preset: AutomationDefinition,
  patch: Partial<AutomationDefinition>,
): AutomationDefinition[] {
  const existingIndex = custom.findIndex((automation) => automation.id === preset.id)
  const base = existingIndex >= 0 ? custom[existingIndex] : preset
  const edited: AutomationDefinition = {
    ...base,
    ...patch,
    id: preset.id,
    isDefault: false,
  }

  if (existingIndex >= 0) {
    const next = [...custom]
    next[existingIndex] = edited
    return next
  }

  return [...custom, edited]
}
