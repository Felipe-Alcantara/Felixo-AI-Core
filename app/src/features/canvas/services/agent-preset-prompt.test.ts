import { describe, expect, it } from 'vitest'
import { buildPresetInstruction } from './agent-preset-prompt'
import type { CanvasSkill } from '../types'

const SKILLS: CanvasSkill[] = [
  { id: 'builtin-a', name: 'Skill A', description: 'faz A', path: '/skills/a/SKILL.md' },
  { id: 'builtin-b', name: 'Skill B', description: '', path: '/skills/b/SKILL.md' },
]

describe('buildPresetInstruction', () => {
  it('sem preset, nada', () => {
    expect(buildPresetInstruction(undefined, SKILLS)).toBeUndefined()
  })

  it('nome, contexto e as skills do preset (com caminho para o agente ler)', () => {
    const text = buildPresetInstruction(
      { name: 'Revisor', contextPrompt: 'Revise com rigor.', skillIds: ['builtin-a', 'builtin-b'] },
      SKILLS,
    )
    expect(text).toContain('Preset deste agente: Revisor')
    expect(text).toContain('Revise com rigor.')
    expect(text).toContain('- Skill A: faz A — /skills/a/SKILL.md')
    // Skill sem descrição não deixa um ": " solto.
    expect(text).toContain('- Skill B — /skills/b/SKILL.md')
  })

  it('só lista as skills do preset, não todas as disponíveis', () => {
    const text = buildPresetInstruction({ name: 'X', contextPrompt: 'c', skillIds: ['builtin-a'] }, SKILLS)
    expect(text).toContain('Skill A')
    expect(text).not.toContain('Skill B')
  })

  it('skill que sumiu do catálogo é ignorada, sem inventar caminho', () => {
    const text = buildPresetInstruction({ name: 'X', contextPrompt: 'c', skillIds: ['builtin-removida'] }, SKILLS)
    expect(text).toBe('Preset deste agente: X\n\nc')
  })

  it('preset sem contexto e sem skill encontrada não produz instrução vazia', () => {
    expect(buildPresetInstruction({ name: 'X', contextPrompt: '  ', skillIds: [] }, SKILLS)).toBeUndefined()
    expect(buildPresetInstruction({ name: 'X', contextPrompt: '', skillIds: ['nao-existe'] }, SKILLS)).toBeUndefined()
  })
})
