import { useEffect, useState } from 'react'

export const REDUCED_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)'

type ReducedMotionChangeEvent = { matches: boolean }

export type ReducedMotionMediaQuery = {
  matches: boolean
  addEventListener?: (
    type: 'change',
    listener: (event: ReducedMotionChangeEvent) => void,
  ) => void
  removeEventListener?: (
    type: 'change',
    listener: (event: ReducedMotionChangeEvent) => void,
  ) => void
  addListener?: (listener: (event: ReducedMotionChangeEvent) => void) => void
  removeListener?: (listener: (event: ReducedMotionChangeEvent) => void) => void
}

export type MatchMedia = (
  query: typeof REDUCED_MOTION_MEDIA_QUERY,
) => ReducedMotionMediaQuery

export function readReducedMotionPreference(matchMedia?: MatchMedia): boolean {
  return matchMedia?.(REDUCED_MOTION_MEDIA_QUERY).matches === true
}

/** Subscribes to operating-system preference changes without owning a setting. */
export function subscribeToReducedMotionPreference(
  matchMedia: MatchMedia | undefined,
  onChange: (prefersReducedMotion: boolean) => void,
): () => void {
  if (!matchMedia) return () => {}

  const mediaQuery = matchMedia(REDUCED_MOTION_MEDIA_QUERY)
  const listener = (event: ReducedMotionChangeEvent) => onChange(event.matches)

  if (mediaQuery.addEventListener && mediaQuery.removeEventListener) {
    mediaQuery.addEventListener('change', listener)
    return () => mediaQuery.removeEventListener?.('change', listener)
  }

  mediaQuery.addListener?.(listener)
  return () => mediaQuery.removeListener?.(listener)
}

function getWindowMatchMedia(): MatchMedia | undefined {
  if (typeof window === 'undefined' || !window.matchMedia) return undefined
  return window.matchMedia.bind(window) as MatchMedia
}

/** React view of the system accessibility preference, including live changes. */
export function useReducedMotionPreference(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    readReducedMotionPreference(getWindowMatchMedia()),
  )

  useEffect(() => {
    const matchMedia = getWindowMatchMedia()
    return subscribeToReducedMotionPreference(matchMedia, setPrefersReducedMotion)
  }, [])

  return prefersReducedMotion
}
