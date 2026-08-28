import { describe, expect, it } from 'vitest'
import {
  AGENTS,
  buildAgentArgs,
  getAgent,
  isKnownAgentCommand,
} from './agent-launch-options'

describe('Openia como launcher opaco', () => {
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

  it('não envia contexto automático para o menu interativo do launcher', () => {
    expect(isKnownAgentCommand('openia')).toBe(false)
    expect(isKnownAgentCommand('codex')).toBe(true)
  })
})
