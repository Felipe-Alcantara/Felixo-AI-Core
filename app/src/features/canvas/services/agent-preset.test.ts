import { describe, expect, it } from 'vitest'
import {
  AGENT_PRESET_FORMAT,
  AGENT_PRESET_VERSION,
  NATIVE_PRESETS,
  duplicatePresetName,
  normalizePreset,
  parsePresetFile,
  serializePreset,
  type AgentPreset,
} from './agent-preset'
import { createRequire } from 'node:module'

// O catálogo de skills embutidas mora no processo principal (cjs); o teste o
// lê direto para garantir que os presets nativos não apontem para skill que não existe.
const require = createRequire(import.meta.url)
const { BUILTIN_SKILLS } = require('../../../../electron/services/skills/skills-catalog.cjs') as {
  BUILTIN_SKILLS: Array<{ slug: string }>
}
const BUILTIN_IDS = new Set(BUILTIN_SKILLS.map((skill) => `builtin-${skill.slug}`))

const BASE: AgentPreset = {
  id: 'p1',
  name: 'Meu agente',
  description: 'faz algo',
  icon: '🧪',
  color: 'sky',
  agentId: 'codex',
  model: 'gpt-5.6-sol',
  effort: 'high',
  fast: true,
  yolo: false,
  contextPrompt: 'Contexto do agente.',
  skillIds: ['builtin-fetch-all'],
  cwd: '/home/eu/projeto',
}

describe('normalizePreset', () => {
  it('aceita um preset íntegro sem alterá-lo', () => {
    expect(normalizePreset(BASE)).toEqual(BASE)
  })

  it('recusa o que não dá para reconstruir: sem nome/id, CLI desconhecida, launcher, lixo', () => {
    expect(normalizePreset(null)).toBeNull()
    expect(normalizePreset([])).toBeNull()
    expect(normalizePreset({ ...BASE, name: '  ' })).toBeNull()
    expect(normalizePreset({ ...BASE, id: '' })).toBeNull()
    expect(normalizePreset({ ...BASE, agentId: 'nao-existe' })).toBeNull()
    expect(normalizePreset({ ...BASE, agentId: 'openia' })).toBeNull()
  })

  it('valores que a versão atual não conhece viram o padrão, não um argumento inválido', () => {
    const result = normalizePreset({ ...BASE, model: 'modelo-removido', effort: 'impossivel' })
    expect(result?.model).toBe('')
    expect(result?.effort).toBe('')
  })

  it('fast só vale onde o agente/modelo suporta', () => {
    expect(normalizePreset({ ...BASE, agentId: 'claude', model: 'opus', effort: 'high', fast: true })?.fast).toBe(false)
    expect(normalizePreset({ ...BASE, fast: 'yes' })?.fast).toBe(false)
    expect(normalizePreset({ ...BASE, model: '', fast: true })?.fast).toBe(true)
  })

  it('cor fora da paleta some; skills duplicadas/vazias são limpas e limitadas', () => {
    expect(normalizePreset({ ...BASE, color: '#ff0000' })).not.toHaveProperty('color')
    const many = Array.from({ length: 50 }, (_, i) => `builtin-s${i}`)
    const result = normalizePreset({ ...BASE, skillIds: ['a', 'a', '', '  ', ...many] })
    expect(result?.skillIds[0]).toBe('a')
    expect(result?.skillIds.length).toBe(30)
    expect(new Set(result?.skillIds).size).toBe(30)
  })

  it('limita nome e contexto', () => {
    expect(normalizePreset({ ...BASE, name: 'x'.repeat(200) })?.name.length).toBe(60)
    expect(normalizePreset({ ...BASE, contextPrompt: 'y'.repeat(30000) })?.contextPrompt.length).toBe(20000)
  })
})

describe('serializePreset / parsePresetFile (formato versionado)', () => {
  it('ida e volta preserva a receita, gera outro id e deixa a pasta da máquina de fora', () => {
    const text = serializePreset(BASE, new Date('2026-09-19T12:00:00Z'))
    const file = JSON.parse(text)
    expect(file.format).toBe(AGENT_PRESET_FORMAT)
    expect(file.version).toBe(AGENT_PRESET_VERSION)
    expect(file.preset).not.toHaveProperty('id')
    expect(file.preset).not.toHaveProperty('cwd')
    expect(file.preset).not.toHaveProperty('native')

    const parsed = parsePresetFile(text, 'novo-id')
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.preset).toEqual({ ...BASE, id: 'novo-id', cwd: '' })
    }
  })

  it('recusa com mensagem clara: JSON inválido, arquivo de outro tipo, versão futura, versão inválida', () => {
    const erro = (content: string) => {
      const result = parsePresetFile(content, 'x')
      return result.ok ? '' : result.message
    }
    expect(erro('{ nao json')).toMatch(/JSON válido/)
    expect(erro('{"format":"outra-coisa"}')).toMatch(/não é um preset/)
    expect(erro(JSON.stringify({ format: AGENT_PRESET_FORMAT, version: 99, preset: BASE }))).toMatch(/v99/)
    expect(erro(JSON.stringify({ format: AGENT_PRESET_FORMAT, version: 'a', preset: BASE }))).toMatch(/versão/)
    expect(erro(JSON.stringify({ format: AGENT_PRESET_FORMAT, version: 1, preset: { name: 'sem cli' } }))).toMatch(/incompleto/)
  })

  it('o formato salvo é estável: um arquivo v1 escrito à mão continua importando', () => {
    const v1 = JSON.stringify({
      format: 'felixo-agent-preset',
      version: 1,
      preset: { name: 'Antigo', agentId: 'claude', model: 'opus', effort: 'high', contextPrompt: 'oi', skillIds: [] },
    })
    const parsed = parsePresetFile(v1, 'id-1')
    expect(parsed.ok && parsed.preset.name).toBe('Antigo')
  })
})

describe('duplicatePresetName', () => {
  it('numera as cópias sem colidir', () => {
    expect(duplicatePresetName('Revisor', ['Revisor'])).toBe('Revisor (cópia)')
    expect(duplicatePresetName('Revisor', ['Revisor', 'Revisor (cópia)'])).toBe('Revisor (cópia 2)')
    expect(duplicatePresetName('Revisor (cópia)', ['Revisor', 'Revisor (cópia)'])).toBe('Revisor (cópia 2)')
    expect(duplicatePresetName('Revisor', ['revisor (CÓPIA)'])).toBe('Revisor (cópia 2)')
  })
})

describe('NATIVE_PRESETS', () => {
  it('são válidos como estão, nativos, com ids únicos e prefixados', () => {
    const ids = new Set<string>()
    for (const preset of NATIVE_PRESETS) {
      expect(normalizePreset(preset)).toEqual(preset)
      expect(preset.native).toBe(true)
      expect(preset.id.startsWith('native:')).toBe(true)
      ids.add(preset.id)
    }
    expect(ids.size).toBe(NATIVE_PRESETS.length)
    expect(NATIVE_PRESETS.length).toBeGreaterThanOrEqual(3)
  })

  it('só referenciam skills que existem no catálogo embutido', () => {
    for (const preset of NATIVE_PRESETS) {
      for (const skillId of preset.skillIds) {
        expect(BUILTIN_IDS.has(skillId), `${preset.id} → ${skillId}`).toBe(true)
      }
    }
  })
})
