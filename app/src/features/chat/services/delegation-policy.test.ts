import { describe, expect, it } from 'vitest'
import { requiresDelegation } from './delegation-policy'

describe('requiresDelegation', () => {
  it('returns false for empty prompt', () => {
    expect(requiresDelegation('')).toBe(false)
    expect(requiresDelegation('   ')).toBe(false)
  })

  it('returns false for a plain acknowledgement (regression: word-boundary bug on "obrigad")', () => {
    // TRIVIAL_PROMPT_REGEX previously had "obrigad" (a stem) followed by \b,
    // which never matches because "obrigado"/"obrigada" continue with a
    // word character right after the stem. That silently sent thank-you
    // messages through the action-verb/length branches instead of being
    // recognized as trivial.
    expect(requiresDelegation('obrigado')).toBe(false)
    expect(requiresDelegation('obrigada')).toBe(false)
    expect(requiresDelegation('obg')).toBe(false)
  })

  it('returns true for prompts with a clear action verb', () => {
    expect(requiresDelegation('crie um arquivo novo')).toBe(true)
    expect(requiresDelegation('analise o auth.py')).toBe(true)
  })

  it('returns true for prompts longer than the threshold regardless of content', () => {
    const long = 'x'.repeat(121)
    expect(requiresDelegation(long)).toBe(true)
  })

  it('returns false for short prompts without action verbs or trivial markers when under the length floor', () => {
    expect(requiresDelegation('cor azul')).toBe(false)
  })
})
