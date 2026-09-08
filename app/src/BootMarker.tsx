import { useEffect, type ReactNode } from 'react'

export function BootMarker({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset.felixoAppReady = 'true'

    return () => {
      delete document.documentElement.dataset.felixoAppReady
    }
  }, [])

  return children
}
