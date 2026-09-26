import { describe, expect, it } from 'vitest'
import { hideSkillId, readSkillsCatalog, restoreSkillId } from './skills-panel-catalog'
import type { CanvasSkill } from '../../types'

const skill = (id: string, source: CanvasSkill['source'] = 'builtin'): CanvasSkill => ({
  id,
  name: `Skill ${id}`,
  description: '',
  path: `/skills/${id}/SKILL.md`,
  source,
})

describe('readSkillsCatalog', () => {
  it('lê visíveis, terceiros e ocultas do retorno do catálogo', () => {
    const catalog = readSkillsCatalog({
      ok: true,
      skills: [skill('a')],
      communityEnabled: false,
      hiddenBuiltinIds: ['b', 'community-x'],
      hiddenSkills: [skill('b')],
    })

    expect(catalog).toEqual({
      skills: [skill('a')],
      communityEnabled: false,
      hiddenIds: ['b', 'community-x'],
      hiddenSkills: [skill('b')],
    })
  })

  it('assume terceiros ligados e nada oculto quando o backend não informa', () => {
    // Backend anterior a este campo: só `skills` volta. O painel não pode
    // quebrar nem inventar ocultas.
    expect(readSkillsCatalog({ ok: true, skills: [skill('a')] })).toEqual({
      skills: [skill('a')],
      communityEnabled: true,
      hiddenIds: [],
      hiddenSkills: [],
    })
  })

  it('devolve null quando o catálogo falhou, para o painel manter o que tinha', () => {
    expect(readSkillsCatalog({ ok: false, message: 'falhou' })).toBeNull()
    expect(readSkillsCatalog({ ok: true })).toBeNull()
    expect(readSkillsCatalog(undefined)).toBeNull()
  })
})

describe('hideSkillId', () => {
  it('acrescenta o id ao fim, preservando os que já estavam ocultos', () => {
    expect(hideSkillId(['a'], 'b')).toEqual(['a', 'b'])
  })

  it('não repete um id que já estava oculto', () => {
    expect(hideSkillId(['a', 'b'], 'a')).toEqual(['a', 'b'])
  })

  it('não altera a lista recebida', () => {
    const hidden = ['a']
    hideSkillId(hidden, 'b')
    expect(hidden).toEqual(['a'])
  })
})

describe('restoreSkillId', () => {
  it('tira só o id restaurado e mantém os outros ocultos', () => {
    // Inclui um terceiro oculto que o painel não mostra (terceiros
    // desligados): restaurar outra skill não pode trazê-lo de volta.
    expect(restoreSkillId(['a', 'community-x', 'b'], 'a')).toEqual(['community-x', 'b'])
  })

  it('não muda nada quando o id não estava oculto', () => {
    expect(restoreSkillId(['a'], 'z')).toEqual(['a'])
  })
})
