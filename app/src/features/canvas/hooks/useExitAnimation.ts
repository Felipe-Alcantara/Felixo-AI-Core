import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Drives an open/close animation for a conditionally-rendered overlay. The
 * caller keeps the element mounted while `rendered` is true; calling `close()`
 * flips `closing` on (so an exit animation can play) and then, after
 * `durationMs`, invokes `onClosed` to actually unmount it.
 */
export function useExitAnimation(durationMs: number, onClosed: () => void) {
  const [closing, setClosing] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const close = useCallback(() => {
    if (timerRef.current) {
      return
    }
    setClosing(true)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      onClosed()
    }, durationMs)
  }, [durationMs, onClosed])

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    },
    [],
  )

  return { closing, close }
}
