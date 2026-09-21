import { describe, expect, it } from 'vitest'
import {
  blankPreset,
  changePresetAgent,
  changePresetModel,
  checkPresetDraft,
  findMissingSkillIds,
  presetFileName,
  togglePresetSkill,
} from './agent-preset-editor'
import type { AgentPreset } from './agent-preset'

const CODEX: AgentPreset = {
  ...blankPreset('p1'),
  name: 'Codex fast',
  agentId: 'codex',
  model: 'gpt-5.6-sol',
  effort: 'xhigh',
  fast: true,
  skillIds: ['builtin-a'],
}

describe('changePresetAgent', () => {
  it('trocar de CLI zera modelo, esforço e fast, e mantém o resto', () => {
    const next = changePresetAgent(CODEX, 'claude')
    expect(next).toMatchObject({ agentId: 'claude', model: '', effort: '', fast: false, name: 'Codex fast', skillIds: ['builtin-a'] })
  })
  it('a mesma CLI não mexe em nada', () => {
    expect(changePresetAgent(CODEX, 'codex')).toBe(CODEX)
  })
})

describe('changePresetModel', () => {
  it('mantém esforço e fast quando o novo modelo os aceita', () => {
    expect(changePresetModel(CODEX, 'gpt-5.6-terra')).toMatchObject({ model: 'gpt-5.6-terra', effort: 'xhigh', fast: true })
  })
  it('limpa o esforço que o novo modelo não aceita (ultra só em sol/terra)', () => {
    const ultra = { ...CODEX, effort: 'ultra' as const }
    expect(changePresetModel(ultra, 'gpt-5.6-luna').effort).toBe('')
  })
  it('limpa o fast quando o modelo não o suporta', () => {
    expect(changePresetModel(CODEX, 'modelo-sem-tier').fast).toBe(false)
  })
})

describe('togglePresetSkill / findMissingSkillIds', () => {
  it('liga e desliga uma skill sem duplicar', () => {
    const on = togglePresetSkill(CODEX, 'builtin-b')
    expect(on.skillIds).toEqual(['builtin-a', 'builtin-b'])
    expect(togglePresetSkill(on, 'builtin-b').skillIds).toEqual(['builtin-a'])
  })
  it('acusa skill do preset que o catálogo não tem mais', () => {
    const catalog = new Set(['builtin-a'])
    expect(findMissingSkillIds({ skillIds: ['builtin-a', 'builtin-sumiu'] }, catalog)).toEqual(['builtin-sumiu'])
    expect(findMissingSkillIds({ skillIds: [] }, catalog)).toEqual([])
  })
})

describe('checkPresetDraft', () => {
  it('recusa nome vazio ou grande demais, com mensagem clara', () => {
    expect(checkPresetDraft({ ...CODEX, name: '   ' })).toEqual({ ok: false, message: 'Dê um nome ao preset.' })
    const grande = checkPresetDraft({ ...CODEX, name: 'x'.repeat(61) })
    expect(!grande.ok && grande.message).toMatch(/até 60/)
  })
  it('devolve o preset normalizado e nunca como nativo', () => {
    const result = checkPresetDraft({ ...CODEX, native: true, name: '  Meu  ' })
    expect(result.ok && result.preset.name).toBe('Meu')
    expect(result.ok && result.preset.native).toBeUndefined()
  })
})

describe('presetFileName', () => {
  it('vira um nome de arquivo seguro, sem acento nem símbolo', () => {
    expect(presetFileName({ name: 'Revisor de PR' })).toBe('revisor-de-pr.fxpreset')
    expect(presetFileName({ name: 'Depuração ⚡ / rápida!' })).toBe('depuracao-rapida.fxpreset')
    expect(presetFileName({ name: '???' })).toBe('agente.fxpreset')
    expect(presetFileName({ name: 'x'.repeat(100) }).length).toBeLessThanOrEqual(40 + '.fxpreset'.length)
  })
})
