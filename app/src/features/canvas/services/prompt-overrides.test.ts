import { describe, expect, it } from 'vitest'
import {
  buildOverridesById,
  buildPresetIds,
  resolveVisiblePrompts,
  upsertPresetOverride,
} from './prompt-overrides'
import type { AutomationDefinition } from '../../shared/types/automations'

function makeAutomation(overrides: Partial<AutomationDefinition> = {}): AutomationDefinition {
  return {
    id: 'preset-a',
    name: 'Preset A',
    description: 'Description A',
    prompt: 'Prompt A',
    scope: 'chat',
    isDefault: true,
    ...overrides,
  }
}

describe('resolveVisiblePrompts', () => {
  it('returns presets unchanged when there is no custom data', () => {
    const presets = [makeAutomation()]
    expect(resolveVisiblePrompts(presets, [])).toEqual(presets)
  })

  it('replaces a preset with its override in the same position', () => {
    const presetA = makeAutomation({ id: 'preset-a', name: 'Preset A' })
    const presetB = makeAutomation({ id: 'preset-b', name: 'Preset B' })
    const override = makeAutomation({
      id: 'preset-a',
      name: 'Preset A editado',
      isDefault: false,
    })

    const result = resolveVisiblePrompts([presetA, presetB], [override])

    expect(result).toEqual([override, presetB])
  })

  it('appends free-form custom automations after every preset', () => {
    const preset = makeAutomation({ id: 'preset-a' })
    const freeCustom = makeAutomation({
      id: 'custom-1',
      name: 'My prompt',
      isDefault: false,
    })

    const result = resolveVisiblePrompts([preset], [freeCustom])

    expect(result).toEqual([preset, freeCustom])
  })
})

describe('buildPresetIds / buildOverridesById', () => {
  it('buildPresetIds collects every preset id', () => {
    const presets = [makeAutomation({ id: 'a' }), makeAutomation({ id: 'b' })]
    expect(buildPresetIds(presets)).toEqual(new Set(['a', 'b']))
  })

  it('buildOverridesById indexes custom automations by id', () => {
    const custom = [makeAutomation({ id: 'a' }), makeAutomation({ id: 'b' })]
    const result = buildOverridesById(custom)
    expect(result.get('a')).toBe(custom[0])
    expect(result.get('b')).toBe(custom[1])
  })
})

describe('upsertPresetOverride', () => {
  it('inserts a new override built from the pristine preset when none exists yet', () => {
    const preset = makeAutomation({ id: 'preset-a', name: 'Preset A', scope: 'chat' })

    const result = upsertPresetOverride([], preset, { name: 'Edited name' })

    expect(result).toEqual([
      { ...preset, name: 'Edited name', isDefault: false },
    ])
  })

  it('stacks a partial edit on top of an existing override instead of resetting untouched fields', () => {
    const preset = makeAutomation({ id: 'preset-a' })
    const existingOverride = makeAutomation({
      id: 'preset-a',
      name: 'Already edited name',
      description: 'Already edited description',
      isDefault: false,
    })

    const result = upsertPresetOverride([existingOverride], preset, {
      description: 'New description',
    })

    expect(result).toEqual([
      {
        ...existingOverride,
        description: 'New description',
      },
    ])
  })

  it('never mutates the pristine preset object passed in', () => {
    const preset = makeAutomation({ id: 'preset-a', name: 'Preset A' })
    const presetSnapshot = { ...preset }

    upsertPresetOverride([], preset, { name: 'Edited' })

    expect(preset).toEqual(presetSnapshot)
  })

  it('leaves other custom automations untouched', () => {
    const preset = makeAutomation({ id: 'preset-a' })
    const unrelatedCustom = makeAutomation({ id: 'custom-1', isDefault: false })

    const result = upsertPresetOverride([unrelatedCustom], preset, { name: 'Edited' })

    expect(result).toContainEqual(unrelatedCustom)
    expect(result).toHaveLength(2)
  })
})
