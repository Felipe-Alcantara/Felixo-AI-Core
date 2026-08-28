import { describe, expect, it } from 'vitest'
import {
  AGENTS,
  buildAgentArgs,
  getAgent,
  isDirectOpeniaLaunch,
  isKnownAgentCommand,
} from './agent-launch-options'

describe('Openia como launcher configurado pela interface', () => {
  it('fica disponível no seletor sem virar um modelo nativo do Felixo', () => {
    const openia = getAgent('openia')

    expect(openia).toMatchObject({
      command: 'openia',
      isLauncher: true,
      models: [],
    })
    expect(AGENTS.some((agent) => agent.id === 'openia')).toBe(true)
  })

  it('não injeta modelo, esforço ou yolo no comando do Openia', () => {
    expect(
      buildAgentArgs({
        agentId: 'openia',
        model: 'provider/modelo',
        effort: 'high',
        yolo: true,
      }),
    ).toEqual([])
  })

  it('separa o comando manual antigo do spawn direto configurado', () => {
    expect(isKnownAgentCommand('openia')).toBe(false)
    expect(isDirectOpeniaLaunch('openia', ['run', 'orchat'])).toBe(true)
    expect(isDirectOpeniaLaunch('openia', [])).toBe(false)
    expect(isKnownAgentCommand('codex')).toBe(true)
  })
})
