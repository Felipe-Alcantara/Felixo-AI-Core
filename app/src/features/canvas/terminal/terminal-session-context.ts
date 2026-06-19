import { createContext, useContext, useEffect, useState } from 'react'
import { TerminalSessionStore, type SessionSnapshot } from './terminal-session-store'

export const TerminalSessionContext = createContext<TerminalSessionStore | null>(null)

export function useTerminalSessions(): TerminalSessionStore {
  const store = useContext(TerminalSessionContext)
  if (!store) {
    throw new Error('useTerminalSessions must be used within TerminalSessionProvider.')
  }
  return store
}

/** Subscribes to a single session's snapshot (activity + preview). */
export function useSessionSnapshot(sessionId: string): SessionSnapshot | undefined {
  const store = useTerminalSessions()
  const [snapshot, setSnapshot] = useState<SessionSnapshot | undefined>(() =>
    store.getSnapshot(sessionId),
  )

  useEffect(() => {
    // subscribe invokes the listener immediately with the current snapshot,
    // so there's no need to seed state separately here.
    return store.subscribe(sessionId, setSnapshot)
  }, [store, sessionId])

  return snapshot
}
