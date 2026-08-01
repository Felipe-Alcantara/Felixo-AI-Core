import { describe, expect, it } from 'vitest'
import { pendingDraftNodeIds } from './terminals-panel-drafts'

describe('pendingDraftNodeIds', () => {
  it('is empty when there are no drafts', () => {
    expect(pendingDraftNodeIds({})).toEqual([])
  })

  it('excludes empty and whitespace-only drafts', () => {
    expect(pendingDraftNodeIds({ a: '', b: '   ', c: '\n' })).toEqual([])
  })

  it('keeps node ids with real content, in insertion order', () => {
    expect(pendingDraftNodeIds({ a: 'oi', b: '', c: 'segue o baile' })).toEqual(['a', 'c'])
  })
})
