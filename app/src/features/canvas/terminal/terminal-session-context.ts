import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react'
import type {
  SessionActivity,
  SessionSnapshot,
  TerminalSessionStoreApi,
} from './terminal-session-api'
import type { SessionMetadata } from './session-metadata'

export const TerminalSessionContext = createContext<TerminalSessionStoreApi | null>(null)

export function useTerminalSessions(): TerminalSessionStoreApi {
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

/**
 * Devolve o valor anterior enquanto o novo for igual segundo `isEqual`: é o
 * que deixa um `useSyncExternalStore` sobre TODOS os snapshots re-renderizar só
 * quando o derivado muda, e não a cada pedaço de saída de qualquer terminal.
 */
export function createStableValue<T>(isEqual: (previous: T, next: T) => boolean): (next: T) => T {
  let has = false
  let last: T
  return (next) => {
    if (has && isEqual(last, next)) return last
    has = true
    last = next
    return next
  }
}

/**
 * Um derivado de todos os snapshots. Quem lê re-renderiza só quando o
 * derivado muda (o `CanvasView` antes re-renderizava a cada transição de
 * qualquer sessão, para usar só o conjunto de blocos que pedem ação).
 */
export function useSessionSnapshotsSelector<T>(
  select: (snapshots: Record<string, SessionSnapshot>) => T,
  isEqual: (previous: T, next: T) => boolean,
): T {
  const store = useTerminalSessions()
  const [stabilize] = useState(() => createStableValue(isEqual))
  const subscribe = useCallback(
    (listener: () => void) => store.subscribeAll(listener),
    [store],
  )
  const getSnapshot = useCallback(
    () => stabilize(select(store.getSnapshots())),
    [select, stabilize, store],
  )

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Só a atividade de uma sessão: quem mostra só isso não re-renderiza a cada prévia nova. */
export function useSessionActivity(sessionId: string): SessionActivity {
  const store = useTerminalSessions()
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(sessionId, () => listener()),
    [store, sessionId],
  )
  const getActivity = useCallback(
    () => store.getSnapshot(sessionId)?.activity ?? 'starting',
    [store, sessionId],
  )

  return useSyncExternalStore(subscribe, getActivity, getActivity)
}
