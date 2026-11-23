import { describe, expect, it } from 'vitest'
import { labelIsCustomized } from './webpage-label'

describe('labelIsCustomized', () => {
  it('sem rótulo, o título da página manda', () => {
    expect(labelIsCustomized({})).toBe(false)
  })

  it('rótulo gravado a partir da página segue o título ao reabrir', () => {
    expect(labelIsCustomized({ label: 'Docs', labelFromPage: true })).toBe(false)
  })

  it('nome manual e rótulo antigo (sem marca) ficam travados', () => {
    expect(labelIsCustomized({ label: 'Meu painel' })).toBe(true)
    expect(labelIsCustomized({ label: 'Meu painel', labelFromPage: false })).toBe(true)
  })
})
