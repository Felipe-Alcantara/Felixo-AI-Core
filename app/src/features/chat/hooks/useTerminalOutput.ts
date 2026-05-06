import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TerminalOutputEvent } from '../types'

export type TerminalSessionStatus = 'running' | 'completed' | 'error' | 'stopped'

export type TerminalOutputChunk = TerminalOutputEvent & {
  id: number
  createdAt: string
}

export type TerminalOutputSession = {
  sessionId: string
  parentThreadId?: string
  chunks: TerminalOutputChunk[]
  status: TerminalSessionStatus
  startedAt: string
  updatedAt: string
  outputSize: number
}

type TerminalOutputSessions = Record<string, TerminalOutputSession>
type ClearSessionsOptions = {
  ignoreSessionIds?: Array<string | null | undefined>
}
const textEncoder = new TextEncoder()

export function useTerminalOutput() {
  const [sessionsById, setSessionsById] = useState<TerminalOutputSessions>({})
  const nextChunkId = useRef(1)
  const ignoredSessionIds = useRef<Set<string>>(new Set())

  const startSession = useCallback((sessionId: string, parentThreadId?: string) => {
    const now = new Date().toISOString()
    ignoredSessionIds.current.delete(sessionId)

    setSessionsById((currentSessions) => {
      const currentSession = currentSessions[sessionId]

      return {
        ...currentSessions,
        [sessionId]: {
          sessionId,
          parentThreadId: parentThreadId ?? currentSession?.parentThreadId,
          chunks: currentSession?.chunks ?? [],
          status: 'running',
          startedAt: currentSession?.startedAt ?? now,
          updatedAt: now,
          outputSize: currentSession?.outputSize ?? 0,
        },
      }
    })
  }, [])

  const markSessionStatus = useCallback(
    (sessionId: string, status: TerminalSessionStatus) => {
      if (ignoredSessionIds.current.has(sessionId)) {
        return
      }

      const now = new Date().toISOString()

      setSessionsById((currentSessions) => {
        const currentSession = currentSessions[sessionId]

        return {
          ...currentSessions,
          [sessionId]: {
            sessionId,
            parentThreadId: currentSession?.parentThreadId,
            chunks: currentSession?.chunks ?? [],
            status,
            startedAt: currentSession?.startedAt ?? now,
            updatedAt: now,
            outputSize: currentSession?.outputSize ?? 0,
          },
        }
      })
    },
    [],
  )

  const clearSessions = useCallback((options: ClearSessionsOptions = {}) => {
    ignoredSessionIds.current = new Set(
      options.ignoreSessionIds?.filter((id): id is string => Boolean(id)) ?? [],
    )
    setSessionsById({})
    nextChunkId.current = 1
  }, [])

  const appendTerminalOutput = useCallback((event: TerminalOutputEvent) => {
    if (
      ignoredSessionIds.current.has(event.sessionId) ||
      (event.parentThreadId && ignoredSessionIds.current.has(event.parentThreadId))
    ) {
      return
    }

    const now = new Date().toISOString()

    setSessionsById((currentSessions) => {
      const currentSession = currentSessions[event.sessionId]
      const parentThreadId = event.parentThreadId ?? currentSession?.parentThreadId
      const currentChunks = currentSession?.chunks ?? []
      const lastChunk = currentChunks[currentChunks.length - 1]
      const shouldMerge = shouldMergeTerminalOutput(lastChunk, event)
      const chunk: TerminalOutputChunk = shouldMerge
        ? {
            ...lastChunk,
            chunk: `${lastChunk.chunk}${event.chunk}`,
            metadata: {
              ...lastChunk.metadata,
              ...event.metadata,
            },
          }
        : {
            ...event,
            id: nextChunkId.current,
            createdAt: now,
          }
      const chunks = shouldMerge
        ? [...currentChunks.slice(0, -1), chunk]
        : [...currentChunks, chunk]

      if (!shouldMerge) {
        nextChunkId.current += 1
      }

      const status =
        currentSession?.status === 'completed' ||
        currentSession?.status === 'error' ||
        currentSession?.status === 'stopped'
          ? currentSession.status
          : 'running'

      return {
        ...currentSessions,
        [event.sessionId]: {
          sessionId: event.sessionId,
          parentThreadId,
          chunks,
          status,
          startedAt: currentSession?.startedAt ?? now,
          updatedAt: now,
          outputSize:
            (currentSession?.outputSize ?? 0) +
            textEncoder.encode(event.chunk).length,
        },
      }
    })
  }, [])

  useEffect(() => {
    const subscribe =
      window.felixo?.cli?.onTerminalOutput ?? window.felixo?.cli?.onRawOutput

    return subscribe?.(appendTerminalOutput)
  }, [appendTerminalOutput])

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
  }
}

function shouldMergeTerminalOutput(
  lastChunk: TerminalOutputChunk | undefined,
  event: TerminalOutputEvent,
) {
  return (
    event.kind === 'assistant' &&
    lastChunk?.kind === 'assistant' &&
    lastChunk.sessionId === event.sessionId &&
    lastChunk.source === event.source &&
    lastChunk.severity === event.severity &&
    getStreamItemId(lastChunk.metadata) === getStreamItemId(event.metadata)
  )
}

function getStreamItemId(
  metadata: TerminalOutputEvent['metadata'] | undefined,
) {
  const value = metadata?.streamItemId

  return typeof value === 'string' ? value : ''
}
