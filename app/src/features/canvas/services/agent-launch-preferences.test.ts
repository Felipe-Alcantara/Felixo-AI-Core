import { describe, expect, it } from 'vitest'
import {
  readAgentLaunchPreferences,
  saveAgentLaunchPreferences,
} from './agent-launch-preferences'

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

describe('agent launch preferences', () => {
  it('migrates the previous agent-only preference without losing a usable default', () => {
    const preferences = readAgentLaunchPreferences(
      createStorage({ 'felixo:last-agent': 'codex' }),
    )

    expect(preferences).toMatchObject({
      agentValue: 'codex',
      model: '',
      effort: '',
      yolo: false,
      planningFile: '',
    })
  })

  it('persists all reusable launch settings, including a planning file of any type', () => {
    const storage = createStorage()
    saveAgentLaunchPreferences(
      {
        agentValue: 'codex',
        model: 'gpt-5.6-terra',
        effort: 'ultra',
        yolo: true,
        projectId: 'project-a',
        planningFile: '/work/plans/release-plan.pdf',
      },
      storage,
    )

    expect(readAgentLaunchPreferences(storage)).toEqual({
      agentValue: 'codex',
      model: 'gpt-5.6-terra',
      effort: 'ultra',
      yolo: true,
      projectId: 'project-a',
      planningFile: '/work/plans/release-plan.pdf',
    })
  })

  it('discards corrupted or no-longer-supported agent options', () => {
    const storage = createStorage({
      'felixo:last-agent-launch-preferences': JSON.stringify({
        agentValue: 'unknown',
        model: 'missing-model',
        effort: 'impossible',
        yolo: 'yes',
        projectId: 4,
        planningFile: 7,
      }),
    })

    expect(readAgentLaunchPreferences(storage)).toEqual({
      agentValue: 'claude',
      model: '',
      effort: '',
      yolo: false,
      projectId: '',
      planningFile: '',
    })
  })
})
