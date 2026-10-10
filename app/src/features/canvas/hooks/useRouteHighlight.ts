import { useCallback, useEffect, useRef, useState } from 'react'
import type { Connection } from '@xyflow/react'

/**
 * Destaque da rota entre dois blocos: a linha acende por um instante quando
 * uma entrega de verdade chega ao terminal, e apaga sozinha.
 */
export function useRouteHighlight() {
  // A route is lit only after a real PTY delivery succeeds. A connected edge
  // remains quiet until then; node activity alone never implies data flow.
  const [activeRouteKeys, setActiveRouteKeys] = useState<Set<string>>(
    () => new Set(),
  )
  const routeTimersRef = useRef<Map<string, number>>(new Map())
  const routeKey = useCallback(
    (connection: Pick<Connection, 'source' | 'target'>) =>
      `${connection.source}->${connection.target}`,
    [],
  )
  const markRouteDelivered = useCallback(
    (connection: Pick<Connection, 'source' | 'target'>) => {
      const key = routeKey(connection)
      setActiveRouteKeys((current) => {
        const next = new Set(current)
        next.add(key)
        return next
      })
      const previousTimer = routeTimersRef.current.get(key)
      if (previousTimer != null) {
        window.clearTimeout(previousTimer)
      }
      const timer = window.setTimeout(() => {
        setActiveRouteKeys((current) => {
          const next = new Set(current)
          next.delete(key)
          return next
        })
        routeTimersRef.current.delete(key)
      }, 900)
      routeTimersRef.current.set(key, timer)
    },
    [routeKey],
  )
  useEffect(() => {
    const timers = routeTimersRef.current
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
      timers.clear()
    }
  }, [])

  return { activeRouteKeys, markRouteDelivered, routeKey }
}
