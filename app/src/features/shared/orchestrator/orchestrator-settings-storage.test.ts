import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  defaultOrchestratorSettings,
  saveOrchestratorSettings,
} from './orchestrator-settings-storage'

describe('saveOrchestratorSettings', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('devolve o que ficou gravado: 0 e decimal nos limites viram o padrão, e a tela precisa mostrar isso', async () => {
    const saveOrchestrator = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('window', {
      felixo: { settings: { saveOrchestrator } },
      localStorage: { removeItem: vi.fn() },
    })

    const stored = await saveOrchestratorSettings({
      ...defaultOrchestratorSettings,
      maxAgentsPerTurn: 0,
      maxTurns: 2.5,
      maxTotalAgents: 7,
    })

    expect(stored.maxAgentsPerTurn).toBe(defaultOrchestratorSettings.maxAgentsPerTurn)
    expect(stored.maxTurns).toBe(defaultOrchestratorSettings.maxTurns)
    expect(stored.maxTotalAgents).toBe(7)
    expect(saveOrchestrator).toHaveBeenCalledWith(stored)
  })
})
