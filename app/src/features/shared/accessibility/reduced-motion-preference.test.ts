import { describe, expect, it, vi } from 'vitest'
import {
  readReducedMotionPreference,
  REDUCED_MOTION_MEDIA_QUERY,
  subscribeToReducedMotionPreference,
  type ReducedMotionMediaQuery,
} from './reduced-motion-preference'

function createMediaQuery(matches: boolean): ReducedMotionMediaQuery & {
  emit: (nextMatches: boolean) => void
} {
  const listeners = new Set<(event: { matches: boolean }) => void>()
  return {
    matches,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    emit(nextMatches) {
      this.matches = nextMatches
      listeners.forEach((listener) => listener({ matches: nextMatches }))
    },
  }
}

describe('reduced-motion preference', () => {
  it('reads whether the system asks for reduced motion', () => {
    const reduced = createMediaQuery(true)
    const noPreference = createMediaQuery(false)

    expect(readReducedMotionPreference(() => reduced)).toBe(true)
    expect(readReducedMotionPreference(() => noPreference)).toBe(false)
    expect(readReducedMotionPreference()).toBe(false)
  })

  it('uses the exact operating-system media query', () => {
    const mediaQuery = createMediaQuery(false)
    const matchMedia = vi.fn(() => mediaQuery)

    readReducedMotionPreference(matchMedia)

    expect(matchMedia).toHaveBeenCalledWith(REDUCED_MOTION_MEDIA_QUERY)
  })

  it('notifies live preference changes and cleans up the listener', () => {
    const mediaQuery = createMediaQuery(false)
    const onChange = vi.fn()
    const unsubscribe = subscribeToReducedMotionPreference(() => mediaQuery, onChange)

    mediaQuery.emit(true)
    expect(onChange).toHaveBeenCalledWith(true)

    unsubscribe()
    mediaQuery.emit(false)
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
