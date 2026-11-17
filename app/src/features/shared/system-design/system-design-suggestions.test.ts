import { describe, expect, it } from 'vitest'

import {
  SYSTEM_DESIGN_SUGGESTIONS,
  isSuggestionInList,
  withSuggestion,
} from './system-design-suggestions'

const [felixo, doktor] = SYSTEM_DESIGN_SUGGESTIONS

describe('sugestões de fonte do System Design', () => {
  it('Felixo para back-end e Doktor para front-end, com commit visível', () => {
    expect(felixo).toMatchObject({ id: 'felixo', area: 'back-end' })
    expect(doktor).toMatchObject({ id: 'doktor', area: 'front-end', reviewedCommit: '7fc7f5e' })
  })

  it('acrescenta o Doktor ao fim sem tirar o que a pessoa já tinha', () => {
    const current = [{ repoUrl: felixo.repoUrl, branch: 'main' }]
    expect(withSuggestion(current, doktor)).toEqual([
      { repoUrl: felixo.repoUrl, branch: 'main' },
      { repoUrl: doktor.repoUrl, branch: 'main' },
    ])
    expect(current).toHaveLength(1)
  })

  it('não duplica, mesmo com .git, barra final ou caixa diferentes', () => {
    const current = [{ repoUrl: 'https://GITHUB.com/AndreGustavoms/Doktor-SystemDesign/', branch: 'main' }]
    expect(isSuggestionInList(doktor, current)).toBe(true)
    expect(withSuggestion(current, doktor)).toEqual(current)
  })

  it('outra branch não conta como o mesmo guia', () => {
    expect(isSuggestionInList(doktor, [{ repoUrl: doktor.repoUrl, branch: 'dev' }])).toBe(false)
  })
})
