import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TerminalOutputEvent } from '../types'
import {
  appendTerminalOutputToSession,
  createTerminalOutputSession,
  markTerminalOutputSessionStatus,
} from './terminal-output-store'
import type {
  TerminalOutputSession,
  TerminalOutputSessions,
  TerminalSessionStatus,
} from './terminal-output-store'
export type {
  TerminalOutputChunk,
  TerminalOutputSession,
  TerminalSessionStatus,
} from './terminal-output-store'

type ClearSessionsOptions = {
  ignoreSessionIds?: Array<string | null | undefined>
}

export function useTerminalOutput() {
  const [sessionsById, setSessionsById] = useState<TerminalOutputSessions>({})
  const nextChunkId = useRef(1)
  const ignoredSessionIds = useRef<Set<string>>(new Set())
  const sessionsRef = useRef<TerminalOutputSessions>({})
  const pendingEventsRef = useRef<TerminalOutputEvent[]>([])
  const flushHandleRef = useRef<number | null>(null)
  const flushHandleKindRef = useRef<'animation' | 'timeout' | null>(null)
  const historyAvailable = hasTerminalLogArchive()

  const cancelScheduledFlush = useCallback(() => {
    const handle = flushHandleRef.current

    if (handle === null) {
      return
    }

    if (
      flushHandleKindRef.current === 'animation' &&
      typeof window !== 'undefined'
    ) {
      window.cancelAnimationFrame(handle)
    } else if (typeof window !== 'undefined') {
      window.clearTimeout(handle)
    }

    flushHandleRef.current = null
    flushHandleKindRef.current = null
  }, [])

  const flushPendingEvents = useCallback(() => {
    cancelScheduledFlush()

    const events = pendingEventsRef.current.splice(0)
    if (events.length === 0) {
      return
    }

    let nextSessions = sessionsRef.current

    for (const event of events) {
      const currentSession = nextSessions[event.sessionId]
      const nextSession = appendTerminalOutputToSession(
        currentSession,
        event,
        nextChunkId.current,
        new Date().toISOString(),
        historyAvailable,
      )

      if (
        !currentSession ||
        nextSession.totalChunkCount > currentSession.totalChunkCount
      ) {
        nextChunkId.current += 1
      }

      nextSessions = {
        ...nextSessions,
        [event.sessionId]: nextSession,
      }
    }

    // O ref é a fonte síncrona para exportações disparadas antes de o React
    // concluir o próximo render. Sem esta atualização, os últimos eventos de
    // um stream em andamento poderiam ficar fora do arquivo exportado.
    sessionsRef.current = nextSessions
    setSessionsById(nextSessions)
  }, [cancelScheduledFlush, historyAvailable])

  const scheduleFlush = useCallback(() => {
    if (flushHandleRef.current !== null || typeof window === 'undefined') {
      return
    }

    if (typeof window.requestAnimationFrame === 'function') {
      flushHandleKindRef.current = 'animation'
      flushHandleRef.current = window.requestAnimationFrame(() => {
        flushHandleRef.current = null
        flushHandleKindRef.current = null
        flushPendingEvents()
      })
      return
    }

    flushHandleKindRef.current = 'timeout'
    flushHandleRef.current = window.setTimeout(() => {
      flushHandleRef.current = null
      flushHandleKindRef.current = null
      flushPendingEvents()
    }, 16)
  }, [flushPendingEvents])

  const startSession = useCallback((sessionId: string, parentThreadId?: string) => {
    flushPendingEvents()
    const now = new Date().toISOString()
    ignoredSessionIds.current.delete(sessionId)

    const currentSession = sessionsRef.current[sessionId]
    const nextSessions = {
      ...sessionsRef.current,
      [sessionId]: {
        ...(currentSession ??
          createTerminalOutputSession(
            sessionId,
            parentThreadId,
            now,
            historyAvailable,
          )),
        parentThreadId: parentThreadId ?? currentSession?.parentThreadId,
        status: 'running' as const,
        updatedAt: now,
      },
    }

    sessionsRef.current = nextSessions
    setSessionsById(nextSessions)
  }, [flushPendingEvents, historyAvailable])

  const markSessionStatus = useCallback(
    (sessionId: string, status: TerminalSessionStatus) => {
      if (ignoredSessionIds.current.has(sessionId)) {
        return
      }

      flushPendingEvents()
      const now = new Date().toISOString()

      const nextSessions = {
        ...sessionsRef.current,
        [sessionId]: markTerminalOutputSessionStatus(
          sessionsRef.current[sessionId],
          sessionId,
          status,
          now,
          historyAvailable,
        ),
      }

      sessionsRef.current = nextSessions
      setSessionsById(nextSessions)
    },
    [flushPendingEvents, historyAvailable],
  )

  const clearSessions = useCallback((options: ClearSessionsOptions = {}) => {
    cancelScheduledFlush()
    pendingEventsRef.current = []
    ignoredSessionIds.current = new Set(
      options.ignoreSessionIds?.filter((id): id is string => Boolean(id)) ?? [],
    )
    sessionsRef.current = {}
    setSessionsById({})
    void window.felixo?.cli?.clearTerminalLogs?.({
      ignoreSessionIds: [...ignoredSessionIds.current],
    })
    nextChunkId.current = 1
  }, [cancelScheduledFlush])

  const appendTerminalOutput = useCallback((event: TerminalOutputEvent) => {
    if (
      ignoredSessionIds.current.has(event.sessionId) ||
      (event.parentThreadId && ignoredSessionIds.current.has(event.parentThreadId))
    ) {
      return
    }

    pendingEventsRef.current.push(event)
    scheduleFlush()
  }, [scheduleFlush])

  useEffect(() => {
    const subscribe =
      window.felixo?.cli?.onTerminalOutput ?? window.felixo?.cli?.onRawOutput

    return subscribe?.(appendTerminalOutput)
  }, [appendTerminalOutput])

  useEffect(() => {
    sessionsRef.current = sessionsById
  }, [sessionsById])

  useEffect(() => {
    return () => cancelScheduledFlush()
  }, [cancelScheduledFlush])

  const getCompleteSessions = useCallback(async () => {
    flushPendingEvents()

    const currentSessions = sessionsRef.current
    const result = await window.felixo?.cli?.getTerminalLogs?.()
    const archivedSessions = result?.ok ? result.sessions ?? [] : []

    return mergeArchivedSessions(currentSessions, archivedSessions)
  }, [flushPendingEvents])

  const sessions = useMemo(
    () =>
      Object.values(sessionsById).sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [sessionsById],
  )

  return {
    sessions,
    sessionsById,
    startSession,
    markSessionStatus,
    clearSessions,
    getCompleteSessions,
  }
}

function hasTerminalLogArchive() {
  return Boolean(
    typeof window !== 'undefined' && window.felixo?.cli?.getTerminalLogs,
  )
}

function mergeArchivedSessions(
  currentSessions: TerminalOutputSessions,
  archivedSessions: Array<TerminalOutputSession>,
) {
  const merged = new Map<string, TerminalOutputSession>()

  for (const session of archivedSessions) {
    const currentSession = currentSessions[session.sessionId]
    merged.set(session.sessionId, {
      ...session,
      parentThreadId: currentSession?.parentThreadId ?? session.parentThreadId,
      status: currentSession?.status ?? session.status,
      startedAt: currentSession?.startedAt ?? session.startedAt,
      updatedAt: currentSession?.updatedAt ?? session.updatedAt,
      outputSize: Math.max(
        currentSession?.outputSize ?? 0,
        session.outputSize,
      ),
      historyAvailable: true,
    })
  }

  for (const session of Object.values(currentSessions)) {
    if (!merged.has(session.sessionId)) {
      merged.set(session.sessionId, session)
    }
  }

  return [...merged.values()].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  )
}
