import { describe, expect, it } from 'vitest'
import {
  AGENTS,
  buildAgentArgs,
  describeLaunch,
  getAgent,
  isDirectOpeniaLaunch,
  isKnownAgentCommand,
  supportsFastMode,
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

describe('modo fast do Codex', () => {
  const codex = getAgent('codex')

  it('passa service_tier=priority só para Codex em modelo compatível', () => {
    expect(buildAgentArgs({ agentId: 'codex', model: 'gpt-5.6-sol', fast: true })).toEqual([
      '--model', 'gpt-5.6-sol', '-c', 'service_tier=priority',
    ])
    // Modelo padrão (vazio) também aceita: todo modelo listado suporta o tier.
    expect(buildAgentArgs({ agentId: 'codex', fast: true })).toEqual(['-c', 'service_tier=priority'])
  })

  it('sem fast, ou fast desligado, não envia nada', () => {
    expect(buildAgentArgs({ agentId: 'codex', model: 'gpt-5.6-sol' })).toEqual(['--model', 'gpt-5.6-sol'])
    expect(buildAgentArgs({ agentId: 'codex', model: 'gpt-5.6-sol', fast: false })).toEqual(['--model', 'gpt-5.6-sol'])
  })

  it('ignora fast em modelo fora da lista e em agente sem o modo', () => {
    expect(buildAgentArgs({ agentId: 'codex', model: 'modelo-antigo', fast: true })).toEqual(['--model', 'modelo-antigo'])
    expect(buildAgentArgs({ agentId: 'claude', model: 'opus', fast: true })).toEqual(['--model', 'opus'])
    expect(buildAgentArgs({ agentId: 'gemini', fast: true })).toEqual([])
  })

  it('fica junto de esforço e yolo sem se misturar', () => {
    expect(
      buildAgentArgs({ agentId: 'codex', model: 'gpt-5.6-sol', effort: 'high', fast: true, yolo: true }),
    ).toEqual([
      '--model', 'gpt-5.6-sol',
      '-c', 'model_reasoning_effort=high',
      '-c', 'service_tier=priority',
      '--dangerously-bypass-approvals-and-sandbox',
    ])
  })

  it('supportsFastMode: só Codex, com modelo da lista ou padrão', () => {
    expect(supportsFastMode(codex, 'gpt-5.6-terra')).toBe(true)
    expect(supportsFastMode(codex, '')).toBe(true)
    expect(supportsFastMode(codex, 'outro')).toBe(false)
    expect(supportsFastMode(getAgent('claude'), 'opus')).toBe(false)
    expect(supportsFastMode(undefined, '')).toBe(false)
  })

  it('o rótulo do terminal mostra o fast (gasta mais limite) e só quando ele vale', () => {
    expect(describeLaunch({ agentId: 'codex', model: 'gpt-5.6-sol', fast: true })).toBe('Codex gpt-5.6-sol ⚡ fast')
    expect(describeLaunch({ agentId: 'codex', model: 'gpt-5.6-sol' })).toBe('Codex gpt-5.6-sol')
    expect(describeLaunch({ agentId: 'claude', model: 'opus', fast: true })).toBe('Claude opus')
  })
})
