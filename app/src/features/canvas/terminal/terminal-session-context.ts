import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react'
import { TerminalSessionStore, type SessionSnapshot } from './terminal-session-store'
import type { SessionMetadata } from './session-metadata'

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

/** Reads the stable identity/lifecycle metadata for a terminal details view. */
export function useSessionMetadata(sessionId: string): SessionMetadata | undefined {
  const store = useTerminalSessions()
  const [metadata, setMetadata] = useState<SessionMetadata | undefined>(() =>
    store.getSessionMetadata(sessionId),
  )

  useEffect(() => {
    const refresh = () => setMetadata(store.getSessionMetadata(sessionId))
    refresh()
    return store.subscribe(sessionId, refresh)
  }, [store, sessionId])

  return metadata
}

/** Subscribes to all live sessions, used by the notifications surface. */
export function useSessionSnapshots(): Record<string, SessionSnapshot> {
  const store = useTerminalSessions()
  const subscribe = useCallback(
    (listener: () => void) => store.subscribeAll(listener),
    [store],
  )
  const getSnapshot = useCallback(() => store.getSnapshots(), [store])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
