import { describe, expect, it } from 'vitest'

import { buildSkillsManifestPrompt } from './skills-manifest'
import type { CanvasSkill } from '../types'

const skill = (extra: Partial<CanvasSkill> = {}): CanvasSkill => ({
  id: 'x',
  name: 'Depurar até a causa',
  description: 'Reproduzir, isolar e provar a hipótese antes de corrigir.',
  path: '/user/skills/depurar-causa-raiz/SKILL.md',
  ...extra,
})

describe('buildSkillsManifestPrompt', () => {
  it('lista nome, descrição e onde encontrar', () => {
    const texto = buildSkillsManifestPrompt([skill()])

    expect(texto).toContain('Depurar até a causa')
    expect(texto).toContain('Reproduzir, isolar')
    expect(texto).toContain('/user/skills/depurar-causa-raiz/SKILL.md')
  })

  it('não cola o conteúdo da skill, só o ponteiro', () => {
    // O contrato inteiro depende disso: dezessete skills coladas gastariam o
    // contexto com o que quase nunca é necessário.
    const texto = buildSkillsManifestPrompt([skill()])

    expect(texto).toContain('leia o arquivo/URL só quando a tarefa combinar')
    expect(texto.split('\n').length).toBeLessThan(15)
  })

  it('marca a origem das skills de terceiros', () => {
    const texto = buildSkillsManifestPrompt([
      skill({ source: 'community', origin: 'anthropics/skills', path: 'https://exemplo' }),
    ])

    expect(texto).toContain('[terceiros: anthropics/skills]')
  })

  it('não marca origem nas skills próprias', () => {
    const texto = buildSkillsManifestPrompt([skill({ source: 'builtin' })])

    expect(texto).not.toContain('[terceiros')
  })

  it('devolve vazio quando não há skill, em vez de uma seção oca', () => {
    expect(buildSkillsManifestPrompt([])).toBe('')
  })

  it('descarta entrada sem nome ou sem caminho', () => {
    const texto = buildSkillsManifestPrompt([
      skill({ name: '   ' }),
      skill({ path: '' }),
    ])

    expect(texto).toBe('')
  })

  it('resume o excedente em vez de estourar o prompt', () => {
    const muitas = Array.from({ length: 45 }, (_, indice) =>
      skill({ id: String(indice), name: `Skill ${indice}` }),
    )

    const texto = buildSkillsManifestPrompt(muitas)

    expect(texto).toContain('Skill 0')
    expect(texto).not.toContain('Skill 44')
    expect(texto).toContain('+5 outras skills')
  })

  it('diz ao agente que ler a lista inteira não é o esperado', () => {
    const texto = buildSkillsManifestPrompt([skill()])

    expect(texto).toContain('não leia todas por precaução')
    expect(texto).toContain('a lista é oferta, não obrigação')
  })
})
