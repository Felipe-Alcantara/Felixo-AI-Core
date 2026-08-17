import { describe, expect, it } from 'vitest'

import { defaultAutomations } from './automations'
import { AUTOMATION_SCOPES } from '../types/automations'

/**
 * O catálogo é conteúdo, e conteúdo quebra em silêncio: um id repetido some da
 * lista sem erro, um prompt truncado degrada a resposta sem falhar, e um escopo
 * inválido some do filtro. Estes testes fazem o catálogo falhar alto.
 */
describe('catálogo de prompts', () => {
  it('não tem id repetido', () => {
    const ids = defaultAutomations.map((preset) => preset.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('usa apenas escopos declarados no tipo', () => {
    for (const preset of defaultAutomations) {
      expect(AUTOMATION_SCOPES).toContain(preset.scope)
    }
  })

  it('todo preset tem nome, descrição e prompt de verdade', () => {
    for (const preset of defaultAutomations) {
      expect(preset.name.trim().length, preset.id).toBeGreaterThan(3)
      // A descrição é o que faz a pessoa escolher o prompt certo na lista.
      expect(preset.description.trim().length, preset.id).toBeGreaterThan(60)
      // Prompt curto demais não carrega método — vira "faça bem feito".
      expect(preset.prompt.trim().length, preset.id).toBeGreaterThan(600)
    }
  })

  it('todo preset é marcado como padrão', () => {
    for (const preset of defaultAutomations) {
      expect(preset.isDefault, preset.id).toBe(true)
    }
  })

  it('todo preset termina pedindo a entrada do usuário', () => {
    // O prompt é colado antes do que a pessoa escreve; sem a deixa final, o
    // texto dela gruda no meio de uma frase da instrução.
    for (const preset of defaultAutomations) {
      expect(preset.prompt.trimEnd().endsWith(':'), preset.id).toBe(true)
    }
  })

  it('cobre os escopos que o app oferece', () => {
    const cobertos = new Set(defaultAutomations.map((preset) => preset.scope))

    for (const escopo of ['code', 'docs', 'git', 'notion', 'planning', 'security']) {
      expect(cobertos, `escopo sem nenhum preset: ${escopo}`).toContain(escopo)
    }
  })
})
