import { describe, expect, it } from 'vitest'
import {
  resolveGuestSrc,
  shouldCreateGuest,
  shouldRemoveOnDetach,
  staleGuests,
  type MountableGuest,
} from './webview-mount'

const guest = (isConnected: boolean): MountableGuest => ({
  isConnected,
  remove: () => {},
})

describe('shouldRemoveOnDetach', () => {
  it('removes the guest instead of only dropping the reference', () => {
    // The bug: a detached-but-not-removed <webview> keeps loading and playing
    // audio, so the next mount stacks a second one over it.
    expect(shouldRemoveOnDetach(guest(true))).toBe(true)
  })

  it('has nothing to remove when no guest was ever mounted', () => {
    expect(shouldRemoveOnDetach(null)).toBe(false)
  })
})

describe('shouldCreateGuest', () => {
  it('reuses a guest that is still connected', () => {
    expect(shouldCreateGuest(guest(true))).toBe(false)
  })

  it('creates one on first mount', () => {
    expect(shouldCreateGuest(null)).toBe(true)
  })

  it('creates a new one after a cleanup detached the previous guest', () => {
    // StrictMode's mount → cleanup → mount cycle lands here.
    expect(shouldCreateGuest(guest(false))).toBe(true)
  })
})

describe('staleGuests', () => {
  it('finds a guest a previous mount left behind', () => {
    const orphan = guest(true)
    const container = { existingGuests: () => [orphan] }

    expect(staleGuests(container, null)).toEqual([orphan])
  })

  it('never reports the node\'s own live guest as stale', () => {
    const own = guest(true)
    const container = { existingGuests: () => [own] }

    expect(staleGuests(container, own)).toEqual([])
  })

  it('reports only the orphans when both are present', () => {
    const own = guest(true)
    const orphan = guest(true)
    const container = { existingGuests: () => [orphan, own] }

    expect(staleGuests(container, own)).toEqual([orphan])
  })

  it('is empty for a fresh container', () => {
    expect(staleGuests({ existingGuests: () => [] }, null)).toEqual([])
  })
})

describe('resolveGuestSrc', () => {
  it('recreates the guest on the page the user navigated to', () => {
    expect(resolveGuestSrc('https://example.com/artigo', 'https://www.google.com')).toBe(
      'https://example.com/artigo',
    )
  })

  it('falls back to the opening URL before any navigation', () => {
    expect(resolveGuestSrc('', 'https://www.google.com')).toBe('https://www.google.com')
  })
})
