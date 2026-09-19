import { describe, expect, it } from 'vitest'
import { modelSupportsFastMode, resolveFastMode } from './model-fast-mode'

describe('modelSupportsFastMode', () => {
  it('só Codex, com modelo da lista ou padrão', () => {
    expect(modelSupportsFastMode({ cliType: 'codex', providerModel: 'gpt-5.6-sol' })).toBe(true)
    expect(modelSupportsFastMode({ cliType: 'codex-app-server' })).toBe(true)
    expect(modelSupportsFastMode({ cliType: 'codex', providerModel: 'modelo-antigo' })).toBe(false)
    expect(modelSupportsFastMode({ cliType: 'claude', providerModel: 'opus' })).toBe(false)
    expect(modelSupportsFastMode({ cliType: 'gemini' })).toBe(false)
    expect(modelSupportsFastMode(null)).toBe(false)
  })
})

describe('resolveFastMode', () => {
  it('guarda true só onde suporta; senão some, para não ligar o tier escondido', () => {
    expect(resolveFastMode({ cliType: 'codex', providerModel: 'gpt-5.6-luna' }, true)).toBe(true)
    expect(resolveFastMode({ cliType: 'codex', providerModel: 'gpt-5.6-luna' }, false)).toBeUndefined()
    expect(resolveFastMode({ cliType: 'codex', providerModel: 'gpt-5.6-luna' }, undefined)).toBeUndefined()
    expect(resolveFastMode({ cliType: 'claude', providerModel: 'opus' }, true)).toBeUndefined()
    expect(resolveFastMode({ cliType: 'codex', providerModel: 'outro' }, true)).toBeUndefined()
  })
})
